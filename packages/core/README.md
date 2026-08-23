# @openpresent/core

**The presentation runtime.**

Part of [OpenPresent](https://github.com/vamgan/openpresent), a local-first
presentation runtime for AI agents. Your slides are real React files on your
machine, and a validator catches the 12px legend before your audience does.

[![npm](https://img.shields.io/npm/v/@openpresent/core)](https://www.npmjs.com/package/@openpresent/core)

A typed deck model with serializable metadata and arbitrary React children, a fixed 1600x900 stage that scales to any viewport, and keyboard, hash, and fullscreen navigation that honours reduced motion.

## Usage

```tsx
import { defineDeck, Presentation } from '@openpresent/core';
import '@openpresent/core/styles.css';

export const deck = defineDeck({
  metadata: { id: 'demo', title: 'A concise argument' },
  slides: [<Slide id="opening" title="Opening">…</Slide>],
});
```

Full documentation, including the authoring guide and the validator rule
reference, lives in the [main repository](https://github.com/vamgan/openpresent).

## License

[FSL-1.1-MIT](https://github.com/vamgan/openpresent/blob/main/LICENSE). Free to
use, modify, and redistribute including inside a company; competing commercial
products are reserved. Each release converts to MIT two years after publication.
