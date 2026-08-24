<div align="center">

# OpenPresent

### Everyone can generate a deck. Almost nobody can edit one.

Your slides are React source on your machine — a document you and your agent
keep working on, slide by slide. **Not HTML you regenerate and hope.**

[![npm](https://img.shields.io/npm/v/@openpresent/cli?label=%40openpresent%2Fcli)](https://www.npmjs.com/package/@openpresent/cli)
[![CI](https://github.com/vamgan/openpresent/actions/workflows/ci.yml/badge.svg)](https://github.com/vamgan/openpresent/actions/workflows/ci.yml)
[![License: FSL-1.1-MIT](https://img.shields.io/badge/license-FSL--1.1--MIT-0e7c93)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A520.19-2e7d52)](package.json)
[![Site](https://img.shields.io/badge/site-openpresent-12141a)](https://vamgan.github.io/openpresent/)

```bash
npx -y @openpresent/cli studio --open
```

</div>

![OpenPresent Studio: a slide rail, a live canvas, and an agent panel side by side](docs/assets/studio.png)

---

## The 30 second version

Generating the first draft is solved. Every model does it, and the result looks
convincing in the chat window.

The second draft is where it falls apart. You want to fix one number on slide
seven, so you prompt again — and the model hands you a *new deck*. Different
layout, different colors, and the three things you had already fixed by hand
are gone. There is nothing to edit, so you re-roll and hope.

OpenPresent makes the deck a document instead of an output:

```
you            double-click the headline, type over it
agent          "tighten slides 4 through 6"        → edits those three
you            undo the second one, keep the rest
tomorrow       reopen; the deck and the conversation are both still there
```

One file, edited repeatedly. Nothing is regenerated to change one thing.

## Why AI decks don't survive a second draft

HTML won for good reasons: it is the language models write best, and the
browser runs everywhere. But a deck that arrives as one generated artifact
inherits four problems.

| | |
|---|---|
| **Editing means regenerating** | Change one figure and the model rewrites everything. Your manual fixes go with it. |
| **Nothing carries over** | Tomorrow's session has never seen the deck. You re-explain it from scratch, every time. |
| **One dead file** | A wall of inlined markup nobody can diff, review, or pick up next quarter. |
| **Inconsistent by construction** | Each regeneration re-rolls the design, so two decks from one team look unrelated. |

## The editing loop

**A workspace you and your agent share.** Click any element to select it,
double-click text to edit it. Your edits and the agent's land in the same
source, and the slide repaints without reloading, so you keep your place.

**Edits stay scoped.** Ask for a change to one slide and one slide changes. The
agent edits source in place through exact-match, single-occurrence edits, so it
cannot quietly rewrite the deck around your request.

**The conversation persists.** Each presentation remembers its own agent session
and resumes it when you come back. Reopening a deck next week does not start
from nothing.

**Undo reads like actions.** "Added metric slide." "Agent: tightened the
opening." Step back through them, or jump to any earlier point.

**Your agent, your model.** Codex, Claude, Gemini, or Kiro — whichever you are
already signed into. No API keys to paste, no container to run. Pick the model
per presentation.

**Approvals you control.** Safe in-project edits apply automatically.
Destructive ones always ask. Anything reaching outside the folder is refused,
not prompted.

## Getting started

```bash
npx -y @openpresent/cli studio --open
```

That is the whole setup. No account, no API key, no Docker. The first run
creates a presentation and opens it; after that, the same command reopens
whatever you were last working on.

Already have a deck folder? `cd` into it and run the same command. Want a
specific one? Name it:

```bash
openpresent studio ~/Documents/OpenPresent/q3-review
```

## Your slides are yours

A presentation is a folder in your Documents, not a project you maintain:

```
~/Documents/OpenPresent/q3-review/
  index.html
  src/deck.tsx      ← your slides
  src/styles.css
```

No `package.json`, no lockfile, no `node_modules`. Studio supplies React and
the build, so your agent never burns its first turn running installs, and you
can move, copy, email, or version the folder like any other document.

And it is readable React, so you are never locked out of your own deck:

```tsx
<Slide id="evidence" title="The evidence" transition="slide">
  <h2>Three signals</h2>
  <Grid columns={3}>
    <Metric value="3×" label="Faster to review" detail="Median across 40 decks." />
    <Metric value="0" label="Cloud dependencies" />
    <Metric value="18px" label="Minimum body text" detail="Enforced, not hoped for." />
  </Grid>
</Slide>
```

Use a primitive when the pattern repeats. Use plain HTML when the slide is
specific to your story. Both are first-class — and both are still there
tomorrow, because nothing regenerates them.

## Plug it into your agent

OpenPresent ships an MCP server. Point your agent at it and the server starts
Studio locally and hands over the authoring loop as tools.

```json
{
  "mcpServers": {
    "openpresent": {
      "command": "npx",
      "args": ["-y", "@openpresent/mcp", "--project", "~/Documents/OpenPresent/q3-review", "--open"]
    }
  }
}
```

| Tool | What it does |
|---|---|
| `get_state`, `get_outline`, `get_selection` | Read the deck, the active slide, and the current selection. |
| `apply_edit` | Guarded source edits: exact match, single occurrence, checkpointed. |
| `insert_slide`, `list_slide_templates` | Add one slide or many, with the imports they need. |
| `capture_slide` | Screenshot a slide so the model can look at its own work. |
| `validate_deck` | Run the checks, get findings back as structured data. |
| `undo`, `redo` | Every change is reversible, by the agent or by you. |

## Taste, installed alongside the tools

Tools let an agent change a deck. They do not tell it what a good deck is. That
ships as a skill you install into the presentation, so the direction travels
with the work instead of living in someone's prompt — which is also what keeps
the fifteenth slide looking like the first.

```bash
npx -y @openpresent/skills claude        # .claude/skills in this project
npx -y @openpresent/skills claude-user   # every project on this machine
npx -y @openpresent/skills agents        # .agents/skills, for Codex and similar
npx -y @openpresent/skills gpt           # plain files to upload to a GPT
```

It lands as a plain Markdown file your agent reads. Edit it, or replace it with
your own house style.

## A check before it ships

The model never sees what it made, so some mistakes survive every draft: a 12px
legend, an element off the stage, two things overlapping. The deck gets checked,
and findings go back to the agent as data rather than through you.

```
model.tiny-text  warning  [charts]  Legend text renders at 13px on the logical stage.
                          Fix: raise to at least 18px so it survives projection.
```

```bash
openpresent validate src/deck.tsx
openpresent validate http://127.0.0.1:4173 --min-font-size 18
```

Every finding carries a rule ID, a severity, the slide, a plain-language
message, and a repair hint. It catches text below a readable size, elements off
the canvas or overlapping, missing alt text, unreachable controls, and
malformed structured data.

## One file out

Export a self-contained HTML document, to a location you choose. No folder of
assets to keep beside it.

## Architecture

```
deck.tsx  ─────────────────────────────────►  a document you own

@openpresent/core         theme, scale, navigation, transitions
@openpresent/components   editorial and technical primitives
@openpresent/validator    model rules + browser DOM rules
@openpresent/studio       local workspace, agent connectors, library
@openpresent/mcp          the authoring loop as agent tools
@openpresent/cli          create, dev, build, validate, studio
```

Packages flow one way: components depend on core, cli on validator. The runtime
never depends on the component library. Details in
[docs/architecture.md](docs/architecture.md).

All seven are on npm:
[cli](https://www.npmjs.com/package/@openpresent/cli) ·
[core](https://www.npmjs.com/package/@openpresent/core) ·
[components](https://www.npmjs.com/package/@openpresent/components) ·
[validator](https://www.npmjs.com/package/@openpresent/validator) ·
[studio](https://www.npmjs.com/package/@openpresent/studio) ·
[mcp](https://www.npmjs.com/package/@openpresent/mcp) ·
[skills](https://www.npmjs.com/package/@openpresent/skills)

## Development

```bash
pnpm install
pnpm check          # typecheck, build, test, validate
pnpm test:browser   # Playwright smoke over the real Studio
```

[CONTRIBUTING.md](CONTRIBUTING.md) has the workflow. [ROADMAP.md](ROADMAP.md)
covers what is deliberately not built yet.

## License

[Functional Source License 1.1 with an MIT future grant](LICENSE).

Use it, modify it, and redistribute it freely, including inside a company. The
one thing it does not permit is shipping a competing commercial product or
service built on OpenPresent, because an enterprise edition is planned. Each
release converts to the MIT License two years after it is published.
