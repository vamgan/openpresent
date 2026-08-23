---
name: deck-direction
description: Direct and implement evidence-led OpenPresent decks when narrative art direction, visual coherence, or stage quality matters. Use for OpenPresent TSX decks and design systems, not PPTX files or generic web pages.
---

# Deck Direction

Turn a brief and verified evidence into a coherent OpenPresent deck. Read [the design-system contract](references/design-system-contract.md) before creating or substantially revising a deck.

## Direct the story before the stage

1. Separate supplied facts from assumptions. Never invent metrics, testimonials, dates, or outcomes. Label synthetic values as `Illustrative data` on the slide.
2. Define the audience change and narrative spine: opening tension, thesis, evidence sequence, implication, and closing action. Give each slide one job and pace the sequence intentionally.
3. Select the visual system before composing slides: semantic theme tokens, a typographic scale, one accent, stage padding, and variance, motion, and density dials.
4. Choose the least rigid authoring level that serves the story. Start with typed primitives for known patterns; combine primitives for editorial layouts; use freeform TSX when the narrative needs a bespoke composition.
5. Art-direct charts and images as evidence. Choose a chart for the comparison being made, label sample data, write meaningful alt text, and keep imagery in one visual world.
6. Use reveals only when sequence adds meaning. Respect reduced motion and avoid decorative motion that competes with the argument.
7. Run typecheck, source validation, build, and whole-deck URL validation. Review every slide hash at the target viewport and a compact viewport before shipping.

## Non-negotiables

- Keep visible logical text at 18px or larger.
- Compose inside the 1600 by 900 logical stage and preserve stage-safe padding.
- Use a single accent unless the evidence requires semantic status colors.
- Prefer concise slide copy and speaker notes over tiny supporting text.
- Keep agent instructions and the design-system module close to deck source.
- Treat the showcase as executable reference material, not a slide template to copy verbatim.
