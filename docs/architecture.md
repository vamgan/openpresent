# Architecture

OpenPresent deliberately keeps the authoring model and browser model close: a deck is typed metadata plus an ordered array of React slide elements. V1 does not normalize children into a scene graph or collaboration persistence format. This makes the stack usable by any model or agent that can work with files and TypeScript.

## Adoption layers

OpenPresent separates presentation guidance from runtime adoption. An agent can consume a skill only, create a batteries-included starter with that skill, compose scoped typed packages, or use fully headless React. Each layer is independently useful and leaves the next layer optional. The folder and distribution rules are documented in [skills and design systems](skills.md).

## Durable product loop

- Skills distribute narrative direction and design policy independently of runtime adoption.
- The validator is the deterministic critic: source rules and whole-deck browser rules produce stable acceptance evidence for agents and CI.
- The runtime is deliberately stable infrastructure rather than the fast-changing policy layer.
- Primitives form a compact semantic vocabulary for recurring structures, making validation diagnostics and source repair more precise. Breadth for its own sake is not a goal.
- Arbitrary TSX remains the escape hatch and prevents the semantic vocabulary from becoming a proprietary document model.

The shipped local engine makes the loop dynamic through two entry paths. An MCP host can inspect, navigate, validate, capture, edit, delete, and undo through stdio tools. The browser Studio can act as an ACP v1 client for a user-selected local coding agent. Both paths orchestrate the existing layers and do not introduce a second presentation representation.

```text
MCP-compatible host ── @openpresent/mcp ──┐
                                         v
                                  shared local engine <──> Studio + live Vite deck
                                         ^
Studio agent panel ── official ACP v1 ────┘
```

## Packages

- `@openpresent/core`: deck types, `defineDeck`, theme merge/provider, `Slide`, fixed-stage runtime, navigation, hash restoration, fullscreen, transitions, reduced motion, and error boundary.
- `@openpresent/components`: editorial layouts, technical storytelling, SVG charts/flows, reveals, and animated backgrounds. Depends on core, never the reverse.
- `@openpresent/validator`: serializable model rules, source extraction, configurable DOM rules, and an optional Playwright URL runner.
- `@openpresent/skills`: typed skill manifests, resolution and safe copy helpers, and packed agent-readable design-system resources.
- `@openpresent/studio`: loopback server, shared authoring state, semantic selection, guarded edits/checkpoints, ACP client lifecycle, and the compiled browser workspace. Its assistant chat uses `@assistant-ui/react` as a headless external-store view over Studio state; ACP remains the only agent transport.
- `@openpresent/mcp`: official MCP v2 stdio server and ten annotated tools over the same Studio operations. It can start a workspace or attach to an existing loopback session.
- `@openpresent/cli`: starter creation, skill installation, Studio lifecycle, and Vite/validator orchestration. Generated starters vendor matching core/component/validator artifacts until registry packages are available.
- `@openpresent/showcase`: a real workspace consumer compiled against package exports.

## Runtime

The logical stage is 1600×900. A resize observer chooses the smaller width or height scale, places the stage inside a shell with exact scaled dimensions, and centers it in the viewport. Content always retains its logical coordinates and aspect ratio; unused viewport space becomes letterboxing.

The active slide ID is encoded as a URL hash. The runtime restores valid hashes, falls back for invalid ones, listens for later hash changes, and updates the document title. It exposes the ordered slide IDs as a small DOM enumeration hook so browser tooling can visit every frame. Navigation is clamped and editable targets are protected. A slide-keyed error boundary reports the affected slide without taking down the controls.

Theme inputs deep-merge in order: defaults, deck theme, then runtime override. The fully resolved theme drives both CSS variables and transition defaults.

## Build and portability

Vite bundles React runtime code, local assets, CSS, navigation, motion, and inline interactions. `base: './'` keeps asset paths relative. Built decks need only a static HTTP server; they do not call a hosted OpenPresent backend.

Studio serves its compiled browser assets from the packed package and runs the deck itself through its normal Vite preview. HTTP binds to `127.0.0.1`; mutations require an unguessable per-session token. Project paths are canonicalized before reads, edits, checkpoints, and ACP filesystem callbacks.

## Extension points

- Theme: partial semantic token records and documented `--op-*` CSS variables.
- Transition: named transition or per-slide duration/ease specification.
- Component: any React node can live inside `Slide`.
- Validator: configuration can disable rules, override severities, and change thresholds; public diagnostic types support custom tooling.
- Skill: local folders combine instructions, theme/config guidance, and optional assets or examples without imposing a slide master.
- CLI: `dev` and `build` accept any Vite-shaped deck project, keeping custom Vite plugins possible.
- Protocol: MCP tools and ACP sessions share `StudioOperations`; provider-specific behavior is limited to launch discovery. V1 defines no full presentation IR and ships no cloud control plane.

The showcase imports a reusable design-system module and exercises public exports. It is executable documentation and the visual source of truth, not a privileged internal renderer.

See [Local Studio and agent loops](studio.md) for executable commands, agent profiles, the selection/edit/validate/undo flow, and local security boundaries.
