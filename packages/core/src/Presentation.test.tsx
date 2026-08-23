// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineDeck } from './model';
import { Presentation, resolveTransition } from './Presentation';
import { Slide } from './Slide';

const deck = defineDeck({
  metadata: { id: 'runtime', title: 'Runtime test' },
  slides: [
    <Slide id="first" title="First"><input aria-label="Editable" /></Slide>,
    <Slide id="second" title="Second"><p>Second content</p></Slide>,
    <Slide id="third" label="Third label"><p>Third content</p></Slide>,
  ],
});

describe('Presentation', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 760 });
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: true });
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
    HTMLElement.prototype.requestFullscreen = vi.fn().mockResolvedValue(undefined);
  });

  it('resolves a hash naming a slide the deck gains later', () => {
    // A rail thumbnail opens at #added while its module still predates the
    // insert, so the deck arrives with the slide only on the next render.
    window.history.replaceState(null, '', '#added');
    const { rerender } = render(<Presentation deck={deck} />);
    expect(screen.getByTestId('presentation')).toHaveAttribute('data-slide-id', 'first');
    // The unmet request must survive rather than being rewritten to slide one.
    expect(window.location.hash).toBe('#added');

    const grown = defineDeck({
      metadata: { id: 'runtime', title: 'Runtime test' },
      slides: [
        <Slide id="first" title="First"><p>First content</p></Slide>,
        <Slide id="added" title="Added"><p>Added content</p></Slide>,
      ],
    });
    rerender(<Presentation deck={grown} />);
    expect(screen.getByTestId('presentation')).toHaveAttribute('data-slide-id', 'added');
    expect(window.location.hash).toBe('#added');
  });

  it('restores a direct hash and renders an accessible fixed-aspect stage', () => {
    window.history.replaceState(null, '', '#second');
    render(<Presentation deck={deck} />);
    const runtime = screen.getByTestId('presentation');
    const shell = runtime.querySelector('.op-stage-shell');
    expect(runtime).toHaveAttribute('data-slide-id', 'second');
    expect(runtime).toHaveAttribute('data-openpresent-slide-count', '3');
    expect(runtime).toHaveAttribute('data-openpresent-slide-ids', '["first","second","third"]');
    expect(shell).toHaveAttribute('data-logical-width', '1600');
    expect(shell).toHaveAttribute('data-logical-height', '900');
    expect(screen.getByRole('group', { name: 'Second' })).toBeInTheDocument();
    expect(shell?.getAttribute('style')).toContain('width:');
  });

  it('navigates by keyboard, buttons, Home/End, and clamps bounds', () => {
    render(<Presentation deck={deck} />);
    const runtime = screen.getByTestId('presentation');
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(runtime).toHaveAttribute('data-slide-id', 'second');
    expect(window.location.hash).toBe('#second');
    fireEvent.keyDown(window, { key: 'End' });
    expect(runtime).toHaveAttribute('data-slide-id', 'third');
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(runtime).toHaveAttribute('data-slide-id', 'third');
    fireEvent.keyDown(window, { key: 'Home' });
    expect(runtime).toHaveAttribute('data-slide-id', 'first');
    expect(screen.getByRole('button', { name: 'Previous slide' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Next slide' }));
    expect(runtime).toHaveAttribute('data-slide-id', 'second');
  });

  it('ignores navigation shortcuts originating in editable content', () => {
    render(<Presentation deck={deck} />);
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Editable' }), { key: ' ' });
    expect(screen.getByTestId('presentation')).toHaveAttribute('data-slide-id', 'first');
  });

  it('exposes a visible fullscreen affordance and F shortcut', () => {
    render(<Presentation deck={deck} />);
    const button = screen.getByRole('button', { name: 'Enter fullscreen' });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(HTMLElement.prototype.requestFullscreen).toHaveBeenCalledOnce();
    fireEvent.keyDown(window, { key: 'f' });
    expect(HTMLElement.prototype.requestFullscreen).toHaveBeenCalledTimes(2);
  });

  it('responds to hash changes and safely falls back for invalid hashes', () => {
    render(<Presentation deck={deck} />);
    window.location.hash = '#third';
    fireEvent(window, new HashChangeEvent('hashchange'));
    expect(screen.getByTestId('presentation')).toHaveAttribute('data-slide-id', 'third');
    window.location.hash = '#missing';
    fireEvent(window, new HashChangeEvent('hashchange'));
    expect(screen.getByTestId('presentation')).toHaveAttribute('data-slide-id', 'first');
  });

  it('deep-merges runtime overrides and derives transition defaults from the resolved theme', () => {
    const themedDeck = defineDeck({
      metadata: { id: 'themed', title: 'Themed' },
      theme: { colors: { accent: '#00ffaa' }, motion: { duration: 0.8, defaultTransition: 'scale' } },
      slides: [<Slide id="themed" title="Themed">Content</Slide>],
    });
    render(<Presentation deck={themedDeck} theme={{ motion: { duration: 1.2 } }} />);
    const themeRoot = screen.getByTestId('presentation').parentElement;
    const layer = document.querySelector('.op-transition-layer');
    expect(themeRoot?.getAttribute('style')).toContain('--op-color-accent: #00ffaa');
    expect(layer).toHaveAttribute('data-transition-type', 'scale');
    expect(layer).toHaveAttribute('data-transition-duration', '1.2');
  });
});

describe('resolveTransition', () => {
  const fallback = { type: 'fade' as const, duration: 0.5, ease: 'easeOut' as const };
  it.each(['fade', 'slide', 'scale', 'none'] as const)('supports %s', (type) => {
    expect(resolveTransition(type, fallback, false).animate.opacity).toBe(1);
  });
  it('removes non-essential motion under reduced motion', () => {
    expect(resolveTransition('slide', fallback, true)).toMatchObject({ initial: false, duration: 0 });
  });
  it('uses an explicit transition ease over the fallback', () => {
    expect(resolveTransition({ type: 'fade', ease: 'linear' }, fallback, false).ease).toBe('linear');
  });
});
