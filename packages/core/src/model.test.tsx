import { describe, expect, it } from 'vitest';
import { Slide } from './Slide';
import { defineDeck } from './model';
import { defaultTheme, mergeTheme, themeToCssVariables } from './theme';

describe('defineDeck', () => {
  it('preserves typed metadata, arbitrary React children, and stable slide IDs', () => {
    const deck = defineDeck({
      metadata: { id: 'demo', title: 'Demo', data: { audience: 'developers' } },
      slides: [<Slide id="first" title="First"><article data-custom>Freeform</article></Slide>],
    });
    expect(deck.slideIds).toEqual(['first']);
    expect(deck.slides[0].props.children).toMatchObject({ type: 'article' });
    expect(Object.isFrozen(deck.slideIds)).toBe(true);
  });

  it('returns actionable errors for empty, missing, malformed, and duplicate IDs', () => {
    expect(() => defineDeck({ metadata: { id: 'x', title: 'X' }, slides: [] })).toThrow('at least one');
    expect(() => defineDeck({ metadata: { id: 'x', title: 'X' }, slides: [<Slide id="" />] })).toThrow('non-empty');
    expect(() => defineDeck({ metadata: { id: 'x', title: 'X' }, slides: [<Slide id="bad id" />] })).toThrow('invalid');
    expect(() => defineDeck({ metadata: { id: 'x', title: 'X' }, slides: [<Slide id="same" />, <Slide id="same" />] })).toThrow('duplicate slide ID "same"');
  });
});

describe('theme', () => {
  it('deep-merges partial overrides without discarding defaults', () => {
    const theme = mergeTheme({ colors: { accent: '#ff5d50' }, stage: { padding: 100 } });
    expect(theme.colors.accent).toBe('#ff5d50');
    expect(theme.colors.background).toBe(defaultTheme.colors.background);
    expect(theme.stage.padding).toBe(100);
    expect(theme.typography.fontFamily).toBeTruthy();
  });

  it('maps semantic tokens to CSS custom properties', () => {
    const variables = themeToCssVariables(mergeTheme());
    expect(variables).toMatchObject({
      '--op-color-accent': defaultTheme.colors.accent,
      '--op-stage-padding': `${defaultTheme.stage.padding}px`,
    });
  });
});
