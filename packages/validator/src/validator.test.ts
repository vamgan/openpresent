// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { validateDom } from './dom';
import { extractModelFromSource, validateModel, validateSource } from './model';
import { validateTarget } from './target';

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) } as DOMRect;
}

function fixture() {
  document.body.innerHTML = '<section id="slide" data-openpresent-slide="slide"></section>';
  const slide = document.querySelector<HTMLElement>('section')!;
  slide.getBoundingClientRect = () => rect(0, 0, 1600, 900);
  return slide;
}

function visible(element: Element, bounds: DOMRect) {
  element.getBoundingClientRect = () => bounds;
  Object.defineProperty(element, 'clientWidth', { configurable: true, value: bounds.width });
  Object.defineProperty(element, 'clientHeight', { configurable: true, value: bounds.height });
  Object.defineProperty(element, 'scrollWidth', { configurable: true, value: bounds.width });
  Object.defineProperty(element, 'scrollHeight', { configurable: true, value: bounds.height });
}

describe('model validation', () => {
  it('accepts a clean model and source', () => {
    expect(validateModel({ slides: [{ id: 'opening', title: 'Opening' }] })).toMatchObject({ valid: true, diagnostics: [] });
    expect(validateSource('<Slide id="opening" title="Opening">Hello</Slide>')).toMatchObject({ valid: true });
    expect(validateSource('const example = `<Slide id="opening" />`; <Slide id="opening" title="Opening" />')).toMatchObject({ valid: true });
  });

  it('detects empty decks, invalid and duplicate IDs, and missing labels', () => {
    expect(validateModel({ slides: [] }).diagnostics.map((item) => item.ruleId)).toContain('model.empty-deck');
    const result = validateModel({ slides: [{ id: 'bad id' }, { id: 'same' }, { id: 'same', title: 'Again' }] });
    expect(result.diagnostics.map((item) => item.ruleId)).toEqual(expect.arrayContaining([
      'model.invalid-slide-id', 'model.duplicate-slide-id', 'model.missing-slide-label',
    ]));
    expect(result.valid).toBe(false);
  });

  it.each([
    { type: 'chart' as const, data: [{ label: '', value: Number.NaN }] },
    { type: 'timeline' as const, items: [{ id: 'a', title: '' }] },
    { type: 'comparison' as const, left: {}, right: {} },
    { type: 'flow' as const, nodes: [{ id: 'a', label: 'A' }], edges: [{ from: 'a', to: 'missing' }] },
  ])('detects invalid $type structured data', (structure) => {
    const result = validateModel({ slides: [{ id: 'slide', title: 'Slide', structures: [structure] }] });
    expect(result.diagnostics[0]).toMatchObject({ ruleId: 'model.invalid-structured-data', severity: 'error', slideId: 'slide' });
    expect(result.diagnostics[0].hint).toBeTruthy();
  });

  it('extracts serializable structured props from normal TSX', async () => {
    const fixturePath = resolve(process.cwd(), 'packages/validator/test-fixtures/structured-clean.tsx');
    expect(await validateTarget(fixturePath)).toMatchObject({ valid: true, diagnostics: [] });
  });

  it.each(['chart', 'timeline', 'comparison', 'flow'])('reports invalid %s props from a TSX fixture', async (type) => {
    const fixturePath = resolve(process.cwd(), `packages/validator/test-fixtures/invalid-${type}.tsx`);
    const result = await validateTarget(fixturePath);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      ruleId: 'model.invalid-structured-data', severity: 'error', slideId: type,
    }));
  });

  it('ignores JSX-shaped strings while preserving executable slide structure', () => {
    const model = extractModelFromSource('const sample = `<Slide id="fake" />`; export const view = <Slide id="real" title="Real" />;');
    expect(model.slides).toEqual([{ id: 'real', title: 'Real', label: undefined, structures: [] }]);
  });

  it('supports disabled rules and severity overrides', () => {
    const result = validateModel({ slides: [{ id: 'slide' }] }, {
      disabledRules: ['model.missing-slide-label'],
      severities: { 'model.invalid-slide-id': 'warning' },
    });
    expect(result.diagnostics).toEqual([]);
  });
});

describe('DOM validation', () => {
  it('detects off-canvas elements', () => {
    const slide = fixture();
    const element = document.createElement('div');
    element.dataset.opValidate = '';
    slide.append(element);
    visible(element, rect(1500, 100, 200, 100));
    expect(validateDom(document).diagnostics).toContainEqual(expect.objectContaining({ ruleId: 'dom.off-canvas', slideId: 'slide' }));
  });

  it('detects overflow and tiny text', () => {
    const slide = fixture();
    const element = document.createElement('p');
    element.dataset.opValidate = '';
    element.textContent = 'Small overflowing text';
    element.style.fontSize = '12px';
    element.style.overflow = 'hidden';
    slide.append(element);
    visible(element, rect(20, 20, 300, 60));
    Object.defineProperty(element, 'scrollWidth', { configurable: true, value: 500 });
    const rules = validateDom(document).diagnostics.map((item) => item.ruleId);
    expect(rules).toEqual(expect.arrayContaining(['dom.overflow', 'dom.tiny-text']));
  });

  it('detects likely collisions', () => {
    const slide = fixture();
    const first = document.createElement('div');
    const second = document.createElement('div');
    first.dataset.opValidate = ''; second.dataset.opValidate = '';
    slide.append(first, second);
    visible(first, rect(100, 100, 400, 300));
    visible(second, rect(140, 120, 400, 300));
    expect(validateDom(document).diagnostics).toContainEqual(expect.objectContaining({ ruleId: 'dom.collision' }));
  });

  it('detects excessive density with a configurable limit', () => {
    const slide = fixture();
    slide.innerHTML = '<p>One</p><p>Two</p><p>Three</p>';
    slide.querySelectorAll<HTMLElement>('p').forEach((element, index) => visible(element, rect(20, 20 + index * 40, 200, 30)));
    expect(validateDom(document, { maxElementsPerSlide: 2 }).diagnostics).toContainEqual(expect.objectContaining({ ruleId: 'dom.density' }));
  });

  it('checks nested leaf text and SVG text with the same visibility rules', () => {
    const slide = fixture();
    slide.innerHTML = '<div><strong><span id="nested">Nested</span></strong></div><svg><text id="svg-text">Vector</text></svg><span id="hidden" aria-hidden="true">Ignore</span>';
    const nested = slide.querySelector<HTMLElement>('#nested')!;
    const vector = slide.querySelector<SVGTextElement>('#svg-text')!;
    const hidden = slide.querySelector<HTMLElement>('#hidden')!;
    nested.style.fontSize = '12px';
    vector.style.fontSize = '13px';
    hidden.style.fontSize = '10px';
    visible(nested, rect(20, 20, 100, 24));
    visible(vector, rect(20, 60, 100, 24));
    visible(hidden, rect(20, 100, 100, 24));
    const tiny = validateDom(document).diagnostics.filter((item) => item.ruleId === 'dom.tiny-text');
    expect(tiny.map((item) => item.element)).toEqual(expect.arrayContaining(['span#nested', 'text#svg-text']));
    expect(tiny.map((item) => item.element)).not.toContain('span#hidden');
  });

  it('honors viewport padding and ignores intentional absolute backgrounds for collisions', () => {
    const slide = fixture();
    const content = document.createElement('div');
    content.dataset.opValidate = '';
    const background = document.createElement('div');
    background.className = 'op-animated-background';
    background.style.position = 'absolute';
    slide.append(background, content);
    visible(background, rect(-4, 0, 1608, 900));
    visible(content, rect(-4, 100, 300, 100));
    expect(validateDom(document, { viewportPadding: 5 }).diagnostics).toEqual([]);
    expect(validateDom(document, { viewportPadding: 0 }).diagnostics).toContainEqual(expect.objectContaining({ ruleId: 'dom.off-canvas' }));
  });

  it('returns a clean result for readable content inside the canvas', () => {
    const slide = fixture();
    const element = document.createElement('p');
    element.dataset.opValidate = '';
    element.textContent = 'Readable';
    element.style.fontSize = '24px';
    slide.append(element);
    visible(element, rect(100, 100, 400, 60));
    expect(validateDom(document)).toMatchObject({ valid: true, diagnostics: [] });
  });
});
