# Agent authoring guide

Give an agent the audience, decision, evidence, constraints, and desired number of slides. Ask it to write a narrative outline before TSX, keep metadata serializable, and validate the result. The same public surface works for any model or agent. Install `deck-direction` for reusable OpenPresent narrative and art-direction instructions:

```bash
openpresent skills install deck-direction
```

For an observable local edit loop, use either the browser Studio as an official ACP v1 client or the stdio MCP doorway from an agent host. Both paths share semantic selection, validation, guarded checkpoints, and authoritative TSX. See [Local Studio and agent loops](studio.md).

## Codex prompt

```text
Create an OpenPresent deck in src/deck.tsx for [audience] to decide [decision].
Use this evidence: [facts and sources]. First state a one-line narrative for each
of [N] slides, then implement it. Give every Slide a unique URL-safe id and title.
Use @openpresent/components for recurring editorial patterns; use semantic React
for story-specific compositions. Keep one coral accent, logical-stage text >=18px,
meaningful image alt text, and reduced-motion-safe animation. Run typecheck,
validation, build, and the browser smoke test. Report only evidence actually run.
```

## Claude prompt

```text
Author a [N]-frame OpenPresent TSX presentation for [audience]. The desired audience
change is [outcome]. Build the arc tension → thesis → mechanism → evidence → close.
Use serializable metadata and structured primitive data, but preserve React children
as the custom-layout escape hatch. Vary composition intentionally; avoid a repeated
card template. Validate IDs, labels, overflow, tiny text, collisions, and density,
then build portable static output. Honor prefers-reduced-motion.
```

## Gemini prompt

```text
Turn this brief and evidence into a complete OpenPresent deck: [brief]. Before coding,
write the purpose of each slide. Then implement typed TSX with defineDeck and Slide.
Use Hero/Metric/Comparison/Timeline/Flow/charts only where their rhetoric fits. Use
freeform semantic React for unique moments and at least one meaningful interaction.
Every data claim must preserve its supplied meaning; label synthetic values as
Illustrative data on the slide. Run pnpm typecheck, pnpm test,
pnpm build, pnpm validate, and browser checks at 1440x900 and 900x700.
```

## Agent quality checklist

- Is the decision or change for the audience explicit?
- Does every slide earn its place and make one primary point?
- Are all IDs unique and are titles or labels concise?
- Are every metric and outcome sourced, or visibly labeled as illustrative?
- Are structured data arrays valid and references resolvable?
- Is body text readable from a room, with adequate contrast?
- Does motion communicate sequence and respect reduced motion?
- Are images local/portable, correctly fit, and described?
- Does static output retain navigation, hashes, interaction, and assets?
- Were browser checks actually run for visual claims?
