// @vitest-environment node
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StudioOperations, StudioState } from '@openpresent/studio';
import { createMcpServer, MCP_INSTRUCTIONS, parseMcpArguments } from './index';

const servers: Array<{ close(): Promise<void> }> = [];
const clients: Client[] = [];
afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close().catch(() => undefined)));
  await Promise.all(servers.splice(0).map((server) => server.close().catch(() => undefined)));
});

function state(): StudioState {
  return {
    version: 1,
    revision: 3,
    projectRoot: '/tmp/deck',
    entry: 'src/deck.tsx',
    studioUrl: 'http://127.0.0.1:4100',
    previewUrl: 'http://127.0.0.1:5100',
    outline: [{ id: 'opening', title: 'Opening', index: 0 }],
    activeSlideId: 'opening',
    validation: { lifecycle: 'clean', diagnostics: [], errorCount: 0, warningCount: 0 },
    changedFiles: [],
    persistence: { mode: 'autosave', lastSavedAt: '2026-08-22T00:00:00.000Z', sourceSha256: 'a'.repeat(64) },
    undoAvailable: false,
    redoAvailable: false,
    history: [],
    agents: [],
    agent: { lifecycle: 'disconnected', transcript: [], autoApproveSafe: true },
  };
}

async function harness(selection: Awaited<ReturnType<StudioOperations['getSelection']>> = undefined) {
  const shared = state();
  const operations: StudioOperations = {
    getState: vi.fn(async () => shared),
    getOutline: vi.fn(async () => shared.outline),
    getSelection: vi.fn(async () => selection),
    listSlideTemplates: vi.fn(async () => []),
    newDeck: vi.fn(async () => ({ checkpointId: 'checkpoint', changedFiles: ['src/deck.tsx'], templateId: 'blank' as const, slideId: 'opening', validation: { valid: true, diagnostics: [], errorCount: 0, warningCount: 0 } })),
    open: vi.fn(async () => ({ studioUrl: shared.studioUrl, previewUrl: shared.previewUrl })),
    navigate: vi.fn(async (slideId) => ({ ...shared, activeSlideId: slideId, revision: shared.revision + 1 })),
    validate: vi.fn(async () => ({ valid: true, diagnostics: [], errorCount: 0, warningCount: 0 })),
    capture: vi.fn(async (slideId) => ({ slideId: slideId ?? 'opening', mimeType: 'image/png' as const, data: 'iVBORw0KGgo=', width: 1440, height: 810 })),
    applyEdits: vi.fn(async () => ({ checkpointId: 'checkpoint', changedFiles: ['src/deck.tsx'] })),
    replaceSelectedText: vi.fn(async () => ({ checkpointId: 'checkpoint', changedFiles: ['src/deck.tsx'], selection: selection!, validation: { valid: true, diagnostics: [], errorCount: 0, warningCount: 0 } })),
    deleteSlide: vi.fn(async (slideId) => ({ checkpointId: 'checkpoint', changedFiles: ['src/deck.tsx'], deletedSlideId: slideId, activeSlideId: 'opening', validation: { valid: true, diagnostics: [], errorCount: 0, warningCount: 0 } })),
    insertSlide: vi.fn(async (templateId) => ({ checkpointId: 'checkpoint', changedFiles: ['src/deck.tsx'], templateId: templateId as 'blank', slideId: 'new-slide', validation: { valid: true, diagnostics: [], errorCount: 0, warningCount: 0 } })),
    save: vi.fn(async () => ({ path: 'src/deck.tsx', savedAt: '2026-08-22T00:00:00.000Z', sourceSha256: 'a'.repeat(64), validation: { valid: true, diagnostics: [], errorCount: 0, warningCount: 0 } })),
    undo: vi.fn(async () => ({ checkpointId: 'checkpoint', restoredFiles: ['src/deck.tsx'] })),
    redo: vi.fn(async () => ({ checkpointId: 'checkpoint', restoredFiles: ['src/deck.tsx'] })),
    revertTo: vi.fn(async () => [{ checkpointId: 'checkpoint', restoredFiles: ['src/deck.tsx'] }]),
  };
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createMcpServer(operations);
  servers.push(server);
  await server.connect(serverTransport);
  const client = new Client({ name: 'openpresent-mcp-test', version: '1.0.0' });
  clients.push(client);
  await client.connect(clientTransport);
  return { client, operations };
}

describe('@openpresent/mcp tools', () => {
  it('keeps the opening workflow self-contained at the front of its instructions', () => {
    expect(MCP_INSTRUCTIONS.slice(0, 512)).toMatch(/open_workspace/);
    expect(MCP_INSTRUCTIONS.slice(0, 512)).toMatch(/get_selection/);
    expect(MCP_INSTRUCTIONS.slice(0, 512)).toMatch(/apply_edit/);
    expect(MCP_INSTRUCTIONS.slice(0, 512)).toMatch(/validate_deck/);
  });

  it('lists and calls the complete compact tool surface with deliberate annotations', async () => {
    const { client, operations } = await harness();
    const listed = await client.listTools();
    expect(listed.tools.map(({ name }) => name)).toEqual([
      'open_workspace', 'get_state', 'get_outline', 'get_selection', 'navigate_slide',
      'validate_deck', 'capture_slide', 'apply_edit',
      'list_slide_templates', 'insert_slide', 'new_deck', 'replace_selected_text', 'save_deck',
      'delete_slide', 'undo', 'redo',
    ]);
    // Adding slides must be a first-class tool, not hand-written TSX edits.
    expect(listed.tools.find(({ name }) => name === 'insert_slide')?.annotations?.readOnlyHint).toBe(false);
    expect(listed.tools.find(({ name }) => name === 'new_deck')?.annotations?.destructiveHint).toBe(true);
    expect(listed.tools.find(({ name }) => name === 'get_state')?.annotations?.readOnlyHint).toBe(true);
    expect(listed.tools.find(({ name }) => name === 'apply_edit')?.annotations?.readOnlyHint).toBe(false);
    expect(listed.tools.find(({ name }) => name === 'delete_slide')?.annotations?.destructiveHint).toBe(true);

    expect((await client.callTool({ name: 'open_workspace', arguments: {} })).structuredContent).toMatchObject({ studioUrl: expect.stringContaining('127.0.0.1') });
    expect((await client.callTool({ name: 'get_state', arguments: {} })).structuredContent).toMatchObject({ activeSlideId: 'opening' });
    expect((await client.callTool({ name: 'get_outline', arguments: {} })).structuredContent).toMatchObject({ slides: [{ id: 'opening' }] });
    expect((await client.callTool({ name: 'get_selection', arguments: {} })).structuredContent).toEqual({ selection: null });
    expect((await client.callTool({ name: 'navigate_slide', arguments: { slideId: 'opening' } })).structuredContent).toMatchObject({ activeSlideId: 'opening' });
    expect((await client.callTool({ name: 'validate_deck', arguments: { browser: true } })).structuredContent).toMatchObject({ valid: true });
    const capture = await client.callTool({ name: 'capture_slide', arguments: { slideId: 'opening' } });
    expect(capture.content).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'image', mimeType: 'image/png' })]));
    expect((await client.callTool({ name: 'apply_edit', arguments: { edits: [{ path: 'src/deck.tsx', oldText: 'old', newText: 'new' }] } })).structuredContent).toMatchObject({ checkpointId: 'checkpoint' });
    expect((await client.callTool({ name: 'delete_slide', arguments: { slideId: 'detail' } })).structuredContent).toMatchObject({ deletedSlideId: 'detail' });
    expect((await client.callTool({ name: 'undo', arguments: {} })).structuredContent).toMatchObject({ restoredFiles: ['src/deck.tsx'] });
    expect(operations.validate).toHaveBeenCalledWith({ browser: true });
    expect(operations.applyEdits).toHaveBeenCalledWith([{ path: 'src/deck.tsx', oldText: 'old', newText: 'new' }]);
    expect(operations.deleteSlide).toHaveBeenCalledWith('detail');
  });

  it('rejects malformed guarded edit inputs before touching operations', async () => {
    const { client, operations } = await harness();
    const response = await client.callTool({ name: 'apply_edit', arguments: { edits: [] } });
    expect(response.isError).toBe(true);
    expect(operations.applyEdits).not.toHaveBeenCalled();
  });
});

describe('MCP command arguments', () => {
  it('parses start and attach modes and rejects partial attachment credentials', () => {
    expect(parseMcpArguments(['--project', 'deck', '--studio-port', '0', '--preview-port', '5174', '--open'])).toMatchObject({
      project: 'deck', studioPort: 0, previewPort: 5174, open: true,
    });
    expect(parseMcpArguments(['--attach-url', 'http://127.0.0.1:4100', '--token', 'secret'])).toMatchObject({
      attachUrl: 'http://127.0.0.1:4100', token: 'secret',
    });
    expect(() => parseMcpArguments(['--attach-url', 'http://127.0.0.1:4100'])).toThrow(/requires both/);
    expect(() => parseMcpArguments(['--studio-port', '99999'])).toThrow(/valid TCP port/);
  });
});
