# @openpresent/mcp

**The authoring loop as agent tools.**

Part of [OpenPresent](https://github.com/vamgan/openpresent), a local-first
presentation runtime for AI agents. Your slides are real React files on your
machine, and a validator catches the 12px legend before your audience does.

[![npm](https://img.shields.io/npm/v/@openpresent/mcp)](https://www.npmjs.com/package/@openpresent/mcp)

An MCP server that starts Studio locally and exposes reading state, navigating, inserting slides, guarded source edits, validation, slide capture, and undo. Edits are exact-match and single-occurrence, so an agent cannot silently clobber your work.

## Usage

```json
{
  "mcpServers": {
    "openpresent": {
      "command": "npx",
      "args": ["-y", "@openpresent/mcp", "--project", ".", "--open"]
    }
  }
}
```

Full documentation, including the authoring guide and the validator rule
reference, lives in the [main repository](https://github.com/vamgan/openpresent).

## License

[FSL-1.1-MIT](https://github.com/vamgan/openpresent/blob/main/LICENSE). Free to
use, modify, and redistribute including inside a company; competing commercial
products are reserved. Each release converts to MIT two years after publication.
