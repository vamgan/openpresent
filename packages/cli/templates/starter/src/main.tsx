import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Presentation } from '@openpresent/core';
import '@openpresent/core/styles.css';
import '@openpresent/components/styles.css';
import { deck } from './deck';
import './styles.css';

const root = createRoot(document.getElementById('root')!);

function render(current: typeof deck) {
  root.render(<StrictMode><Presentation deck={current} /></StrictMode>);
}

render(deck);

// Repaint in place on edit instead of reloading the page, so the current slide
// and any component state survive. Studio pushes fresh exports through the
// global hook; the dep-accept covers plain `vite dev` outside Studio.
if (import.meta.hot) {
  (globalThis as { __openpresentDeckUpdate?: (module: { deck?: typeof deck }) => void })
    .__openpresentDeckUpdate = (module) => { if (module?.deck) render(module.deck); };
  import.meta.hot.accept('./deck', (next) => {
    const updated = (next as { deck?: typeof deck } | undefined)?.deck;
    if (updated) render(updated);
    else import.meta.hot?.invalidate();
  });
}
