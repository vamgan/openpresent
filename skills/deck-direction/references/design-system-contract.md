# OpenPresent design-system contract

An OpenPresent design system is a small, inspectable agreement between the story, the runtime, and the agent authoring the deck.

## Required decisions

- **Theme tokens:** define background, surfaces, text, muted text, border, one accent, spacing, radii, stage padding, and motion defaults in a reusable TypeScript module.
- **Typography:** choose a characterful system-safe or bundled family; set a clear display, heading, body, label, and code scale; never drop visible logical text below 18px.
- **Stage safety:** reserve stable outer padding and keep decorative absolute layers ignored by validation and outside reading order.
- **Variance dial (1 to 3):** 1 is systematic, 2 mixes recurring structures with editorial moments, 3 is highly art-directed. Default to 2 and vary composition without changing the visual language.
- **Motion dial (0 to 2):** 0 is static, 1 uses slide transitions, 2 adds motivated in-slide reveals. Always provide a reduced-motion result.
- **Density dial (1 to 3):** 1 is keynote sparse, 2 is balanced, 3 is technical. Increase slide count before shrinking type.

## Narrative and primitive selection

Map one claim or decision to each slide. Alternate orientation, scale, and evidence form to create rhythm. Use Hero, SectionHeader, Split, Grid, Metric, Comparison, Timeline, Flow, and chart primitives for their named jobs. Use ordinary React and CSS for compositions the primitives cannot express cleanly; headless React is a supported adoption level, not a failure mode.

## Evidence direction

Use bar charts for categorical comparison, line charts for ordered change, and donut charts only for a legible part-to-whole claim. Put the takeaway near the chart and state `Illustrative data` when values are not sourced. Use local or properly licensed images, consistent crops, descriptive alt text, and captions that advance the argument.

## Validation loop

Run these gates after meaningful changes:

1. `pnpm typecheck`
2. `pnpm openpresent validate src/deck.tsx`
3. `pnpm build`
4. Start the built or development deck and validate its URL at 1440 by 900 and a compact viewport.
5. Traverse every slide hash, inspect keyboard focus and reduced motion, and capture fresh representative screenshots.

Fix errors first, then warnings. Do not suppress a rule until the design intent is documented next to the affected composition.
