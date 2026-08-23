# @openpresent/validator

**Checks decks for the defects a model cannot see.**

Part of [OpenPresent](https://github.com/vamgan/openpresent), a local-first
presentation runtime for AI agents. Your slides are real React files on your
machine, and a validator catches the 12px legend before your audience does.

[![npm](https://img.shields.io/npm/v/@openpresent/validator)](https://www.npmjs.com/package/@openpresent/validator)

Inspects real source and the real DOM, and reports each finding as a rule ID, a severity, the slide, a plain-language message, and a repair hint. Catches text below a readable size, elements off the canvas or overlapping, missing alt text, unreachable controls, and malformed structured data.

## Usage

```bash
openpresent validate src/deck.tsx
openpresent validate http://127.0.0.1:4173 --min-font-size 18
```

Full documentation, including the authoring guide and the validator rule
reference, lives in the [main repository](https://github.com/vamgan/openpresent).

## License

[FSL-1.1-MIT](https://github.com/vamgan/openpresent/blob/main/LICENSE). Free to
use, modify, and redistribute including inside a company; competing commercial
products are reserved. Each release converts to MIT two years after publication.
