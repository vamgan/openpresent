# Show HN draft

**Title** (68 chars, within HN's 80 limit)

```
Show HN: OpenPresent – AI writes your slides, a validator checks them
```

**URL**

```
https://github.com/vamgan/openpresent
```

**Text**

```
Every model now generates presentations as a single HTML file. I kept hitting
the same wall: the deck looks great in the chat window, then you open it on a
projector and the chart legend is 13px, two elements overlap, and a line runs
off the slide. The model never saw any of that. It cannot see what it rendered,
so nothing in the loop ever objects.

OpenPresent is my attempt to close that loop locally.

- Slides are ordinary React/TSX files in a folder you own. No lockfile, no
  node_modules, no project to maintain: Studio supplies React and the build, so
  your folder holds only your content and you can move or email it.
- A validator inspects the real source and the real DOM and returns findings as
  structured data: rule ID, severity, slide, message, repair hint. Text below a
  readable size, elements off the canvas or overlapping, missing alt text,
  unreachable controls.
- An MCP server hands that loop to whatever agent you already use (Codex,
  Claude, Gemini, Kiro). The agent edits guarded source ranges, validates,
  screenshots a slide to look at its own work, and undoes if acceptance
  regresses. Edits are exact-match and single-occurrence, so it cannot silently
  clobber your file, and everything is undoable.

Some things I found out building it that might be interesting:

- Stable ACP v1 has no model negotiation; that is a v2 addition, and neither
  Claude's ACP adapter nor Gemini CLI negotiates v2 today. I probed both by
  offering protocolVersion 2 and they each answered 1. So model selection is
  applied to the agent process at launch.
- React Fast Refresh silently breaks the authoring loop: a deck module exports
  data rather than components, so Fast Refresh claims it, fails its boundary
  check, and calls invalidate(), reloading the page on every keystroke. The fix
  was a Vite plugin that rewrites that call into a handoff.
- The agent kept wasting its first turn running installs, because the scaffold
  handed it a package.json and a README telling it to. Removing the project
  entirely fixed the behaviour better than any prompt change did.

Honest limitations: agent-side conversation resume only works where the agent
implements session/resume; the bundled model lists go stale, so the picker also
takes any model name your CLI accepts; and this is source-available under
FSL-1.1-MIT (free to use including at work, no competing commercial product),
converting to MIT after two years, because an enterprise edition is planned.

npx -y @openpresent/cli studio --open

Happy to go into the validator rules or the ACP plumbing in the comments.
```

## Posting notes

- Post it yourself while signed in: a Show HN is a one-shot launch, and the
  first hour of replies matters more than the submission itself.
- Best window is roughly 08:00 to 10:00 US Eastern on a weekday.
- Show HN requires something people can try immediately. Publish the npm
  packages first, or the `npx` line in the post will not work for anyone.
- Do not resubmit the same URL. If it sinks, HN moderators can offer a second
  chance rather than a repost.
