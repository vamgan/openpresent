# Primitive reference

All primitives are typed exports of `@openpresent/components`. Import its CSS once alongside `@openpresent/core/styles.css`.

## Layout and editorial

| Primitive | Key props | Purpose |
|---|---|---|
| `Slide` | `id`, `title`, `label`, `transition`, `children` | Accessible, stable-ID frame; re-exported from core |
| `Hero` | `eyebrow`, `title`, `subtitle`, `align`, `children` | Opening or section-scale statement |
| `Metric` / `BigNumber` | `value`, `label`, `detail`, `trend` | Emphasized quantitative claim |
| `Split` | `ratio`, `gap`, `align`, `children` | Two-column composition with `1:1`, `2:1`, `1:2`, `3:2`, or `2:3` |
| `Grid` | `columns`, `gap`, `children` | Author-controlled repeated layout |
| `Quote` | `attribution`, `role`, `mark`, `children` | Pull quote with semantic figure markup |
| `Image` | `src`, `alt`, `fit`, `focalPosition`, `caption`, `frame` | Accessible image with focal control |
| `SectionHeader` | `kicker`, `title`, `description` | Consistent section hierarchy |
| `Card` | `tone`, `children` | Bounded content region in default, accent, or quiet tone |

## Technical storytelling

| Primitive | Key props | Purpose |
|---|---|---|
| `BrowserMockup` | `url`, `title`, `dark`, `children` | Framed product or web experience |
| `CodeBlock` | `code`, `language`, `title`, `wrap`, `highlightLines` | Readable code with line numbers and scroll/wrap control |
| `Timeline` | `items`, `orientation` | Serializable sequence of `{ id, date, title, description, status }` |
| `Comparison` | `left`, `right`, `versusLabel` | Two structured sides with titles and item arrays |
| `Flow` / `Architecture` | `nodes`, `edges`, `direction`, `label` | Local SVG diagram; edges reference node IDs |

## Charts

`BarChart`, `LineChart`, and `DonutChart` accept serializable `{ label, value, color? }` data, a required accessible `label`, and an optional `valueFormatter`. `BarChart` additionally supports `onSelect` and `selectedIndex`; selected bars remain keyboard operable. `Chart` is the discriminated-union convenience API with `variant="bar" | "line" | "donut"`.

Every chart renders `<title>`, `<desc>`, and screen-reader summary content. Colors inherit theme tokens unless explicitly overridden.

## Motion and background

| Primitive | Key props | Purpose |
|---|---|---|
| `Reveal` | `delay`, `duration`, `direction`, `children` | Transform/opacity entrance for arbitrary children |
| `Sequence` | `start`, `step`, `children` | Staggered child reveals |
| `TextReveal` | string `children`, `delay`, `duration`, `stagger` | Word-by-word text reveal with one accessible label |
| `ImageReveal` | `delay`, `duration`, `radius`, `children` | Clip-path reveal for arbitrary image content |
| `AnimatedBackground` / `GradientBackground` | `variant`, `intensity` | Non-interactive `mesh`, `grid`, or `orbit` background |

Motion primitives read `prefers-reduced-motion`; animated backgrounds become static and reveals render immediately.
