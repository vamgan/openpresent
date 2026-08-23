import ts from 'typescript';
import { createDiagnostic, resolveConfig, resultFromDiagnostics, type ValidatorConfigInput } from './config';
import type { Diagnostic, ModelDeck, ModelSlide, StructuredPrimitive } from './types';

const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
const UNRESOLVED = Symbol('unresolved');

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateStructure(structure: StructuredPrimitive): string | undefined {
  if (!isRecord(structure) || !hasText(structure.type)) return 'Structured primitive requires a supported type.';
  if (structure.type === 'chart') {
    if (!Array.isArray(structure.data) || structure.data.length === 0) return 'Chart data must be a non-empty array.';
    if (structure.data.some((item) => !isRecord(item) || !hasText(item.label) || typeof item.value !== 'number' || !Number.isFinite(item.value))) {
      return 'Each chart datum needs a label and finite numeric value.';
    }
    return;
  }
  if (structure.type === 'timeline') {
    if (!Array.isArray(structure.items) || structure.items.length === 0) return 'Timeline items must be a non-empty array.';
    const ids = new Set<string>();
    for (const item of structure.items) {
      if (!isRecord(item) || !hasText(item.id) || !hasText(item.title)) return 'Each timeline item needs an id and title.';
      if (ids.has(item.id as string)) return `Timeline item ID "${item.id}" is duplicated.`;
      ids.add(item.id as string);
    }
    return;
  }
  if (structure.type === 'comparison') {
    const validSide = (side: unknown) => isRecord(side) && hasText(side.title) && Array.isArray(side.items) && side.items.length > 0 && side.items.every(hasText);
    return validSide(structure.left) && validSide(structure.right)
      ? undefined
      : 'Comparison requires left and right sides with a title and non-empty text items.';
  }
  if (structure.type === 'flow') {
    if (!Array.isArray(structure.nodes) || structure.nodes.length === 0 || !Array.isArray(structure.edges)) {
      return 'Flow requires a non-empty nodes array and an edges array.';
    }
    const ids = new Set<string>();
    for (const node of structure.nodes) {
      if (!isRecord(node) || !hasText(node.id) || !hasText(node.label)) return 'Each flow node needs an id and label.';
      if (ids.has(node.id as string)) return `Flow node ID "${node.id}" is duplicated.`;
      ids.add(node.id as string);
    }
    for (const edge of structure.edges) {
      if (!isRecord(edge) || !hasText(edge.from) || !hasText(edge.to) || !ids.has(edge.from as string) || !ids.has(edge.to as string)) {
        return 'Every flow edge must reference existing node IDs in from and to.';
      }
    }
    return;
  }
  return `Unsupported structured primitive type "${String((structure as { type?: unknown }).type)}".`;
}

export function validateModel(deck: ModelDeck, input: ValidatorConfigInput = {}) {
  const config = resolveConfig(input);
  const diagnostics: Diagnostic[] = [];
  const push = (diagnostic: Diagnostic | undefined) => { if (diagnostic) diagnostics.push(diagnostic); };
  const slides = Array.isArray(deck.slides) ? deck.slides : [];

  if (slides.length === 0) {
    push(createDiagnostic(config, 'model.empty-deck', 'error', {
      message: 'The deck has no slides.',
      hint: 'Add at least one <Slide id="..." title="..."> element.',
    }));
  }

  const seen = new Set<string>();
  slides.forEach((slide, index) => {
    const id = slide.id?.trim();
    if (!id || !ID_PATTERN.test(id)) {
      push(createDiagnostic(config, 'model.invalid-slide-id', 'error', {
        slideId: id || undefined,
        message: `Slide ${index + 1} has ${id ? `invalid ID "${id}"` : 'no ID'}.`,
        hint: 'Use a unique ID containing letters, numbers, hyphens, or underscores.',
      }));
    } else if (seen.has(id)) {
      push(createDiagnostic(config, 'model.duplicate-slide-id', 'error', {
        slideId: id,
        message: `Slide ID "${id}" is used more than once.`,
        hint: 'Rename this slide so every URL hash resolves to exactly one slide.',
      }));
    } else seen.add(id);

    if (!hasText(slide.title) && !hasText(slide.label)) {
      push(createDiagnostic(config, 'model.missing-slide-label', 'warning', {
        slideId: id,
        message: `Slide "${id || index + 1}" has no title or accessible label.`,
        hint: 'Add a concise title or label prop that describes the slide.',
      }));
    }

    slide.structures?.forEach((structure) => {
      const issue = validateStructure(structure);
      if (issue) push(createDiagnostic(config, 'model.invalid-structured-data', 'error', {
        slideId: id,
        message: issue,
        hint: 'Check the primitive’s documented serializable data shape and referenced IDs.',
      }));
    });
  });

  return resultFromDiagnostics(diagnostics);
}

function propertyName(node: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return node.text;
  if (ts.isComputedPropertyName(node) && (ts.isStringLiteral(node.expression) || ts.isNumericLiteral(node.expression))) {
    return node.expression.text;
  }
  return undefined;
}

export function extractModelFromSource(source: string, fileName = 'deck.tsx'): ModelDeck {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declarations = new Map<string, ts.Expression>();
  const resolving = new Set<string>();

  const collectDeclarations = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      declarations.set(node.name.text, node.initializer);
    }
    ts.forEachChild(node, collectDeclarations);
  };
  collectDeclarations(sourceFile);

  const evaluate = (expression: ts.Expression): unknown | typeof UNRESOLVED => {
    if (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression) || ts.isTypeAssertionExpression(expression) || ts.isNonNullExpression(expression) || ts.isSatisfiesExpression(expression)) {
      return evaluate(expression.expression);
    }
    if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) return expression.text;
    if (ts.isNumericLiteral(expression)) return Number(expression.text);
    if (expression.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (expression.kind === ts.SyntaxKind.FalseKeyword) return false;
    if (expression.kind === ts.SyntaxKind.NullKeyword) return null;
    if (ts.isIdentifier(expression)) {
      if (expression.text === 'undefined') return undefined;
      if (expression.text === 'NaN') return Number.NaN;
      if (expression.text === 'Infinity') return Number.POSITIVE_INFINITY;
      const declaration = declarations.get(expression.text);
      if (!declaration || resolving.has(expression.text)) return UNRESOLVED;
      resolving.add(expression.text);
      const value = evaluate(declaration);
      resolving.delete(expression.text);
      return value;
    }
    if (ts.isPropertyAccessExpression(expression) && expression.expression.getText(sourceFile) === 'Number') {
      if (expression.name.text === 'NaN') return Number.NaN;
      if (expression.name.text === 'POSITIVE_INFINITY') return Number.POSITIVE_INFINITY;
      if (expression.name.text === 'NEGATIVE_INFINITY') return Number.NEGATIVE_INFINITY;
    }
    if (ts.isPrefixUnaryExpression(expression)) {
      const value = evaluate(expression.operand);
      if (typeof value !== 'number') return UNRESOLVED;
      if (expression.operator === ts.SyntaxKind.MinusToken) return -value;
      if (expression.operator === ts.SyntaxKind.PlusToken) return value;
      return UNRESOLVED;
    }
    if (ts.isArrayLiteralExpression(expression)) {
      const array: unknown[] = [];
      for (const item of expression.elements) {
        if (ts.isSpreadElement(item)) {
          const spread = evaluate(item.expression);
          if (!Array.isArray(spread)) return UNRESOLVED;
          array.push(...spread);
        } else {
          const value = evaluate(item);
          if (value === UNRESOLVED) return UNRESOLVED;
          array.push(value);
        }
      }
      return array;
    }
    if (ts.isObjectLiteralExpression(expression)) {
      const object: Record<string, unknown> = {};
      for (const item of expression.properties) {
        if (ts.isSpreadAssignment(item)) {
          const spread = evaluate(item.expression);
          if (!isRecord(spread)) return UNRESOLVED;
          Object.assign(object, spread);
        } else if (ts.isPropertyAssignment(item)) {
          const name = propertyName(item.name);
          const value = evaluate(item.initializer);
          if (name === undefined || value === UNRESOLVED) return UNRESOLVED;
          object[name] = value;
        } else if (ts.isShorthandPropertyAssignment(item)) {
          const value = evaluate(item.name);
          if (value === UNRESOLVED) return UNRESOLVED;
          object[item.name.text] = value;
        } else {
          return UNRESOLVED;
        }
      }
      return object;
    }
    if (ts.isTemplateExpression(expression)) {
      let value = expression.head.text;
      for (const span of expression.templateSpans) {
        const substitution = evaluate(span.expression);
        if (substitution === UNRESOLVED || (typeof substitution === 'object' && substitution !== null)) return UNRESOLVED;
        value += `${String(substitution)}${span.literal.text}`;
      }
      return value;
    }
    if (ts.isBinaryExpression(expression)) {
      const left = evaluate(expression.left);
      const right = evaluate(expression.right);
      if (left === UNRESOLVED || right === UNRESOLVED) return UNRESOLVED;
      switch (expression.operatorToken.kind) {
        case ts.SyntaxKind.PlusToken:
          if (typeof left === 'number' && typeof right === 'number') return left + right;
          if (typeof left === 'string' || typeof right === 'string') return `${String(left)}${String(right)}`;
          return UNRESOLVED;
        case ts.SyntaxKind.MinusToken: return typeof left === 'number' && typeof right === 'number' ? left - right : UNRESOLVED;
        case ts.SyntaxKind.AsteriskToken: return typeof left === 'number' && typeof right === 'number' ? left * right : UNRESOLVED;
        case ts.SyntaxKind.SlashToken: return typeof left === 'number' && typeof right === 'number' ? left / right : UNRESOLVED;
        default: return UNRESOLVED;
      }
    }
    return UNRESOLVED;
  };

  const attribute = (attributes: ts.JsxAttributes, name: string): { present: boolean; value: unknown | typeof UNRESOLVED } => {
    const item = attributes.properties.find((property) => ts.isJsxAttribute(property) && property.name.getText(sourceFile) === name);
    if (!item || !ts.isJsxAttribute(item)) return { present: false, value: undefined };
    if (!item.initializer) return { present: true, value: true };
    if (ts.isStringLiteral(item.initializer)) return { present: true, value: item.initializer.text };
    if (ts.isJsxExpression(item.initializer) && item.initializer.expression) {
      return { present: true, value: evaluate(item.initializer.expression) };
    }
    return { present: true, value: UNRESOLVED };
  };
  const tag = (opening: ts.JsxOpeningLikeElement) => opening.tagName.getText(sourceFile).split('.').at(-1) ?? '';
  const attributes = (node: ts.Node): ts.JsxAttributes | undefined => {
    if (ts.isJsxElement(node)) return node.openingElement.attributes;
    if (ts.isJsxSelfClosingElement(node)) return node.attributes;
    return undefined;
  };

  const slides: ModelSlide[] = [];
  const visit = (node: ts.Node, activeSlide?: ModelSlide) => {
    const jsxAttributes = attributes(node);
    let slide = activeSlide;
    if (jsxAttributes) {
      const component = tag(ts.isJsxElement(node) ? node.openingElement : node as ts.JsxSelfClosingElement);
      if (component === 'Slide') {
        const id = attribute(jsxAttributes, 'id').value;
        const title = attribute(jsxAttributes, 'title').value;
        const label = attribute(jsxAttributes, 'label').value;
        slide = {
          id: typeof id === 'string' ? id : undefined,
          title: typeof title === 'string' ? title : undefined,
          label: typeof label === 'string' ? label : undefined,
          structures: [],
        };
        slides.push(slide);
      } else if (slide) {
        const prop = (name: string) => attribute(jsxAttributes, name);
        let structure: StructuredPrimitive | undefined;
        if (['BarChart', 'LineChart', 'DonutChart', 'Chart'].includes(component)) {
          const data = prop('data');
          if (!data.present || data.value !== UNRESOLVED) structure = { type: 'chart', data: data.value };
        } else if (component === 'Timeline') {
          const items = prop('items');
          if (!items.present || items.value !== UNRESOLVED) structure = { type: 'timeline', items: items.value };
        } else if (component === 'Comparison') {
          const left = prop('left');
          const right = prop('right');
          if ((!left.present || left.value !== UNRESOLVED) && (!right.present || right.value !== UNRESOLVED)) {
            structure = { type: 'comparison', left: left.value, right: right.value };
          }
        } else if (component === 'Flow' || component === 'Architecture') {
          const nodes = prop('nodes');
          const edges = prop('edges');
          if ((!nodes.present || nodes.value !== UNRESOLVED) && (!edges.present || edges.value !== UNRESOLVED)) {
            structure = { type: 'flow', nodes: nodes.value, edges: edges.value };
          }
        }
        if (structure) slide.structures?.push(structure);
      }
    }
    ts.forEachChild(node, (child) => visit(child, slide));
  };
  visit(sourceFile);

  return { slides };
}

export function validateSource(source: string, input: ValidatorConfigInput = {}, fileName = 'deck.tsx') {
  return validateModel(extractModelFromSource(source, fileName), input);
}
