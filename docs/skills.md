# Skills and design systems

An OpenPresent skill is the agent-native equivalent of a PowerPoint template, but it is not a rigid slide master. It combines authoring instructions with a coherent theme/config contract and may include local assets or worked examples. The agent can apply that system to typed primitives or a one-off freeform React composition while keeping the visual language consistent.

## Adoption ladder

1. **Consume a skill only.** Install presentation guidance into an existing agent project without installing React or the OpenPresent runtime.
2. **Create with a design-system skill.** Generate a runnable deck and keep the selected skill beside its source.
3. **Compose the typed stack.** Adopt scoped core, component, validator, and CLI packages as needed.
4. **Work headlessly.** Use ordinary React and CSS for bespoke work without a proprietary presentation IR.

```bash
openpresent skills list
openpresent skills install deck-direction
openpresent create my-deck --skill deck-direction
```

`skills install` defaults to the project-local `.agents/skills` directory, where compatible agents can discover the folder automatically. Use `--target <directory>` to select another explicit local skills root. Existing skill folders are protected; `--force` updates known distributed files without deleting unrelated local files.

The same surface is available without the CLI:

```ts
import { installSkill, listSkills, resolveSkill } from '@openpresent/skills';

const available = listSkills();
const source = resolveSkill('deck-direction');
const installed = installSkill('deck-direction', '.agents/skills');
```

## Open folder contract

A distributable skill folder contains:

```text
deck-direction/
├── SKILL.md
├── agents/
│   └── openai.yaml
└── references/
    └── design-system-contract.md
```

- `SKILL.md` has concise YAML frontmatter for discovery, followed by the workflow and non-negotiable rules.
- `agents/openai.yaml` supplies the display metadata and a default invocation prompt.
- `references/` holds detail that is loaded only when needed. It can describe tokens, typography, layout safety, narrative pacing, validation, and evidence rules.
- Optional `assets/`, `examples/`, or configuration modules may travel with a future skill when they materially help. They must remain portable and licensed for redistribution.

The canonical V1 skill is [deck-direction](../skills/deck-direction/SKILL.md). It covers narrative art direction, theme tokens, typography, one-accent discipline, stage-safe composition, variance/motion/density dials, primitive selection, chart and image direction, motivated reveals, reduced motion, and the build/validation loop. It prohibits invented metrics and requires visible logical text of at least 18px.

## Executable design systems

Instructions are only one part of the contract. A deck should keep its reusable theme and design decisions in a small TypeScript module beside the source. The showcase’s `src/design-system.ts` is the executable reference: its tokens feed the actual runtime, while the skill explains how an agent should apply them.

V1 deliberately stops at local folders, package tarballs, and safe copy helpers. A hosted skill marketplace, cloud synchronization, accounts, and a proprietary registry protocol are out of scope.
