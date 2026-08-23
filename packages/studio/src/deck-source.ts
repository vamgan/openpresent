import ts from 'typescript';
import type { SlideTemplateRecipe } from './templates';

/**
 * Reading and rewriting a deck's TSX. Everything here is a pure function of
 * source text: it holds no Studio state, touches no filesystem, and is where the
 * awkward parts of editing real source live, so the engine can stay a
 * description of authoring operations rather than a parser.
 */

export const PRESENTATION_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

export function sourceFile(path: string, source: string) {
  const kind = path.endsWith('.tsx') ? ts.ScriptKind.TSX
    : path.endsWith('.jsx') ? ts.ScriptKind.JSX
      : path.endsWith('.js') ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  return ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, kind);
}

export function compactText(value: string) { return value.replace(/\s+/g, ' ').trim(); }

export interface TextCandidate {
  path: string;
  oldText: string;
  newText: (value: string) => string;
  /** Exact source span of the text, so a repeated phrase still edits one site. */
  start: number;
  end: number;
  /** Visible JSX children outrank props when both hold the same string. */
  kind: 'jsx-text' | 'jsx-substring' | 'attribute' | 'attribute-substring' | 'literal';
  /** The `<Slide>` this text belongs to, when it sits inside one. */
  slideId?: string;
  /** True for `<Slide>`'s own props, which are metadata rather than slide content. */
  onSlideElement: boolean;
}

export function openingElementOf(node: ts.Node) {
  if (ts.isJsxElement(node)) return node.openingElement;
  if (ts.isJsxSelfClosingElement(node)) return node;
  return undefined;
}

export function jsxTagName(element: ts.JsxOpeningElement | ts.JsxSelfClosingElement, file: ts.SourceFile) {
  return element.tagName.getText(file).split('.').at(-1);
}

export function jsxStringProp(element: ts.JsxOpeningElement | ts.JsxSelfClosingElement, file: ts.SourceFile, name: string) {
  const property = element.attributes.properties.find(
    (candidate): candidate is ts.JsxAttribute => ts.isJsxAttribute(candidate) && candidate.name.getText(file) === name,
  );
  return property?.initializer && ts.isStringLiteral(property.initializer) ? property.initializer.text : undefined;
}

/** Walks up to the enclosing `<Slide>`, reporting whether the node is one of its own props. */
export function slideContext(node: ts.Node, file: ts.SourceFile): { slideId?: string; onSlideElement: boolean } {
  let current: ts.Node | undefined = node;
  let onSlideElement = false;
  while (current) {
    const element = openingElementOf(current);
    if (element && jsxTagName(element, file) === 'Slide') {
      return { slideId: jsxStringProp(element, file, 'id'), onSlideElement };
    }
    if (current.parent && (ts.isJsxOpeningElement(current.parent) || ts.isJsxSelfClosingElement(current.parent))
      && jsxTagName(current.parent, file) === 'Slide') {
      onSlideElement = true;
      return { slideId: jsxStringProp(current.parent, file, 'id'), onSlideElement };
    }
    current = current.parent;
  }
  return { onSlideElement };
}

/**
 * Finds the part of a longer source string that the author actually clicked.
 * Primitives like `TextReveal` render one string as many per-word spans, so the
 * selected element's text is a fragment of the JSX node that produced it and can
 * never match it whole. Only unambiguous fragments qualify: the text must occur
 * exactly once inside the node.
 */
export function substringCandidates(path: string, source: string, selectedText: string): TextCandidate[] {
  const file = sourceFile(path, source);
  const candidates: TextCandidate[] = [];
  const visit = (node: ts.Node) => {
    const isJsxText = ts.isJsxText(node);
    const isLiteral = ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
    if (isJsxText || isLiteral) {
      const nodeStart = node.getStart(file);
      const raw = source.slice(nodeStart, node.getEnd());
      // Start past the opening quote so a literal's delimiters are never rewritten.
      const index = raw.indexOf(selectedText, isJsxText ? 0 : 1);
      const insideBody = isJsxText || (index > 0 && index + selectedText.length < raw.length);
      if (index >= 0 && insideBody && raw.indexOf(selectedText, index + 1) < 0) {
        const quote = isJsxText ? '"' : raw[0];
        candidates.push({
          path,
          oldText: selectedText,
          newText: (value) => (isJsxText
            ? value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
            : value.replaceAll('\\', '\\\\').replaceAll(quote, `\\${quote}`).replaceAll('\n', '\\n')),
          start: nodeStart + index,
          end: nodeStart + index + selectedText.length,
          kind: isJsxText ? 'jsx-substring' : 'attribute-substring',
          ...slideContext(node, file),
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return candidates;
}

export function textCandidates(path: string, source: string, selectedText: string): TextCandidate[] {
  const file = sourceFile(path, source);
  const candidates: TextCandidate[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) {
      const raw = source.slice(node.getStart(file), node.getEnd());
      if (compactText(raw) === selectedText) {
        const leading = raw.match(/^\s*/)?.[0] ?? '';
        const trailing = raw.match(/\s*$/)?.[0] ?? '';
        candidates.push({
          path,
          oldText: raw,
          newText: (value) => `${leading}${value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}${trailing}`,
          start: node.getStart(file),
          end: node.getEnd(),
          kind: 'jsx-text',
          ...slideContext(node, file),
        });
      }
    } else if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && node.text === selectedText) {
      const raw = source.slice(node.getStart(file), node.getEnd());
      if (ts.isJsxAttribute(node.parent) && node.parent.initializer === node) {
        const quote = raw[0] === "'" ? "'" : '"';
        candidates.push({
          path,
          oldText: raw,
          newText: (value) => `${quote}${value.replaceAll('&', '&amp;').replaceAll(quote, quote === '"' ? '&quot;' : '&#39;').replaceAll('<', '&lt;')}${quote}`,
          start: node.getStart(file),
          end: node.getEnd(),
          kind: 'attribute',
          ...slideContext(node, file),
        });
      } else {
        const quote = raw[0] === "'" ? "'" : raw[0] === '`' ? '`' : '"';
        candidates.push({
          path,
          oldText: raw,
          newText: (value) => `${quote}${value
            .replaceAll('\\', '\\\\')
            .replaceAll(quote, `\\${quote}`)
            .replaceAll('\n', '\\n')}${quote}`,
          start: node.getStart(file),
          end: node.getEnd(),
          kind: 'literal',
          ...slideContext(node, file),
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return candidates;
}

/**
 * The same string often appears both as a `<Slide>` prop and in the slide body —
 * inserting the "split" recipe writes "Claim and evidence" twice, for instance.
 * Clicking rendered text unambiguously means the body occurrence, so narrow by
 * the selected slide, then drop `<Slide>`'s own metadata props, then prefer
 * visible children over props. Returns undefined when a single match does not
 * survive, so the caller can still refuse rather than edit the wrong site.
 */
export function narrowToSelected(candidates: TextCandidate[], slideId: string): TextCandidate | undefined {
  const narrow = (pool: TextCandidate[], keep: (item: TextCandidate) => boolean) => {
    const kept = pool.filter(keep);
    return kept.length > 0 && kept.length < pool.length ? kept : pool;
  };
  let pool = candidates;
  if (pool.length > 1) pool = narrow(pool, (item) => item.slideId === slideId);
  if (pool.length > 1) pool = narrow(pool, (item) => !item.onSlideElement);
  if (pool.length > 1) pool = narrow(pool, (item) => item.kind === 'jsx-text' || item.kind === 'jsx-substring');
  return pool.length === 1 ? pool[0] : undefined;
}

/**
 * Guarded edits identify their target by a string that must occur exactly once,
 * so a phrase repeated elsewhere in the file needs surrounding context. Widen
 * the span around the chosen occurrence until it is unique, keeping the guard's
 * safety while still editing the one site the author selected.
 */
export function uniqueGuardedEdit(source: string, candidate: TextCandidate, value: string): { oldText: string; newText: string } {
  const replacement = candidate.newText(value);
  let from = candidate.start;
  let to = candidate.end;
  for (;;) {
    const oldText = source.slice(from, to);
    if (source.split(oldText).length - 1 === 1) {
      return { oldText, newText: `${source.slice(from, candidate.start)}${replacement}${source.slice(candidate.end, to)}` };
    }
    if (from === 0 && to === source.length) {
      return { oldText: source, newText: `${source.slice(0, candidate.start)}${replacement}${source.slice(candidate.end)}` };
    }
    from = Math.max(0, from - 32);
    to = Math.min(source.length, to + 32);
  }
}

export function slideRemoval(source: string, path: string, slideId: string): { oldText: string } {
  const file = sourceFile(path, source);
  const matches: Array<ts.JsxElement | ts.JsxSelfClosingElement> = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      const name = opening.tagName.getText(file).split('.').at(-1);
      const id = opening.attributes.properties.find((property): property is ts.JsxAttribute => ts.isJsxAttribute(property) && property.name.getText(file) === 'id');
      const idValue = id?.initializer && ts.isStringLiteral(id.initializer) ? id.initializer.text : undefined;
      if (name === 'Slide' && idValue === slideId) matches.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  if (matches.length !== 1) throw new Error(`Delete slide expected one <Slide id="${slideId}"> in ${path}, found ${matches.length}.`);
  const node = matches[0];
  let start = node.getStart(file);
  let end = node.getEnd();
  let cursor = end;
  while (/\s/.test(source[cursor] ?? '')) cursor += 1;
  if (source[cursor] === ',') {
    cursor += 1;
    while (/\s/.test(source[cursor] ?? '')) cursor += 1;
    end = cursor;
  } else {
    cursor = start - 1;
    while (cursor >= 0 && /\s/.test(source[cursor] ?? '')) cursor -= 1;
    if (source[cursor] === ',') start = cursor;
  }
  return { oldText: source.slice(start, end) };
}

export function slug(value: string) {
  return value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'slide';
}

export function withComponentImports(source: string, path: string, names: readonly string[]): string {
  if (names.length === 0) return source;
  const file = sourceFile(path, source);
  const imports = file.statements.filter(ts.isImportDeclaration);
  const declaration = imports.find((node) => ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === '@openpresent/components');
  if (declaration?.importClause?.namedBindings && ts.isNamedImports(declaration.importClause.namedBindings)) {
    const existing = new Set(declaration.importClause.namedBindings.elements.map((element) => element.name.text));
    const missing = names.filter((name) => !existing.has(name));
    if (missing.length === 0) return source;
    const position = declaration.importClause.namedBindings.getEnd() - 1;
    const separator = declaration.importClause.namedBindings.elements.length > 0 ? ', ' : '';
    return `${source.slice(0, position)}${separator}${missing.join(', ')}${source.slice(position)}`;
  }
  const statement = `import { ${names.join(', ')} } from '@openpresent/components';\n`;
  const position = imports.at(-1)?.getEnd() ?? 0;
  return `${source.slice(0, position)}${position ? '\n' : ''}${statement}${source.slice(position)}`;
}

export function withInsertedSlide(source: string, path: string, template: SlideTemplateRecipe, slideId: string): string {
  const withImports = withComponentImports(source, path, template.imports);
  const file = sourceFile(path, withImports);
  let slides: ts.ArrayLiteralExpression | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isPropertyAssignment(node) && node.name.getText(file).replace(/["']/g, '') === 'slides' && ts.isArrayLiteralExpression(node.initializer)) {
      slides ??= node.initializer;
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  if (!slides) throw new Error('Could not find a serializable slides array in the authoritative deck entry.');
  const slide = `<Slide id=${JSON.stringify(slideId)} title=${JSON.stringify(template.defaultTitle)} transition="fade">\n      ${template.body}\n    </Slide>`;
  const position = slides.getEnd() - 1;
  const before = withImports.slice(0, position);
  const hasElements = slides.elements.length > 0;
  const trailingComma = /,\s*$/.test(before);
  const insertion = hasElements ? (trailingComma ? `\n    ${slide},` : `,\n    ${slide}`) : `\n    ${slide},\n  `;
  return `${before}${insertion}${withImports.slice(position)}`;
}
