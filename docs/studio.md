# Local Studio and agent loops

OpenPresent Studio is a loopback-only browser workspace over the same React/TSX deck that Vite renders and the CLI builds. It adds selection, guarded source edits, checkpoints, validation, and agent control without introducing a scene graph, hosted account, or OpenPresent cloud service.

## Start the Studio

Open an existing deck:

```bash
npx -y @openpresent/cli studio . --open
```

Scaffold an empty directory with the starter and `deck-direction` skill, then open it:

```bash
npx -y @openpresent/cli studio ./my-deck --create --skill deck-direction --open
```

`--create` refuses a non-empty target. Without `--open`, the command prints the Studio and preview URLs. Both servers bind to `127.0.0.1`, choose available ports by default, and stop with the parent process.

Each fresh browser load opens a start center. Continue the current deck, prefill the agent composer from a prompt, or copy a command for creating or reopening a project. The browser never receives unrestricted filesystem access.

## Work in the browser

- The left rail contains real browser-rendered thumbnails. Selecting one synchronizes the rail, live preview hash, shared engine, and MCP state.
- Click visible content to attach its slide ID, primitive owner or HTML tag, text, breadcrumb, snippet, and logical bounds. Runtime controls are excluded.
- Double-click selected leaf text, or press Enter on it, to edit directly on the slide. Enter or blur saves; Escape cancels. The engine replaces an exact, unique match in the authoritative entry and refuses missing or ambiguous matches.
- `+ New slide` offers ten local TSX recipes: blank, hero, metric, split, comparison, timeline, flow/architecture, code, quote, and image. A unique URL-safe ID and required imports are inserted into source.
- Delete uses an explicit two-step confirmation and refuses to remove the final slide. New slide, inline text, agent edits, and deletion all create recoverable checkpoints for Undo.
- Save validates and confirms the authoritative source path. Source changes are local and immediate, so reopening the project with the same command restores them.
- Build HTML writes portable static output to `dist`. Open print view opens the active slide in a print-safe route; use the browser print dialog to save a PDF. OpenPresent does not claim a native editable-PDF or PPTX exporter.

## Studio-first: local agents through ACP

Choose a profile explicitly, connect, then send a prompt. OpenPresent is the ACP client and communicates through stable v1 APIs from the official `@agentclientprotocol/sdk`. The built-ins are launch profiles, not provider-specific chat implementations:

| Profile | Launch path | Notes |
|---|---|---|
| Codex | `npx -y --package @openai/codex --package @agentclientprotocol/codex-acp codex-acp` | Pairs the adapter with a compatible Codex package. An explicitly configured `CODEX_PATH` remains honored. |
| Claude | `npx -y @agentclientprotocol/claude-agent-acp` | Uses the official Claude ACP adapter. |
| Gemini | `gemini --acp` | Discovery falls back to `gemini --experimental-acp` for older CLIs that advertise only that flag. |
| Kiro | `kiro-cli acp` | Uses Kiro CLI native ACP mode. |

The first adapter launch can take up to a minute while `npx` resolves packages. Missing commands and authentication-required responses are reported inline; the deck, manual authoring controls, and MCP tools remain usable. Local overrides belong in `.openpresent/agents.json` and launch only after the user selects that profile.

Every prompt includes the project root, authoritative entry, active slide, semantic selection, current diagnostics, and concise `deck-direction` guidance. Permission, tool, and thought events for one answer appear as one collapsed action disclosure. The browser chat uses the headless `@assistant-ui/react` `ExternalStoreRuntime` to map Studio `AgentState` into turns and control send/cancel; it does not replace ACP or communicate with a model provider.

Enter sends, Shift+Enter inserts a newline, and Stop calls ACP cancellation. The selected coding agent may use its own configured provider, credentials, and network connection; that provider’s policy still applies. OpenPresent does not read, store, or proxy those credentials.

## Host-first: MCP doorway

Start the protocol-clean stdio server from any MCP host:

```bash
npx -y @openpresent/mcp --project .
```

For Codex CLI:

```bash
codex mcp add openpresent -- npx -y @openpresent/mcp --project .
```

Equivalent JSON-style host configuration is:

```json
{
  "mcpServers": {
    "openpresent": {
      "command": "npx",
      "args": ["-y", "@openpresent/mcp", "--project", "."]
    }
  }
}
```

The ten-tool surface is `open_workspace`, `get_state`, `get_outline`, `get_selection`, `navigate_slide`, `validate_deck`, `capture_slide`, `apply_edit`, `delete_slide`, and `undo`. Read and write annotations are explicit. Standard output remains JSON-RPC-only; readiness and errors go to standard error.

The useful loop is: open, select or navigate, inspect, apply the smallest exact edit, validate, capture if visual evidence is needed, and undo if acceptance regresses. Mutations require the high-entropy Studio session token, canonicalize paths, and refuse traversal or files outside the project root.

## Shared local engine

```text
MCP host ── stdio tools ──┐
                          v
                   local engine <──> Studio + live Vite deck
                          ^
Studio chat ── ACP v1 ────┘
```

Both entry paths share the outline, active slide, selection, diagnostics, guarded edits, checkpoints, and TSX files. Studio can pass the installed MCP entry to ACP adapters that support client-provided MCP servers without fetching an unpublished package.

## Troubleshooting

- If an agent remains on Connecting during its first `npx` launch, wait for the one-minute initialization window, then retry. Adapter stderr is shown without exposing the Studio mutation token.
- If Gemini reports authentication required, authenticate its CLI outside OpenPresent and reconnect. Flag discovery alone does not imply a ready provider session.
- If a command is missing, install or configure that agent locally; choose another profile meanwhile.
- If an edit is refused, confirm the selected text occurs exactly once in the authoritative entry. Use a guarded source edit for more complex TSX changes.
- If a fixed port is occupied, omit the port option so Studio selects an available loopback port.

There is no account, hosted persistence, realtime collaboration, comments service, arbitrary drag-to-source layout rewrite, or cloud agent proxy in this local slice.
