# @openpresent/skills

**Installable art direction for deck-authoring agents.**

Part of [OpenPresent](https://github.com/vamgan/openpresent), a local-first
presentation runtime for AI agents. Your slides are real React files on your
machine, and a validator catches the 12px legend before your audience does.

[![npm](https://img.shields.io/npm/v/@openpresent/skills)](https://www.npmjs.com/package/@openpresent/skills)

Ships the `deck-direction` skill: separate facts from assumptions, establish the narrative spine before composing slides, choose the visual system first, and treat motion as meaning rather than decoration. The skill travels with the presentation instead of living in someone's prompt.

## Usage

Install it wherever your agent already looks for skills:

```bash
npx -y @openpresent/skills claude        # .claude/skills in this project
npx -y @openpresent/skills claude-user   # every project on this machine
npx -y @openpresent/skills agents        # .agents/skills, for Codex and similar
npx -y @openpresent/skills gpt           # plain files to upload to a GPT
```

Or scaffold a presentation with the skill already installed:

```bash
openpresent studio ./my-deck --create --skill deck-direction --open
```

Full documentation, including the authoring guide and the validator rule
reference, lives in the [main repository](https://github.com/vamgan/openpresent).

## License

[FSL-1.1-MIT](https://github.com/vamgan/openpresent/blob/main/LICENSE). Free to
use, modify, and redistribute including inside a company; competing commercial
products are reserved. Each release converts to MIT two years after publication.
