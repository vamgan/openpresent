// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { StudioEngine } from './engine';

const temporary: string[] = [];
afterEach(() => {
  for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true });
});

function write(path: string, contents: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function fixture(extraArgs: string[] = []) {
  const root = mkdtempSync(join(tmpdir(), 'openpresent-acp-test-'));
  temporary.push(root);
  const log = join(root, 'fake-agent.jsonl');
  const fake = resolve('tests/fixtures/fake-acp-agent.mjs');
  write(join(root, 'index.html'), '<div id="root"></div>\n');
  write(join(root, 'package.json'), '{"name":"fake-acp-deck","type":"module"}\n');
  write(join(root, 'src/deck.tsx'), `
    import { defineDeck, Slide } from '@openpresent/core';
    export const deck = defineDeck({ metadata: { id: 'fake-acp', title: 'Fake ACP' }, slides: [
      <Slide id="opening" title="Opening"><h1>Original phrase</h1><p>Context</p></Slide>,
    ] });
  `);
  write(join(root, '.openpresent/agents.json'), JSON.stringify({ profiles: [{
    id: 'fake', label: 'Deterministic fake', command: process.execPath,
    args: [fake, '--from', 'Original phrase', '--to', 'Directed phrase', '--log', log, ...extraArgs],
  }] }));
  return { root, log };
}

async function waitFor(check: () => boolean | Promise<boolean>, timeout = 4_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((done) => setTimeout(done, 20));
  }
  throw new Error('Timed out waiting for fake ACP lifecycle state.');
}

async function pendingPermission(engine: StudioEngine) {
  await waitFor(async () => Boolean((await engine.getState()).agent.pendingPermission));
  return (await engine.getState()).agent.pendingPermission!;
}

describe('stable ACP v1 edit lifecycle', () => {
  it('streams context, requests permission, edits through guarded FS callbacks, cancels, undoes, and exits', async () => {
    const { root, log } = fixture();
    const engine = new StudioEngine({ projectRoot: root });
    await engine.setSelection({
      version: 1, type: 'openpresent.selection', slideId: 'opening', component: 'Hero', tag: 'section',
      text: 'Original phrase', breadcrumb: 'section.hero > h1', snippet: '<h1>Original phrase</h1>',
      bounds: { x: 120, y: 140, width: 800, height: 260 },
    });

    const edited = await engine.promptAgent('fake', 'Make the selected opening more decisive.');
    expect(edited.stopReason).toBe('end_turn');
    expect(edited.changedFiles).toEqual(['src/deck.tsx']);
    expect(readFileSync(join(root, 'src/deck.tsx'), 'utf8')).toContain('Directed phrase');
    const afterEdit = await engine.getState();
    expect(afterEdit.agent.lifecycle).toBe('ready');
    expect(afterEdit.agent.transcript.map(({ role }) => role)).toEqual(expect.arrayContaining(['user', 'agent', 'tool', 'permission']));
    const logText = readFileSync(log, 'utf8');
    expect(logText).toContain('OpenPresent local authoring request');
    expect(logText).toContain('Active slide: opening');
    expect(logText).toContain('section.hero > h1');
    expect(logText).toContain('Deck Direction guidance');

    await engine.undo();
    expect(readFileSync(join(root, 'src/deck.tsx'), 'utf8')).toContain('Original phrase');

    const cancellation = engine.promptAgent('fake', 'FAKE_CANCEL');
    await waitFor(() => readFileSync(log, 'utf8').includes('FAKE_CANCEL'));
    await engine.cancelAgent();
    expect((await cancellation).stopReason).toBe('cancelled');
    await engine.stopAgent();
    expect((await engine.getState()).agent.lifecycle).toBe('disconnected');
    await engine.dispose();
  }, 20_000);

  it('resumes the previous conversation instead of starting a new one', async () => {
    const { root, log } = fixture();
    const first = new StudioEngine({ projectRoot: root });
    await first.promptAgent('fake', 'Make the selected opening more decisive.');
    expect((await first.getState()).agent.resumeSessionId).toBe('fake-session');
    await first.dispose();

    // Reopening offers the stored session back, so the agent continues it.
    const reopened = new StudioEngine({ projectRoot: root });
    expect((await reopened.getState()).agent.resumeSessionId).toBe('fake-session');
    await reopened.startAgent('fake');
    const state = await reopened.getState();
    expect(state.agent.lifecycle).toBe('ready');
    expect(state.agent.transcript.some((item) => /Resumed the previous/.test(item.text))).toBe(true);
    expect(readFileSync(log, 'utf8')).toContain('session-resume');
    await reopened.dispose();
  }, 20_000);

  it('rejects out-of-root ACP permission requests automatically', async () => {
    const { root, log } = fixture(['--outside']);
    const engine = new StudioEngine({ projectRoot: root });
    const result = await engine.promptAgent('fake', 'Try the unsafe proposal.');
    expect(result.stopReason).toBe('refusal');
    expect(result.changedFiles).toEqual([]);
    expect(readFileSync(join(root, 'src/deck.tsx'), 'utf8')).toContain('Original phrase');
    expect((await engine.getState()).agent.transcript).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'permission', status: 'denied' }),
    ]));
    expect(readFileSync(log, 'utf8')).toContain('permission-denied');
    await engine.dispose();
  }, 20_000);

  it('surfaces destructive permission requests for explicit approval and honors denial', async () => {
    const { root, log } = fixture(['--destructive']);
    const engine = new StudioEngine({ projectRoot: root });
    const turn = engine.promptAgent('fake', 'Try the unsafe proposal.');
    const pending = await pendingPermission(engine);
    expect(pending.risk).toBe('destructive');
    expect(pending.options.map(({ kind }) => kind)).toEqual(['allow_once', 'reject_once']);
    await engine.respondPermission(pending.id, pending.options.find(({ kind }) => kind === 'reject_once')!.optionId);
    const result = await turn;
    expect(result.stopReason).toBe('refusal');
    expect(readFileSync(join(root, 'src/deck.tsx'), 'utf8')).toContain('Original phrase');
    expect((await engine.getState()).agent.pendingPermission).toBeUndefined();
    expect(readFileSync(log, 'utf8')).toContain('permission-denied');
    await engine.dispose();
  }, 20_000);

  it('applies destructive-labelled edits after an explicit user approval', async () => {
    const { root } = fixture(['--destructive']);
    const engine = new StudioEngine({ projectRoot: root });
    const turn = engine.promptAgent('fake', 'Try the risky-looking edit.');
    const pending = await pendingPermission(engine);
    await engine.respondPermission(pending.id, pending.options.find(({ kind }) => kind === 'allow_once')!.optionId);
    const result = await turn;
    expect(result.stopReason).toBe('end_turn');
    expect(result.changedFiles).toEqual(['src/deck.tsx']);
    expect(readFileSync(join(root, 'src/deck.tsx'), 'utf8')).toContain('Directed phrase');
    expect((await engine.getState()).agent.transcript).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'permission', status: 'complete', text: expect.stringContaining('approved by you') }),
    ]));
    await engine.dispose();
  }, 20_000);

  it('asks for every permission when safe auto-approval is disabled', async () => {
    const { root } = fixture();
    const engine = new StudioEngine({ projectRoot: root });
    await engine.setAutoApprove(false);
    const turn = engine.promptAgent('fake', 'Make the selected opening more decisive.');
    const pending = await pendingPermission(engine);
    expect(pending.risk).toBe('safe');
    await engine.respondPermission(pending.id, pending.options.find(({ kind }) => kind === 'allow_once')!.optionId);
    const result = await turn;
    expect(result.stopReason).toBe('end_turn');
    expect(readFileSync(join(root, 'src/deck.tsx'), 'utf8')).toContain('Directed phrase');
    await engine.dispose();
  }, 20_000);
});
