# OpenPresent roadmap

OpenPresent’s durable wedge is an open, closed-loop presentation workflow for agents. Skills distribute design policy. The validator supplies deterministic, CI-friendly acceptance and repair context. The runtime is stable browser infrastructure. Primitives are a compact semantic vocabulary that makes common structures easier to inspect and repair, while raw TSX remains the escape hatch.

V1 is static-first and local-first. The directions below prioritize the OSS authoring loop and do not hide cloud code behind the initial release.

## Current in V1

### Vendable design-system skills

`@openpresent/skills` ships the installable `deck-direction` skill, typed manifest/copy helpers, and local CLI discovery/install commands. The open folder contract is in [skills and design systems](docs/skills.md). Skills can be used without adopting the runtime.

### Whole-deck deterministic validation

Source validation extracts serializable slide and primitive data from TSX. Browser validation enumerates every slide hash and applies one DOM rule engine at desktop and compact viewports. Structured, slide-specific diagnostics support local iteration and CI even as multimodal model review improves.

### Stable runtime and compact vocabulary

The fixed-stage runtime owns scaling, hashes, keyboard navigation, fullscreen, reduced motion, and transition defaults. The component package focuses on a small set of semantically useful presentation forms rather than component count. Authors can leave the vocabulary at any point and compose ordinary React.

### Local Studio and protocol doorway

The shared loopback engine, browser Studio, official ACP v1 client, and MCP v2 stdio server now ship as one local vertical slice. The Studio includes a start center, real thumbnails, semantic selection, direct leaf-text edits, ten TSX slide recipes, guarded deletion, checkpoints/Undo, local save/reopen, static HTML build, and a browser print-to-PDF path. MCP exposes ten annotated inspect, navigate, validate, capture, edit, delete, and undo tools. Both paths keep TSX authoritative.

## Next OSS priority: richer repair and direct manipulation

Deepen the inspect/validate/capture/repair loop with explainable repair context: contrast sampling, presenter-distance heuristics, chart-label checks, image intrinsic-size checks, animation pacing review, and explicit intentional-overlap annotations. Add narrowly scoped direct manipulation only where it can produce safe, reviewable TSX transformations. Prefer evidence and rule IDs over opaque quality scores, and do not introduce a parallel scene graph.

## Design-system skill ecosystem

Add focused, independently vendable skills that follow the same folder contract and can carry instructions, theme/config guidance, and optional licensed assets/examples. Explore local discovery and compatibility metadata first. A hosted marketplace, account system, proprietary registry, and cloud synchronization remain out of scope.

## Later: broader visual editing

Extend the delivered inline text, slide recipe, and delete controls with safe typed transformations for selected layouts and assets. It should use validator feedback and enhance code authoring, not replace React with a scene graph or imitate a full vector canvas.

## Later: comments and collaboration

Explore comments, version-aware schema hooks, and presence only behind provider-neutral local interfaces. Realtime collaboration, accounts, and hosted persistence are not part of the current OSS Studio.

## Later: sharing adapters

Specify a small provider-neutral adapter interface so community packages can deploy portable static output. The core project will not require an OpenPresent-hosted service.

## Later: native editable formats

Static HTML and browser print-to-PDF already ship. Investigate fidelity-aware PPTX and programmatic PDF export with documented capability differences. Browser/static HTML remains authoritative.
