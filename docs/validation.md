# Validation

OpenPresent validation is a critic, not a layout engine. It catches high-confidence defects and returns structured remediation without rewriting the author’s work.

## Diagnostic shape

```ts
interface Diagnostic {
  ruleId: RuleId;
  severity: 'error' | 'warning' | 'info';
  slideId?: string;
  message: string;
  hint: string;
  element?: string;
}
```

An error makes `valid` false and the CLI exit non-zero. Warnings do not fail by default; pass `--warnings-as-errors` when enforcing a stricter review gate.

## Baseline rules

| Rule | Default | Detects |
|---|---:|---|
| `model.empty-deck` | error | no slide elements |
| `model.duplicate-slide-id` | error | unstable direct-link targets |
| `model.invalid-slide-id` | error | missing or non URL-safe IDs |
| `model.missing-slide-label` | warning | missing title and label |
| `model.invalid-structured-data` | error | malformed chart, timeline, comparison, or flow data |
| `dom.off-canvas` | error | element bounds outside the slide |
| `dom.overflow` | warning | scroll or clipped content |
| `dom.tiny-text` | warning | text below 18px by default |
| `dom.collision` | warning | likely unintended overlap of layout units |
| `dom.density` | warning | more than 85 content elements by default |

DOM and URL validation use the same browser rule implementation. It checks every visible leaf text node, including nested HTML and SVG text, while respecting hidden/aria-hidden content. For custom layouts, mark peer layout units with `data-op-validate`. Intentional stage backgrounds and absolute decorative containment are excluded from collision checks; `data-op-validate-ignore` opts an intentional layer out explicitly.

URL validation reads the runtime’s ordered slide manifest, visits every hash, and aggregates deduplicated slide-specific diagnostics. Configure `viewportWidth`, `viewportHeight`, and `viewportPadding` in the API, or use `--viewport WIDTHxHEIGHT` and `--viewport-padding` in the CLI.

## API

```ts
import { validateModel, validateDom, validateTarget } from '@openpresent/validator';

const modelResult = validateModel(
  { slides: [{ id: 'opening', title: 'Opening' }] },
  { severities: { 'model.missing-slide-label': 'error' } },
);

const domResult = validateDom(document, {
  minFontSize: 20,
  maxElementsPerSlide: 70,
  collisionOverlapRatio: 0.4,
  viewportPadding: 2,
  disabledRules: ['dom.overflow'],
});

const urlResult = await validateTarget('http://127.0.0.1:4173', {
  viewportWidth: 1440,
  viewportHeight: 900,
});
```

URL validation requires Playwright plus an installed Chromium browser. If that environment is unavailable, report the browser evidence as blocked—do not treat source, unit, or build checks as a substitute.
