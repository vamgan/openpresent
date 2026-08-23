import { resolveConfig, resultFromDiagnostics, type ValidatorConfigInput } from './config';
import type { Diagnostic, DiagnosticSeverity, RuleId, ValidatorConfig } from './types';

/**
 * Collect browser diagnostics with one serializable rule implementation. The
 * function intentionally keeps its helpers inside its body so Playwright can
 * execute this exact code in a page instead of maintaining a second rule set.
 */
export function collectDomDiagnostics(settings: ValidatorConfig, root: ParentNode = document): Diagnostic[] {
  const output: Diagnostic[] = [];
  const seen = new Set<string>();
  const ignoredSelector = '[hidden], [aria-hidden="true"], [data-op-validate-ignore], .op-sr-only, .op-animated-background';
  const skippedTags = new Set(['script', 'style', 'title', 'desc', 'defs', 'metadata']);

  const enabled = (ruleId: RuleId) =>
    !settings.disabledRules.includes(ruleId) && settings.severities[ruleId] !== 'off';
  const severity = (ruleId: RuleId, fallback: DiagnosticSeverity) =>
    settings.severities[ruleId] === 'off' ? fallback : settings.severities[ruleId] ?? fallback;
  const describe = (element: Element) => {
    const id = element.id ? `#${element.id}` : '';
    const classes = [...element.classList].slice(0, 2).map((name) => `.${name}`).join('');
    return `${element.tagName.toLowerCase()}${id}${classes}`;
  };
  const push = (diagnostic: Diagnostic) => {
    if (!enabled(diagnostic.ruleId)) return;
    const configured = { ...diagnostic, severity: severity(diagnostic.ruleId, diagnostic.severity) };
    const key = [configured.ruleId, configured.severity, configured.slideId, configured.element, configured.message].join('|');
    if (!seen.has(key)) {
      seen.add(key);
      output.push(configured);
    }
  };
  const isVisible = (element: Element, rect = element.getBoundingClientRect()) => {
    if (rect.width <= 0 || rect.height <= 0 || element.closest(ignoredSelector)) return false;
    let current: Element | null = element;
    while (current) {
      const style = getComputedStyle(current);
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || Number(style.opacity || 1) <= 0) {
        return false;
      }
      current = current.parentElement;
    }
    return true;
  };
  const hasOwnText = (element: Element) => [...element.childNodes].some(
    (node) => node.nodeType === Node.TEXT_NODE && Boolean(node.textContent?.trim()),
  );
  const isTextLeaf = (element: Element) => {
    const tag = element.tagName.toLowerCase();
    if (skippedTags.has(tag) || !element.textContent?.trim()) return false;
    return tag === 'text' || tag === 'tspan' || hasOwnText(element) || element.childElementCount === 0;
  };
  const area = (rect: DOMRect) => Math.max(0, rect.width) * Math.max(0, rect.height);
  const overlapRatio = (first: DOMRect, second: DOMRect) => {
    const width = Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left));
    const height = Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top));
    return (width * height) / Math.max(1, Math.min(area(first), area(second)));
  };

  const slides = [...root.querySelectorAll<HTMLElement>('[data-openpresent-slide]')];
  for (const slide of slides) {
    const slideId = slide.dataset.openpresentSlide || slide.id || undefined;
    const bounds = slide.getBoundingClientRect();
    const descendants = [...slide.querySelectorAll<Element>('*')];
    const textElements = descendants.filter((element) => isTextLeaf(element) && isVisible(element));
    const inspected = new Set<Element>([
      ...textElements,
      ...slide.querySelectorAll<Element>(
        '[data-op-validate], [data-openpresent-element], h1, h2, h3, h4, h5, h6, p, li, blockquote, figcaption, img, svg, pre, code, button',
      ),
    ]);

    for (const element of inspected) {
      const rect = element.getBoundingClientRect();
      if (!isVisible(element, rect)) continue;
      const name = describe(element);
      const tolerance = settings.viewportPadding + 0.5;
      if (
        rect.left < bounds.left - tolerance || rect.top < bounds.top - tolerance ||
        rect.right > bounds.right + tolerance || rect.bottom > bounds.bottom + tolerance
      ) {
        push({
          ruleId: 'dom.off-canvas', severity: 'error', slideId, element: name,
          message: `${name} extends beyond the slide canvas.`,
          hint: `Move or resize the element so it remains inside the stage, allowing ${settings.viewportPadding}px viewport padding.`,
        });
      }
      const style = getComputedStyle(element);
      const overflowX = style.overflowX || style.overflow;
      const overflowY = style.overflowY || style.overflow;
      const clipsX = overflowX !== 'visible' && element.scrollWidth > element.clientWidth + 1;
      const clipsY = overflowY !== 'visible' && element.scrollHeight > element.clientHeight + 1;
      if (clipsX || clipsY) {
        push({
          ruleId: 'dom.overflow', severity: 'warning', slideId, element: name,
          message: `${name} clips or scrolls overflowing content.`,
          hint: 'Increase the container size, reduce content, or mark an intentional decorative layer with data-op-validate-ignore.',
        });
      }
    }

    for (const element of textElements) {
      const fontSize = Number.parseFloat(getComputedStyle(element).fontSize);
      if (Number.isFinite(fontSize) && fontSize < settings.minFontSize) {
        const name = describe(element);
        push({
          ruleId: 'dom.tiny-text', severity: 'warning', slideId, element: name,
          message: `${name} uses ${fontSize}px text, below the ${settings.minFontSize}px presentation threshold.`,
          hint: 'Raise the font size or move dense supporting detail to speaker notes.',
        });
      }
    }

    const annotated = [...slide.querySelectorAll<Element>('[data-op-validate], [data-openpresent-element]')]
      .filter((element) => isVisible(element));
    const collisionCandidates = (annotated.length > 1 ? annotated : [...slide.children])
      .filter((element) => {
        if (!isVisible(element) || element.closest(ignoredSelector)) return false;
        if (annotated.length > 1) return true;
        const position = getComputedStyle(element).position;
        return position !== 'absolute' && position !== 'fixed';
      })
      .map((element) => ({ element, rect: element.getBoundingClientRect() }));

    for (let firstIndex = 0; firstIndex < collisionCandidates.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < collisionCandidates.length; secondIndex += 1) {
        const first = collisionCandidates[firstIndex];
        const second = collisionCandidates[secondIndex];
        if (first.element.contains(second.element) || second.element.contains(first.element)) continue;
        const ratio = overlapRatio(first.rect, second.rect);
        if (ratio >= settings.collisionOverlapRatio) {
          push({
            ruleId: 'dom.collision', severity: 'warning', slideId,
            element: `${describe(first.element)} + ${describe(second.element)}`,
            message: `Two peer layout elements overlap by ${Math.round(ratio * 100)}%.`,
            hint: 'Separate unintentional peer collisions; mark stage backgrounds and decorative overlays with data-op-validate-ignore.',
          });
        }
      }
    }

    const densityElements = new Set<Element>();
    for (const element of textElements) densityElements.add(element.closest('pre') ?? element);
    for (const element of slide.querySelectorAll<Element>('img, svg, pre, [data-op-validate]')) {
      if (isVisible(element)) densityElements.add(element.closest('pre') ?? element);
    }
    if (densityElements.size > settings.maxElementsPerSlide) {
      push({
        ruleId: 'dom.density', severity: 'warning', slideId,
        message: `Slide contains ${densityElements.size} visible content elements, above the configured limit of ${settings.maxElementsPerSlide}.`,
        hint: 'Split the narrative across slides or remove secondary detail.',
      });
    }
  }

  return output;
}

export function validateDom(root: ParentNode, input: ValidatorConfigInput = {}) {
  return resultFromDiagnostics(collectDomDiagnostics(resolveConfig(input), root));
}
