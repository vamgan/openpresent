# Changelog

All notable changes to OpenPresent are recorded here. This project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.1] - 2026-08-23

### Added

- A README and a copy of the licence in every published package, so each npm
  page explains what the package is instead of showing nothing.
- `npx @openpresent/skills <target>` installs a skill straight into the place an
  agent already looks for one: `.claude/skills` for this project or for every
  project, `.agents/skills` for Codex and similar, or plain files to upload to a
  GPT.

### Changed

- The licence field now reads `FSL-1.1-MIT` rather than
  `SEE LICENSE IN LICENSE`, which npm displayed opaquely.

## [0.3.0] - 2026-08-22

### Added

- **Studio**, a local authoring workspace: a live 16:9 canvas, a slide rail,
  inline text editing, and an agent panel, all served from loopback.
- **Presentation library.** Presentations live in your own folders under
  `~/Documents/OpenPresent` and are listed, opened, and switched from the start
  screen. Studio discovers presentations already on disk rather than relying on
  its own records.
- **Agent connectors over stable ACP v1** for Codex, Claude, Gemini, and Kiro,
  with per-agent model selection and a free-text field for any model a CLI
  accepts.
- **Session continuity.** Each presentation remembers its own connector, model,
  transcript, and active slide, and asks the agent to resume its previous
  session when the agent supports it.
- **Tool approvals.** Non-destructive in-project edits can be auto-approved;
  destructive ones always ask, and paths outside the project are always refused.
- **Undo history** with labelled steps, redo, and revert-to-a-point.
- **Single-file HTML export** with a save-location prompt.
- **MCP server** exposing the authoring loop to agents, including
  `insert_slide`, `list_slide_templates`, `new_deck`, and `replace_selected_text`.

### Changed

- A presentation is now a document, not a project. Studio supplies React, the
  build config, and the OpenPresent packages, so a presentation folder holds only
  `index.html` and `src/`, with no `package.json`, lockfile, or `node_modules`.
- Deck edits repaint the open slide in place instead of reloading the preview.
- Saving is automatic. The former Save button, which never wrote anything, is
  replaced by a "Saved" timestamp reflecting the last real write.
- The client receives state over Server-Sent Events instead of polling.

### Fixed

- Editing text that a primitive splits across elements, such as a word inside
  `TextReveal`, no longer fails to match its source.
- Editing a phrase that appears more than once now edits the occurrence that was
  selected rather than refusing.
- Studio no longer writes build caches into a presentation folder.
- Protocol negotiation accepts any ACP version at or below the one offered,
  rather than requiring an exact match.
