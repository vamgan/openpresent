# Authoring OpenPresent decks

OpenPresent treats React/TSX as the document. A deck adds just enough structure for navigation, theming, validation, and future tools to understand the outline.

## Shape the argument first

Write a one-sentence purpose, the audience decision, and a frame-by-frame arc before choosing components. A useful default arc is tension → thesis → mechanism → evidence → implication → close. One slide should make one primary point.

## Minimal complete deck

```tsx
import { createRoot } from 'react-dom/client';
import { defineDeck, Presentation } from '@openpresent/core';
import { Hero, Slide } from '@openpresent/components';
import '@openpresent/core/styles.css';
import '@openpresent/components/styles.css';

const deck = defineDeck({
  metadata: { id: 'demo', title: 'Demo deck', lang: 'en' },
  slides: [
    <Slide id="opening" title="Demo deck" transition="fade">
      <Hero title="One clear idea." subtitle="A supporting sentence." />
    </Slide>,
  ],
});

createRoot(document.getElementById('root')!).render(<Presentation deck={deck} />);
```

`metadata.data` and each slide’s `data` accept JSON-compatible values. Slides may contain any React node, including local components with state.

## Theme tokens

Pass a partial theme to `defineDeck`. Missing values merge with the built-in defaults.

```tsx
theme: {
  colors: { background: '#09090a', text: '#f6f4f0', accent: '#ff5d50' },
  typography: { fontFamily: 'system-ui, sans-serif', baseSize: 28 },
  stage: { padding: 76 },
  motion: { defaultTransition: 'slide', duration: 0.5, ease: 'easeOut' },
}
```

Token groups cover typography, colors, spacing, radii, shadows, stage padding, and motion. `ThemeProvider` maps them to documented `--op-*` CSS custom properties. A `Presentation`-level `theme` prop deep-merges after the deck theme, and transition defaults come from that fully resolved result.

Keep the reusable theme and design-system decisions in a small module beside the deck. See [skills and design systems](skills.md) for the open folder contract and adoption ladder.

## Transitions and reveals

Slides accept `fade`, `slide`, `scale`, `none`, or `{ type, duration, ease }`. Use transitions to clarify a change in topic or scale—not as decoration. `Reveal`, `Sequence`, `TextReveal`, and `ImageReveal` control slide-local pacing. All simplify to a static state when the viewer prefers reduced motion.

## Primitives versus freeform React

Choose a primitive when it carries a known semantic or layout contract:

- `Hero`, `Metric`, `Quote`, and `Comparison` for rhetorical structure;
- `Split` and `Grid` for stable stage composition;
- `CodeBlock`, `BrowserMockup`, `Timeline`, and `Flow` for technical explanation;
- charts for compact, accessible quantitative evidence;
- `Image` for alt text, fit, focal point, and captions.

Use normal JSX for unique compositions, interactive demos, forms, embedded local tools, or brand-specific editorial treatments. Add `data-op-validate` to top-level custom layout regions when you want collision and bounds checks to treat them as intentional units.

## Assets

Keep assets in the app’s `public` folder or import them through Vite. Use relative build paths (`base: './'`) so static output can move between hosts. Never depend on a remote cloud renderer.
