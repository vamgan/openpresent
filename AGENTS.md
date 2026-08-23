# OpenPresent agent rules

## Before editing

1. Read `README.md` and the relevant file in `docs/`.
2. For deck design work, read `skills/deck-direction/SKILL.md`, its linked design-system contract, and [skills and design systems](docs/skills.md). Keep project-specific agent instructions and theme modules next to deck source.
3. Preserve React/TSX as the authoritative authoring surface. Do not introduce a scene graph or presentation IR.
4. Respect package direction: `components → core`, `studio → core + components + skills + validator`, `mcp → studio`, and `cli → studio + validator + skills`; do not add a core-to-components dependency.

## Authoring conventions

- Give every `<Slide>` a unique, URL-safe `id` and a concise `title` or `label`.
- Keep deck and slide metadata serializable. Structured chart, timeline, comparison, and flow data should be records and arrays.
- Never invent metrics or outcomes. Put `Illustrative data` on the slide whenever synthetic values demonstrate a chart or interaction.
- Arbitrary React children are a first-class escape hatch. Use a primitive when the rhetorical pattern repeats; use semantic HTML or a local component for story-specific composition.
- Compose inside the logical 1600×900 stage. Avoid viewport units in slide content.
- Keep visible body copy at least 18px on the logical stage; favor 24px or larger.
- Use one semantic accent and sufficient contrast. Never encode meaning by color alone.
- Prefer transform and opacity for motion. Check `prefers-reduced-motion`; never make motion necessary to understand content.
- Images require meaningful `alt` text unless purely decorative. Controls require names and visible focus.

## Validation workflow

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm validate
pnpm test:pack
pnpm test:browser
```

Run focused tests while iterating, then the full sequence before handoff. Source/unit/build evidence does not substitute for the browser check when changing layout, navigation, fullscreen, hash behavior, or motion.

When changing Studio, ACP, or MCP behavior, also run the focused `pnpm test:studio` loop while iterating. Keep provider communication inside the official ACP SDK and keep MCP standard output protocol-only.

## Quality check

- State one idea per slide and vary composition intentionally.
- Check opening, densest, image, chart, and closing slides at 1440×900 and 900×700.
- Exercise arrows, Space, Home, End, direct hashes, visible controls, and any inline interaction.
- Test reduced motion.
- Keep docs, exports, tests, and the showcase aligned with every public primitive.
- Treat `examples/showcase` and its reusable design-system module as executable documentation and the visual source of truth.
- Keep V1 skills vendable and local. Do not add a hosted marketplace, cloud account, or proprietary skill registry.
- Do not add secrets, cloud credentials, accounts, billing, analytics, or collaboration backends.
