import { readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { connectStudio, startStudio, type StudioOperations, type StudioServer } from '@openpresent/studio';
import * as z from 'zod/v4';

// Read from the manifest rather than restating it: this version goes out in the
// MCP handshake, so a stale literal tells every connected agent the wrong thing.
// `../package.json` resolves to this package from both src/ and the built dist/.
export const VERSION: string = (
  JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }
).version;
export const MCP_INSTRUCTIONS = 'OpenPresent keeps TSX authoritative. The workspace is already open, so start by calling read_deck: it returns the exact source and its sha256, which is what apply_edit matches against. Guessing at oldText is what produces \"found 0 matches\", and every failed edit costs a turn. Build a whole deck in one apply_edit rather than one call per slide, passing several edits together or replacing the whole file in a single edit, then validate_deck once at the end. Slides accept arbitrary JSX children, so author whatever the content needs, including your own markup, layout, and components; bespoke slides are the norm, not the exception. insert_slide with list_slide_templates is a shortcut for a conventional layout and for adding several slides at once. It is a starting point to build on, never a limit on what a slide may contain, and a deck of nothing but unmodified templates is a failure. Use replace_selected_text to reword the current selection. Run validate_deck, inspect or capture the result, and call undo only when acceptance regresses. Use navigate_slide to keep the browser, selection, and agent context aligned. delete_slide and new_deck are destructive. Read tools are safe; mutating tools are explicitly annotated. Studio owns the runtime and is already running: never install dependencies, never add or edit package.json, tsconfig, or a build config, and never run package managers, builds, dev servers, or typechecks. An absent or empty node_modules is expected and correct; validate_deck is the check. The entire loop is local and project-scoped; never invent metrics or edit outside the selected root.';

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;
const LOCAL_MUTATION = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;
const SOURCE_EDIT = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } as const;
const DESTRUCTIVE_EDIT = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false } as const;

function result(value: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
    structuredContent: value as Record<string, unknown>,
  };
}

export function createMcpServer(operations: StudioOperations) {
  const server = new McpServer(
    { name: 'openpresent', version: VERSION },
    { capabilities: { tools: {} }, instructions: MCP_INSTRUCTIONS },
  );
  server.registerTool('open_workspace', {
    title: 'Open OpenPresent workspace',
    description: 'Return the local Studio and live preview URLs, optionally opening the Studio in a browser.',
    inputSchema: z.object({ openBrowser: z.boolean().optional().default(false) }),
    annotations: { ...LOCAL_MUTATION, openWorldHint: true },
  }, async ({ openBrowser }) => result(await operations.open(openBrowser)));
  server.registerTool('get_state', {
    title: 'Read authoring state',
    description: 'Read active slide, selection, diagnostics, changed files, undo state, agents, and local URLs.',
    inputSchema: z.object({}),
    annotations: READ_ONLY,
  }, async () => result(await operations.getState()));
  server.registerTool('read_deck', {
    title: 'Read the deck source',
    description: 'Return the deck TSX exactly as it is on disk, with its path and sha256. Read this before apply_edit so oldText matches the file instead of being guessed at, and pass the sha256 back as expectedSha256.',
    inputSchema: z.object({}),
    annotations: READ_ONLY,
  }, async () => result(await operations.readDeck()));
  server.registerTool('get_outline', {
    title: 'Read slide outline',
    description: 'List every authoritative slide ID, title, label, and deck order.',
    inputSchema: z.object({}),
    annotations: READ_ONLY,
  }, async () => result({ slides: await operations.getOutline() }));
  server.registerTool('get_selection', {
    title: 'Read semantic selection',
    description: 'Read the latest selected primitive or freeform element, including visible text, breadcrumb, snippet, slide, and logical bounds.',
    inputSchema: z.object({}),
    annotations: READ_ONLY,
  }, async () => result({ selection: await operations.getSelection() ?? null }));
  server.registerTool('navigate_slide', {
    title: 'Navigate to slide',
    description: 'Set the active slide by its authoritative ID and synchronize Studio, preview, and agent context.',
    inputSchema: z.object({ slideId: z.string().trim().min(1).max(120) }),
    annotations: LOCAL_MUTATION,
  }, async ({ slideId }) => {
    const state = await operations.navigate(slideId);
    return result({ activeSlideId: state.activeSlideId, revision: state.revision });
  });
  server.registerTool('validate_deck', {
    title: 'Validate deck',
    description: 'Run deterministic source validation and optionally whole-deck browser validation against the live preview.',
    inputSchema: z.object({ browser: z.boolean().optional().default(false) }),
    annotations: READ_ONLY,
  }, async ({ browser }) => result(await operations.validate({ browser })));
  server.registerTool('capture_slide', {
    title: 'Capture slide',
    description: 'Capture the active or requested slide at the canonical 1440x900 validation viewport.',
    inputSchema: z.object({ slideId: z.string().trim().min(1).max(120).optional() }),
    annotations: READ_ONLY,
  }, async ({ slideId }) => {
    const capture = await operations.capture(slideId);
    return {
      content: [
        { type: 'text' as const, text: JSON.stringify({ slideId: capture.slideId, mimeType: capture.mimeType, width: capture.width, height: capture.height }) },
        { type: 'image' as const, data: capture.data, mimeType: capture.mimeType },
      ],
      structuredContent: { slideId: capture.slideId, mimeType: capture.mimeType, width: capture.width, height: capture.height },
    };
  });
  server.registerTool('apply_edit', {
    title: 'Apply guarded source edit',
    description: 'Apply one or more exact old-text replacements inside the project. The edit refuses ambiguity, stale content, traversal, and non-source paths, then creates an undo checkpoint.',
    inputSchema: z.object({
      edits: z.array(z.object({
        path: z.string().trim().min(1),
        oldText: z.string().min(1),
        newText: z.string(),
        expectedSha256: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
      })).min(1).max(24),
    }),
    annotations: SOURCE_EDIT,
  }, async ({ edits }) => result(await operations.applyEdits(edits)));
  server.registerTool('list_slide_templates', {
    title: 'List slide templates',
    description: 'List the built-in slide recipes with their IDs, labels, and descriptions. Call this before insert_slide so new slides start from a real layout.',
    inputSchema: z.object({}),
    annotations: READ_ONLY,
  }, async () => result({ templates: await operations.listSlideTemplates() }));
  server.registerTool('insert_slide', {
    title: 'Insert slides from a template',
    description: 'Append one or more slides from a template recipe, adding required component imports, assigning unique URL-safe IDs, and validating the deck. Prefer this over apply_edit for adding slides; pass count to add several at once.',
    inputSchema: z.object({
      templateId: z.string().trim().min(1).max(60),
      count: z.number().int().min(1).max(50).optional().default(1),
    }),
    annotations: SOURCE_EDIT,
  }, async ({ templateId, count }) => {
    const inserted = [];
    for (let index = 0; index < count; index += 1) inserted.push(await operations.insertSlide(templateId));
    return result({ inserted: inserted.length, slideIds: inserted.map((item) => item.slideId), last: inserted.at(-1) });
  });
  server.registerTool('new_deck', {
    title: 'Start a new deck',
    description: 'Replace the authoritative deck with a single fresh slide from a template. Use only when the author asked to start over; undo restores the previous deck.',
    inputSchema: z.object({ templateId: z.string().trim().min(1).max(60).optional() }),
    annotations: DESTRUCTIVE_EDIT,
  }, async ({ templateId }) => result(await operations.newDeck(templateId)));
  server.registerTool('replace_selected_text', {
    title: 'Replace the selected text',
    description: 'Replace the exact visible text of the current semantic selection in the authoritative TSX, then validate. Use when the author selected an element and asked to reword it.',
    inputSchema: z.object({ text: z.string().min(1).max(2000) }),
    annotations: SOURCE_EDIT,
  }, async ({ text }) => result(await operations.replaceSelectedText(text)));
  server.registerTool('save_deck', {
    title: 'Save and check the deck',
    description: 'Confirm the authoritative deck file on disk and return its validation result and content hash.',
    inputSchema: z.object({}),
    annotations: LOCAL_MUTATION,
  }, async () => result(await operations.save()));
  server.registerTool('delete_slide', {
    title: 'Delete slide',
    description: 'Delete one authoritative <Slide> by exact ID with a guarded checkpoint, refuse the final slide, and validate the resulting deck.',
    inputSchema: z.object({ slideId: z.string().trim().min(1).max(120) }),
    annotations: DESTRUCTIVE_EDIT,
  }, async ({ slideId }) => result(await operations.deleteSlide(slideId)));
  server.registerTool('undo', {
    title: 'Undo last OpenPresent edit',
    description: 'Step back one Studio-owned edit and refuse if a changed file has diverged since that edit. Can be called repeatedly to walk back through the history.',
    inputSchema: z.object({}),
    annotations: { ...SOURCE_EDIT, destructiveHint: true },
  }, async () => result(await operations.undo()));
  server.registerTool('redo', {
    title: 'Redo the last undone edit',
    description: 'Re-apply the most recently undone Studio-owned edit, refusing if a file has diverged since it was undone.',
    inputSchema: z.object({}),
    annotations: SOURCE_EDIT,
  }, async () => result(await operations.redo()));
  return server;
}

export interface McpArguments {
  project: string;
  entry?: string;
  studioPort?: number;
  previewPort?: number;
  attachUrl?: string;
  token?: string;
  open: boolean;
  create: boolean;
  skill?: string;
}

export function parseMcpArguments(argv = process.argv.slice(2)): McpArguments {
  const values: McpArguments = {
    project: process.env.OPENPRESENT_PROJECT ?? '.',
    attachUrl: process.env.OPENPRESENT_STUDIO_URL,
    token: process.env.OPENPRESENT_STUDIO_TOKEN,
    open: false,
    create: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    const next = () => {
      const item = argv[++index];
      if (!item) throw new Error(`${value} requires a value.`);
      return item;
    };
    if (value === '--project') values.project = next();
    else if (value === '--entry') values.entry = next();
    else if (value === '--studio-port') values.studioPort = Number(next());
    else if (value === '--preview-port') values.previewPort = Number(next());
    else if (value === '--attach-url') values.attachUrl = next();
    else if (value === '--token') values.token = next();
    else if (value === '--attach') values.attachUrl = values.attachUrl ?? process.env.OPENPRESENT_STUDIO_URL;
    else if (value === '--open') values.open = true;
    else if (value === '--create') values.create = true;
    else if (value === '--skill') values.skill = next();
    else if (value === '--help' || value === '-h') {
      process.stderr.write('Usage: openpresent-mcp --project <dir> [--entry <file>] [--open]\n       openpresent-mcp --project <empty-dir> --create [--skill deck-direction]\n       openpresent-mcp --attach-url <loopback-url> --token <token>\n');
      process.exitCode = 0;
      return values;
    } else throw new Error(`Unknown @openpresent/mcp option: ${value}`);
  }
  if ((values.attachUrl && !values.token) || (!values.attachUrl && values.token)) throw new Error('Attaching requires both a loopback Studio URL and session token.');
  if (values.create && values.attachUrl) throw new Error('--create cannot be combined with attach mode.');
  for (const [name, port] of [['studio-port', values.studioPort], ['preview-port', values.previewPort]] as const) {
    if (port !== undefined && (!Number.isInteger(port) || port < 0 || port > 65535)) throw new Error(`--${name} must be a valid TCP port.`);
  }
  return values;
}

export async function runMcp(argv = process.argv.slice(2)) {
  const options = parseMcpArguments(argv);
  let studio: StudioServer | undefined;
  const operations = options.attachUrl
    ? connectStudio({ url: options.attachUrl, token: options.token! })
    : (studio = await startStudio({
      projectRoot: resolve(options.project), entry: options.entry, studioPort: options.studioPort,
      previewPort: options.previewPort, open: options.open,
      create: options.create, skill: options.skill,
      // Re-enter this exact installed file for ACP client-provided MCP. This works
      // from a packed tarball and never reaches for an unpublished registry tag.
      mcpCommand: process.execPath,
      mcpArgs: [fileURLToPath(import.meta.url)],
    })).engine;
  const handle = serveStdio(() => createMcpServer(operations), { onerror: (error) => console.error(`[OpenPresent MCP] ${error.message}`) });
  console.error(`[OpenPresent MCP] ready${studio ? ` at ${studio.url}` : `; attached to ${options.attachUrl}`}`);
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    await handle.close().catch(() => undefined);
    await studio?.close().catch(() => undefined);
  };
  process.once('SIGINT', () => void shutdown().finally(() => process.exit(0)));
  process.once('SIGTERM', () => void shutdown().finally(() => process.exit(0)));
  process.stdin.once('end', () => void shutdown());
  return { handle, studio, operations, close: shutdown };
}

/**
 * True when this file was started directly, including through the symlink npm
 * and npx place in node_modules/.bin. Comparing unresolved paths made that
 * symlink look like a different file, so every npx and global invocation exited
 * silently without ever running anything.
 */
function startedDirectly(): boolean {
  const invoked = process.argv[1];
  if (!invoked) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(resolve(invoked));
  } catch {
    return false;
  }
}

if (startedDirectly()) void runMcp().catch((error) => {
  console.error(`[OpenPresent MCP] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
