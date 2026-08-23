<div align="center">

# OpenPresent

**Everyone makes slides with AI now. Nothing checks them.**

A local-first presentation runtime for AI agents. Your slides are real React
files on your machine, your agent edits them in place, and a validator catches
the 12px text before your audience does.

[Quick start](#quick-start) · [Why](#the-problem-with-ai-generated-decks) · [Studio](#studio) · [Validation](#validation-is-the-point) · [Docs](docs/)

MIT licensed · Runs entirely on your machine · No account, no cloud, no telemetry

</div>

---

## The problem with AI-generated decks

Ask any model for a presentation today and you get a wall of HTML. It looks
convincing in the chat window and falls apart on a projector. This is not a
fashion; it is the path of least resistance. PowerPoint is zipped XML
driving an opaque layout engine, so a model cannot see what it produced and
iterates blind. HTML is the format models write best, the browser is everywhere,
and with a screenshot the model can finally check its own work.

So everyone converged on the same thing, and inherited the same four problems.

**Every deck is a one-off.** No shared runtime means keyboard navigation,
scaling, fullscreen, reduced motion, and deep links get half-reimplemented or
quietly skipped, once per deck, forever.

**Quality is a coin flip.** With no primitives, output swings wildly with the
prompt. Two decks from the same person do not look like they came from the same
company.

**Nothing tells the model it got it wrong.** This is the real one. A model ships
12px chart labels, overlapping elements, and text running off the slide, because
nothing in the loop ever says so. It cannot see the rendered result, and "looks
fine to me" is not available to it.

**The output is a dead end.** A single generated file is not something you can
edit next quarter. You regenerate from scratch and hope.

The result is decks that look impressive in the chat window and unprofessional
on a projector.

## What OpenPresent does instead

A deck is ordinary React that you own. A runtime handles the plumbing once, for
every deck. And a validator inspects the rendered result and reports defects in
language an agent can act on, so quality stops depending on how well someone
worded the prompt.

```
model.tiny-text  warning  [charts]  Legend text renders at 13px on the logical stage.
                          Fix: raise to at least 18px so it survives projection.
```

That loop is the product. Everything else supports it.

## Quick start

```bash
npx -y @openpresent/cli studio --open
```

Studio opens in your browser. Create a presentation, describe what you want, and
your own local agent writes it. Nothing leaves the machine.

Requires Node.js 20.19+. Bring your own agent: Codex, Claude, Gemini, or Kiro,
whichever you already have installed and signed in.

## Studio

A local workspace where you and an agent edit the same deck.

- **Live canvas.** A 16:9 stage that scales to any viewport. Click any element to
  select it; double-click text to edit it in place. Edits repaint the slide
  without reloading, so you keep your place.
- **Your agent, your model.** Pick the connector and the model per presentation.
  Each deck remembers its own conversation and resumes it when you return.
- **Approvals you control.** Safe edits inside the presentation can apply
  automatically. Destructive ones always ask. Anything reaching outside the
  folder is refused, not prompted.
- **History that reads like actions.** "Added metric slide", "Agent: tightened
  the opening". Step back through it, or jump to any point.
- **Export one file.** A self-contained HTML document you choose the location
  for. It opens anywhere, with no assets to keep alongside it.

## Your slides are yours

A presentation is a folder in your Documents, not a project you maintain:

```
~/Documents/OpenPresent/q3-review/
  index.html
  src/deck.tsx      ← your slides
  src/styles.css
```

No `package.json`, no lockfile, no `node_modules`. Studio supplies React and the
build, so an agent never spends its first turn running installs, and you can
move, copy, email, or version the folder like any other document.

Slides are readable React, so you can always edit by hand:

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
specific to your story. Both are first-class.

## Validation is the point

The validator runs against real source and the real DOM, and reports a rule ID,
a severity, the slide, a plain-language message, and a repair hint. It catches
text below a readable size, elements off the canvas or overlapping, missing alt
text, unreachable controls, and malformed structured data.

```bash
openpresent validate src/deck.tsx
openpresent validate http://127.0.0.1:4173 --min-font-size 18
```

Agents can call it directly over MCP, which closes the loop: write, check, repair
without a human relaying the problem.

## For agent builders

An MCP server exposes the authoring loop as tools: read state and selection,
navigate, insert slides, edit guarded source ranges, validate, capture a slide as
an image, undo. Edits are guarded (exact-match, single-occurrence, checkpointed)
so an agent cannot silently clobber your work, and every change is undoable.

See [docs/agents.md](docs/agents.md) for ready-made instructions.

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

## Development

```bash
pnpm install
pnpm check          # typecheck, test, build, validate
pnpm test:browser   # Playwright smoke over the real Studio
```

[CONTRIBUTING.md](CONTRIBUTING.md) has the workflow. [ROADMAP.md](ROADMAP.md)
covers what is deliberately not built yet.

## License

[MIT](LICENSE).
