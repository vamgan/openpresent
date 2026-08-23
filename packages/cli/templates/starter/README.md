# __PROJECT_NAME__

An OpenPresent deck: React and TypeScript in, portable static HTML out.

```bash
pnpm install
pnpm dev
pnpm validate
pnpm build
```

Edit `src/deck.tsx`. Every slide needs a unique `id` and a `title` or `label`. Use OpenPresent primitives for repeatable editorial structure, then use ordinary React and HTML when the story needs a custom composition. Arrow keys, Space, Page Up/Down, Home, End, and `F` work in the viewer; the URL hash is a direct link to the active slide.

The generated starter vendors the exact OpenPresent runtime used to create it, so the deck remains installable before a matching registry release is available. Replace the `file:` dependencies with released `@openpresent/*` versions when publishing your project.

Create with `--skill deck-direction` to place agent-readable design guidance in `.agents/skills/deck-direction`. The skill can also be installed independently with `openpresent skills install deck-direction`.
