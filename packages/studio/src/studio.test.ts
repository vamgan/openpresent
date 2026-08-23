// @vitest-environment node
import { createServer as createNetServer } from 'node:net';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { BUILTIN_AGENT_PROFILES, discoverAgentProfiles, loadAgentProfiles } from './agents';
import { CheckpointManager, sha256 } from './checkpoints';
import { StudioEngine } from './engine';
import { forgetDocument, readLibrary } from './library';
import { resolveProjectPath } from './security';
import { scaffoldStudioProject } from './scaffold';
import { startStudio } from './server';
import { normalizeSelection } from './types';

const temporary: string[] = [];

/** Matches the realpath canonicalization the engine applies to project roots. */
function canonical(path: string) { return realpathSync(resolve(path)); }

afterEach(() => {
  // Vite finishes writing its dependency cache after a server closes, so a
  // single removal can race it. Retry rather than failing an unrelated test.
  for (const path of temporary.splice(0)) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try { rmSync(path, { recursive: true, force: true, maxRetries: 3, retryDelay: 40 }); break; }
      catch { /* keep trying while the writer drains */ }
    }
  }
});

function write(path: string, contents: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function project() {
  const root = mkdtempSync(join(tmpdir(), 'openpresent-studio-test-'));
  temporary.push(root);
  write(join(root, 'package.json'), '{"name":"studio-test","type":"module"}\n');
  write(join(root, 'index.html'), '<div id="root"></div><script type="module" src="/src/main.tsx"></script>\n');
  write(join(root, 'src/main.tsx'), 'document.querySelector("#root")!.textContent = "preview";\n');
  write(join(root, 'src/deck.tsx'), `
    import { defineDeck, Slide } from '@openpresent/core';
    export const deck = defineDeck({ metadata: { id: 'test', title: 'Studio Test' }, slides: [
      <Slide id="opening" title="Opening"><h1>Original phrase</h1></Slide>,
      <Slide id="detail" title="Detail"><p>Details</p></Slide>,
    ] });
  `);
  return root;
}

describe('selection normalization and profile discovery', () => {
  it('normalizes a bounded protocol-v1 selection and rejects malformed input', () => {
    const selection = normalizeSelection({
      version: 1,
      type: 'openpresent.selection',
      slideId: ' opening ',
      component: 'Hero',
      tag: 'H1',
      text: `  ${'visible '.repeat(80)}  `,
      breadcrumb: 'main > h1',
      snippet: '<h1>Visible</h1>',
      bounds: { x: 1.234, y: 2.345, width: 300.126, height: -4 },
    });
    expect(selection.slideId).toBe('opening');
    expect(selection.tag).toBe('h1');
    expect(selection.text.length).toBeLessThanOrEqual(320);
    expect(selection.bounds).toEqual({ x: 1.23, y: 2.35, width: 300.13, height: 0 });
    expect(() => normalizeSelection({ version: 2 })).toThrow(/protocol v1/);
    expect(() => normalizeSelection({ version: 1, type: 'openpresent.selection' })).toThrow(/slideId/);
  });

  it('models all built-ins and project-local custom overrides without launching them', () => {
    const root = project();
    write(join(root, '.openpresent/agents.json'), JSON.stringify({ profiles: [
      { id: 'codex', label: 'Local Codex override', command: '/custom/codex', args: ['acp'] },
      { id: 'fake', label: 'Fake', command: process.execPath, args: ['fake.mjs'] },
    ] }));
    const profiles = loadAgentProfiles(root);
    expect(BUILTIN_AGENT_PROFILES.map(({ id }) => id)).toEqual(['codex', 'claude', 'gemini', 'kiro']);
    expect(BUILTIN_AGENT_PROFILES.find(({ id }) => id === 'codex')?.args).toEqual([
      '-y', '--package', '@openai/codex', '--package', '@agentclientprotocol/codex-acp', 'codex-acp',
    ]);
    expect(profiles.find(({ id }) => id === 'codex')).toMatchObject({ source: 'custom', command: '/custom/codex' });
    expect(profiles.find(({ id }) => id === 'fake')).toMatchObject({ source: 'custom' });
    const discovered = discoverAgentProfiles(profiles, (command) => command === process.execPath);
    expect(discovered.find(({ id }) => id === 'fake')?.availability).toBe('ready');
    expect(discovered.find(({ id }) => id === 'codex')?.availability).toBe('missing');
  });

  it('discovers the Gemini ACP flag from installed command capabilities', () => {
    const gemini = BUILTIN_AGENT_PROFILES.find(({ id }) => id === 'gemini')!;
    const experimental = discoverAgentProfiles([gemini], () => true, () => '  --experimental-acp  Start experimental ACP server');
    expect(experimental[0]).toMatchObject({ availability: 'ready', args: ['--experimental-acp'] });
    const stable = discoverAgentProfiles([gemini], () => true, () => '  --acp  Start ACP server');
    expect(stable[0]).toMatchObject({ availability: 'ready', args: ['--acp'] });
    const incompatible = discoverAgentProfiles([gemini], () => true, () => 'Gemini help without agent protocol');
    expect(incompatible[0]).toMatchObject({ availability: 'missing' });
  });
});

describe('project boundaries and guarded checkpoints', () => {
  it('rejects traversal, blocked paths, non-source files, and symlinks leaving the root', () => {
    const root = project();
    const outside = mkdtempSync(join(tmpdir(), 'openpresent-outside-'));
    temporary.push(outside);
    write(join(outside, 'secret.ts'), 'secret');
    symlinkSync(join(outside, 'secret.ts'), join(root, 'linked.ts'));
    write(join(root, '.git/config'), 'private');
    write(join(root, 'binary.bin'), 'data');
    expect(() => resolveProjectPath(root, '../escape.ts')).toThrow(/escapes/);
    expect(() => resolveProjectPath(root, 'linked.ts', { mustExist: true })).toThrow(/outside/);
    expect(() => resolveProjectPath(root, '.git/config', { mustExist: true })).toThrow(/editable presentation/);
    expect(() => resolveProjectPath(root, 'binary.bin', { editable: true })).toThrow(/Unsupported/);
  });

  it('applies and restores multi-file edits while preserving unrelated user changes', () => {
    const root = project();
    write(join(root, 'src/theme.css'), ':root { color: black; }\n');
    write(join(root, 'notes.md'), 'user notes\n');
    const checkpoints = new CheckpointManager(root);
    const edit = checkpoints.applyGuarded([
      { path: 'src/deck.tsx', oldText: 'Original phrase', newText: 'Directed phrase' },
      { path: 'src/theme.css', oldText: 'black', newText: 'coral' },
    ]);
    write(join(root, 'notes.md'), 'user notes changed outside studio\n');
    expect(edit.changedFiles).toEqual(['src/deck.tsx', 'src/theme.css']);
    expect(checkpoints.undo().restoredFiles).toEqual(['src/deck.tsx', 'src/theme.css']);
    expect(readFileSync(join(root, 'src/deck.tsx'), 'utf8')).toContain('Original phrase');
    expect(readFileSync(join(root, 'src/theme.css'), 'utf8')).toContain('black');
    expect(readFileSync(join(root, 'notes.md'), 'utf8')).toContain('changed outside studio');
    checkpoints.dispose();
  });

  it('folds a guarded edit into the agent turn already in progress', () => {
    const root = project();
    write(join(root, 'src/theme.css'), ':root { color: black; }\n');
    const checkpoints = new CheckpointManager(root);

    // An agent turn opens a step, then reaches an MCP apply_edit mid-turn.
    checkpoints.begin(['src/deck.tsx', 'src/theme.css'], 'Agent turn');
    const edit = checkpoints.applyGuarded([{ path: 'src/theme.css', oldText: 'black', newText: 'coral' }]);

    // The guarded edit reports only its own file, and the turn is still open,
    // so the agent's later writes still belong to a live checkpoint.
    expect(edit.changedFiles).toEqual(['src/theme.css']);
    expect(checkpoints.hasPath('src/deck.tsx')).toBe(true);
    expect(checkpoints.available).toBe(false);

    checkpoints.writeFromAgent(
      'src/deck.tsx',
      readFileSync(join(root, 'src/deck.tsx'), 'utf8').replace('Original phrase', 'Directed phrase'),
      sha256(readFileSync(join(root, 'src/deck.tsx'), 'utf8')),
    );
    checkpoints.commit('Agent turn');

    // Both files land as one undoable step rather than the turn being lost.
    expect(checkpoints.history()).toHaveLength(1);
    expect(checkpoints.undo().restoredFiles.sort()).toEqual(['src/deck.tsx', 'src/theme.css']);
    expect(readFileSync(join(root, 'src/theme.css'), 'utf8')).toContain('black');
    expect(readFileSync(join(root, 'src/deck.tsx'), 'utf8')).toContain('Original phrase');
    checkpoints.dispose();
  });

  it('reports no changed files for a turn that changed nothing', () => {
    const root = project();
    const checkpoints = new CheckpointManager(root);
    checkpoints.applyGuarded([{ path: 'src/deck.tsx', oldText: 'Original phrase', newText: 'Directed phrase' }], 'First edit');

    // A later turn opens and writes nothing. It must not inherit the files the
    // previous edit changed and show them as freshly changed.
    checkpoints.begin(['src/deck.tsx'], 'Empty turn');
    expect(checkpoints.discardIfUnchanged()).toEqual([]);
    expect(checkpoints.history()).toHaveLength(1);
    checkpoints.dispose();
  });

  it('walks back and forward through several labelled edits', () => {
    const root = project();
    const deck = join(root, 'src/deck.tsx');
    const checkpoints = new CheckpointManager(root);

    checkpoints.applyGuarded([{ path: 'src/deck.tsx', oldText: 'Original phrase', newText: 'Second phrase' }], 'First edit');
    checkpoints.applyGuarded([{ path: 'src/deck.tsx', oldText: 'Second phrase', newText: 'Third phrase' }], 'Second edit');
    checkpoints.applyGuarded([{ path: 'src/deck.tsx', oldText: 'Details', newText: 'More details' }], 'Third edit');
    expect(checkpoints.history().map(({ label }) => label)).toEqual(['First edit', 'Second edit', 'Third edit']);

    // Three steps back, not one: the old single checkpoint could only undo once.
    expect(checkpoints.undo().label).toBe('Third edit');
    expect(checkpoints.undo().label).toBe('Second edit');
    expect(readFileSync(deck, 'utf8')).toContain('Second phrase');
    expect(checkpoints.undo().label).toBe('First edit');
    expect(readFileSync(deck, 'utf8')).toContain('Original phrase');
    expect(checkpoints.available).toBe(false);
    expect(() => checkpoints.undo()).toThrow(/no studio-owned edit to undo/);

    expect(checkpoints.redoAvailable).toBe(true);
    expect(checkpoints.redo().label).toBe('First edit');
    expect(checkpoints.redo().label).toBe('Second edit');
    expect(readFileSync(deck, 'utf8')).toContain('Third phrase');

    // A fresh edit abandons the branch that was undone.
    checkpoints.applyGuarded([{ path: 'src/deck.tsx', oldText: 'Third phrase', newText: 'Branched phrase' }], 'Branch edit');
    expect(checkpoints.redoAvailable).toBe(false);
    expect(checkpoints.history().map(({ label }) => label)).toEqual(['First edit', 'Second edit', 'Branch edit']);
    checkpoints.dispose();
  });

  it('groups an agent turn touching several files into one undo step', () => {
    const root = project();
    write(join(root, 'src/theme.css'), ':root { color: black; }\n');
    const checkpoints = new CheckpointManager(root);
    checkpoints.begin(['src/deck.tsx', 'src/theme.css'], 'Agent: tighten the opening');
    writeFileSync(join(root, 'src/deck.tsx'), readFileSync(join(root, 'src/deck.tsx'), 'utf8').replace('Original phrase', 'Agent phrase'));
    writeFileSync(join(root, 'src/theme.css'), ':root { color: coral; }\n');
    checkpoints.noteAfter(['src/deck.tsx', 'src/theme.css']);
    checkpoints.commit();

    expect(checkpoints.history().map(({ label }) => label)).toEqual(['Agent: tighten the opening']);
    expect(checkpoints.undo().restoredFiles).toEqual(['src/deck.tsx', 'src/theme.css']);
    expect(readFileSync(join(root, 'src/deck.tsx'), 'utf8')).toContain('Original phrase');
    expect(readFileSync(join(root, 'src/theme.css'), 'utf8')).toContain('black');
    expect(checkpoints.available).toBe(false);
    checkpoints.dispose();
  });

  it('refuses undo when the studio-owned file diverges after its edit', () => {
    const root = project();
    const checkpoints = new CheckpointManager(root);
    checkpoints.applyGuarded([{ path: 'src/deck.tsx', oldText: 'Original phrase', newText: 'Directed phrase' }]);
    write(join(root, 'src/deck.tsx'), `${readFileSync(join(root, 'src/deck.tsx'), 'utf8')}\n// user follow-up\n`);
    expect(() => checkpoints.undo()).toThrow(/changed after the studio edit/);
    checkpoints.dispose();
  });
});

describe('shared engine and loopback server', () => {
  it('scaffolds only an explicit empty target with optional Deck Direction skill', () => {
    const parent = mkdtempSync(join(tmpdir(), 'openpresent-studio-create-'));
    temporary.push(parent);
    const target = join(parent, 'new-deck');
    expect(scaffoldStudioProject(target, { skill: 'deck-direction' })).toBe(resolve(target));
    expect(readFileSync(join(target, 'package.json'), 'utf8')).toContain('new-deck');
    expect(readFileSync(join(target, '.agents/skills/deck-direction/SKILL.md'), 'utf8')).toContain('name: deck-direction');
    expect(() => scaffoldStudioProject(target)).toThrow(/non-empty directory/);
  });

  it('keeps outline, navigation, selection, guarded edit, and undo in one state model', async () => {
    const root = project();
    const engine = new StudioEngine({ projectRoot: root, studioUrl: 'http://127.0.0.1:1', previewUrl: 'http://127.0.0.1:2' });
    expect((await engine.getOutline()).map(({ id }) => id)).toEqual(['opening', 'detail']);
    await engine.navigate('detail');
    await engine.setSelection({
      version: 1, type: 'openpresent.selection', slideId: 'opening', component: 'Hero', tag: 'section',
      text: 'Original phrase', breadcrumb: 'section.hero', snippet: '<section>Original phrase</section>',
      bounds: { x: 40, y: 50, width: 900, height: 300 },
    });
    expect((await engine.getState()).activeSlideId).toBe('opening');
    await engine.applyEdits([{ path: 'src/deck.tsx', oldText: 'Original phrase', newText: 'Directed phrase' }]);
    expect((await engine.getState()).undoAvailable).toBe(true);
    await engine.undo();
    expect(readFileSync(join(root, 'src/deck.tsx'), 'utf8')).toContain('Original phrase');
    await engine.dispose();
  });

  it('writes edits immediately, confirms saved state, and reopens from authoritative TSX', async () => {
    const root = project();
    const first = new StudioEngine({ projectRoot: root, studioUrl: 'http://127.0.0.1:1', previewUrl: 'http://127.0.0.1:2' });
    await first.applyEdits([{ path: 'src/deck.tsx', oldText: 'Original phrase', newText: 'Persisted phrase' }]);
    const saved = await first.save();
    expect(saved).toMatchObject({ path: 'src/deck.tsx', validation: { valid: true } });
    expect(saved.sourceSha256).toHaveLength(64);
    expect((await first.getState()).persistence).toMatchObject({ mode: 'autosave', sourceSha256: saved.sourceSha256 });
    // Inspecting must not claim a write: the timestamp still names the real edit.
    const beforeInspect = (await first.getState()).persistence.lastSavedAt;
    await first.save();
    expect((await first.getState()).persistence.lastSavedAt).toBe(beforeInspect);
    await first.dispose();
    const reopened = new StudioEngine({ projectRoot: root, studioUrl: 'http://127.0.0.1:3', previewUrl: 'http://127.0.0.1:4' });
    expect(readFileSync(join(root, 'src/deck.tsx'), 'utf8')).toContain('Persisted phrase');
    expect((await reopened.getOutline()).map(({ id }) => id)).toEqual(['opening', 'detail']);
    await reopened.dispose();
  });

  it('replaces exactly selected serializable TSX text and restores it through undo', async () => {
    const root = project();
    const engine = new StudioEngine({ projectRoot: root, studioUrl: 'http://127.0.0.1:1', previewUrl: 'http://127.0.0.1:2' });
    await engine.setSelection({
      version: 1, type: 'openpresent.selection', slideId: 'opening', component: 'Hero', ownerComponent: 'Hero', tag: 'h1',
      text: 'Original phrase', breadcrumb: 'section.hero > h1', ownerBreadcrumb: 'section.hero', snippet: '<h1>Original phrase</h1>',
      bounds: { x: 40, y: 50, width: 900, height: 100 },
    });
    const result = await engine.replaceSelectedText('A precise opening');
    expect(result.changedFiles).toEqual(['src/deck.tsx']);
    expect(result.selection.text).toBe('A precise opening');
    expect(readFileSync(join(root, 'src/deck.tsx'), 'utf8')).toContain('A precise opening');
    await engine.undo();
    expect(readFileSync(join(root, 'src/deck.tsx'), 'utf8')).toContain('Original phrase');
    await engine.dispose();
  });

  it('refuses unmatched text but resolves repeats using the selected slide', async () => {
    const root = project();
    const engine = new StudioEngine({ projectRoot: root, studioUrl: 'http://127.0.0.1:1', previewUrl: 'http://127.0.0.1:2' });
    const selection = (text: string) => ({
      version: 1 as const, type: 'openpresent.selection' as const, slideId: 'opening', component: 'h1', tag: 'h1', text,
      breadcrumb: 'h1', snippet: `<h1>${text}</h1>`, bounds: { x: 0, y: 0, width: 300, height: 80 },
    });
    await engine.setSelection(selection('No source match'));
    await expect(engine.replaceSelectedText('Next')).rejects.toThrow(/found 0 matches/);

    // The same phrase on another slide must not make the selected one ambiguous.
    write(join(root, 'src/deck.tsx'), readFileSync(join(root, 'src/deck.tsx'), 'utf8').replace('<p>Details</p>', '<p>Original phrase</p>'));
    await engine.setSelection(selection('Original phrase'));
    await engine.replaceSelectedText('Directed opening');
    const source = readFileSync(join(root, 'src/deck.tsx'), 'utf8');
    expect(source).toContain('<h1>Directed opening</h1>');
    expect(source).toContain('<p>Original phrase</p>');
    await engine.dispose();
  });

  it('prefers visible slide content over the Slide metadata prop holding the same text', async () => {
    const root = project();
    write(join(root, 'src/deck.tsx'), `
      import { defineDeck, Slide } from '@openpresent/core';
      export const deck = defineDeck({ metadata: { id: 'test', title: 'Studio Test' }, slides: [
        <Slide id="split" title="Claim and evidence"><h2>Claim and evidence</h2></Slide>,
      ] });
    `);
    const engine = new StudioEngine({ projectRoot: root, studioUrl: 'http://127.0.0.1:1', previewUrl: 'http://127.0.0.1:2' });
    await engine.setSelection({
      version: 1, type: 'openpresent.selection', slideId: 'split', component: 'h2', tag: 'h2',
      text: 'Claim and evidence', breadcrumb: 'h2', snippet: '<h2>Claim and evidence</h2>',
      bounds: { x: 0, y: 0, width: 400, height: 60 },
    });
    await engine.replaceSelectedText('A sharper claim');
    const source = readFileSync(join(root, 'src/deck.tsx'), 'utf8');
    expect(source).toContain('<h2>A sharper claim</h2>');
    expect(source).toContain('title="Claim and evidence"');
    await engine.dispose();
  });

  it('edits a fragment when a primitive splits one string across elements', async () => {
    const root = project();
    write(join(root, 'src/deck.tsx'), `
      import { defineDeck, Slide } from '@openpresent/core';
      import { Hero, TextReveal } from '@openpresent/components';
      export const deck = defineDeck({ metadata: { id: 'test', title: 'Studio Test' }, slides: [
        <Slide id="opening" title="Opening">
          <Hero title={<TextReveal>Ideas, rendered.</TextReveal>} subtitle="A typed runtime." />
        </Slide>,
      ] });
    `);
    const engine = new StudioEngine({ projectRoot: root, studioUrl: 'http://127.0.0.1:1', previewUrl: 'http://127.0.0.1:2' });
    // TextReveal renders one word per span, so the click reports only "rendered."
    await engine.setSelection({
      version: 1, type: 'openpresent.selection', slideId: 'opening', component: 'TextReveal',
      ownerComponent: 'TextReveal', tag: 'span', text: 'rendered.', breadcrumb: 'span > span',
      snippet: '<span>rendered.</span>', bounds: { x: 0, y: 0, width: 200, height: 60 },
    });
    await engine.replaceSelectedText('shipped.');
    expect(readFileSync(join(root, 'src/deck.tsx'), 'utf8')).toContain('<TextReveal>Ideas, shipped.</TextReveal>');
    await engine.undo();
    expect(readFileSync(join(root, 'src/deck.tsx'), 'utf8')).toContain('<TextReveal>Ideas, rendered.</TextReveal>');
    await engine.dispose();
  });

  it('still refuses genuinely identical text within one slide', async () => {
    const root = project();
    write(join(root, 'src/deck.tsx'), `
      import { defineDeck, Slide } from '@openpresent/core';
      export const deck = defineDeck({ metadata: { id: 'test', title: 'Studio Test' }, slides: [
        <Slide id="opening" title="Opening"><p>Repeated line</p><p>Repeated line</p></Slide>,
      ] });
    `);
    const engine = new StudioEngine({ projectRoot: root, studioUrl: 'http://127.0.0.1:1', previewUrl: 'http://127.0.0.1:2' });
    await engine.setSelection({
      version: 1, type: 'openpresent.selection', slideId: 'opening', component: 'p', tag: 'p',
      text: 'Repeated line', breadcrumb: 'p', snippet: '<p>Repeated line</p>',
      bounds: { x: 0, y: 0, width: 300, height: 40 },
    });
    await expect(engine.replaceSelectedText('Next')).rejects.toThrow(/found 2 matches/);
    await engine.dispose();
  });

  it('deletes one AST-identified slide, selects its neighbor, refuses the final slide, and supports undo', async () => {
    const root = project();
    const engine = new StudioEngine({ projectRoot: root, studioUrl: 'http://127.0.0.1:1', previewUrl: 'http://127.0.0.1:2' });
    const result = await engine.deleteSlide('opening');
    expect(result).toMatchObject({ deletedSlideId: 'opening', activeSlideId: 'detail', changedFiles: ['src/deck.tsx'] });
    expect((await engine.getOutline()).map(({ id }) => id)).toEqual(['detail']);
    await expect(engine.deleteSlide('detail')).rejects.toThrow(/final slide/);
    await engine.undo();
    expect((await engine.getOutline()).map(({ id }) => id)).toEqual(['opening', 'detail']);
    await engine.dispose();
  });

  it('inserts catalog recipes with imports, unique URL-safe IDs, navigation, validation, and undo', async () => {
    const root = project();
    const engine = new StudioEngine({ projectRoot: root, studioUrl: 'http://127.0.0.1:1', previewUrl: 'http://127.0.0.1:2' });
    expect((await engine.listSlideTemplates()).map(({ id }) => id)).toEqual([
      'blank', 'hero', 'metric', 'split', 'comparison', 'timeline', 'flow', 'code', 'quote', 'image',
    ]);
    const first = await engine.insertSlide('metric');
    expect(first).toMatchObject({ templateId: 'metric', slideId: 'metric' });
    let source = readFileSync(join(root, 'src/deck.tsx'), 'utf8');
    expect(source).toContain("import { Grid, Metric } from '@openpresent/components';");
    expect(source).toContain('<Slide id="metric"');
    const second = await engine.insertSlide('metric');
    expect(second.slideId).toBe('metric-2');
    expect((await engine.getState()).activeSlideId).toBe('metric-2');
    await engine.undo();
    source = readFileSync(join(root, 'src/deck.tsx'), 'utf8');
    expect(source).toContain('<Slide id="metric"');
    expect(source).not.toContain('<Slide id="metric-2"');
    await engine.dispose();
  });

  it('starts a fresh deck from a template with a checkpointed, undoable rewrite', async () => {
    const root = project();
    const engine = new StudioEngine({ projectRoot: root, studioUrl: 'http://127.0.0.1:1', previewUrl: 'http://127.0.0.1:2' });
    const result = await engine.newDeck('hero');
    expect(result).toMatchObject({ templateId: 'hero', slideId: 'opening', changedFiles: ['src/deck.tsx'] });
    const source = readFileSync(join(root, 'src/deck.tsx'), 'utf8');
    expect(source).toContain("import { Slide, Hero } from '@openpresent/components';");
    expect(source).toContain('metadata: { id: "test"');
    expect((await engine.getOutline()).map(({ id }) => id)).toEqual(['opening']);
    expect((await engine.getState()).activeSlideId).toBe('opening');
    await engine.undo();
    expect((await engine.getOutline()).map(({ id }) => id)).toEqual(['opening', 'detail']);
    await engine.dispose();
  });

  it('serves only loopback, requires a mutation token, restricts browser origin, and normalizes null selection remotely', async () => {
    const root = project();
    const assets = mkdtempSync(join(tmpdir(), 'openpresent-studio-assets-'));
    temporary.push(assets);
    write(join(assets, 'index.html'), '<!doctype html><title>Studio test</title></head><body>Studio</body>');
    const server = await startStudio({ projectRoot: root, clientAssets: assets });
    try {
      expect(new URL(server.url).hostname).toBe('127.0.0.1');
      expect(new URL(server.previewUrl).hostname).toBe('127.0.0.1');
      expect((await fetch(`${server.url}/api/state`)).status).toBe(200);
      expect((await fetch(`${server.url}/api/navigate`, { method: 'POST', body: JSON.stringify({ slideId: 'detail' }) })).status).toBe(401);
      expect((await fetch(`${server.url}/api/navigate`, {
        method: 'POST',
        headers: { authorization: `Bearer ${server.token}`, origin: 'http://evil.example', 'content-type': 'application/json' },
        body: JSON.stringify({ slideId: 'detail' }),
      })).status).toBe(403);
      expect((await fetch(`${server.url}/api/navigate`, {
        method: 'POST',
        headers: { authorization: `Bearer ${server.token}`, origin: server.url, 'content-type': 'application/json' },
        body: JSON.stringify({ slideId: 'detail' }),
      })).status).toBe(200);
      expect(await (await fetch(`${server.url}/api/selection`)).json()).toBeNull();
      const mutationHeaders = { authorization: `Bearer ${server.token}`, origin: server.url, 'content-type': 'application/json' };
      const saved = await fetch(`${server.url}/api/save`, { method: 'POST', headers: mutationHeaders, body: '{}' });
      expect(saved.status).toBe(200);
      expect(await saved.json()).toMatchObject({ path: 'src/deck.tsx', validation: { valid: true } });
      const built = await fetch(`${server.url}/api/export/html`, { method: 'POST', headers: mutationHeaders, body: '{}' });
      expect(built.status).toBe(200);
      const exported = await built.json() as { format: string; filename: string; html: string };
      expect(exported.format).toBe('html');
      expect(exported.filename.endsWith('.html')).toBe(true);
      // One self-contained document: no leftover build directory, no asset refs.
      expect(exported.html).toContain('<script');
      expect(exported.html).not.toMatch(/(src|href)="\.\/assets\//);
      expect(existsSync(join(root, 'dist'))).toBe(false);
    } finally { await server.close(); }
  }, 20_000);

  it('resumes the presentation that was open last when no target is given', async () => {
    const first = project();
    const second = project();
    const assets = mkdtempSync(join(tmpdir(), 'openpresent-studio-assets-'));
    temporary.push(assets);
    write(join(assets, 'index.html'), '<!doctype html><title>Studio test</title></head><body>Studio</body>');

    const opening = await startStudio({ projectRoot: first, clientAssets: assets });
    try { await opening.openDocument(second); } finally { await opening.close(); }

    // A restart must land on the presentation the author was working in.
    const resumed = await startStudio({ clientAssets: assets });
    try {
      expect(resumed.engine.projectRoot).toBe(canonical(second));
    } finally { await resumed.close(); }
  }, 40_000);

  it('applies a model choice to the agent command and remembers it per presentation', async () => {
    const root = project();
    write(join(root, '.openpresent/agents.json'), JSON.stringify({ profiles: [{
      id: 'fake', label: 'Fake', command: process.execPath, args: ['agent.mjs'],
      modelFlag: '--model', models: [{ id: 'fast', label: 'Fast' }, { id: 'deep', label: 'Deep' }],
    }] }));
    const engine = new StudioEngine({ projectRoot: root, studioUrl: 'http://127.0.0.1:1', previewUrl: 'http://127.0.0.1:2' });
    const profile = (await engine.getState()).agents.find(({ id }) => id === 'fake');
    expect(profile?.models?.map(({ id }) => id)).toEqual(['fast', 'deep']);
    expect(profile?.modelFlag).toBe('--model');

    await engine.setModel('deep', 'fake');
    expect((await engine.getState()).agent.modelId).toBe('deep');
    // Suggestions are not a whitelist: a model the list does not mention is
    // still passed through, because providers ship models faster than any
    // bundled list can track.
    await engine.setModel('some-new-model', 'fake');
    expect((await engine.getState()).agent.modelId).toBe('some-new-model');
    await engine.setModel('deep', 'fake');
    await engine.dispose();

    const reopened = new StudioEngine({ projectRoot: root, studioUrl: 'http://127.0.0.1:3', previewUrl: 'http://127.0.0.1:4' });
    expect((await reopened.getState()).agent.modelId).toBe('deep');
    await reopened.dispose();
  });

  it('keeps working state per presentation and resumes it on reopen', async () => {
    const first = project();
    const second = project();

    const one = new StudioEngine({ projectRoot: first, studioUrl: 'http://127.0.0.1:1', previewUrl: 'http://127.0.0.1:2' });
    await one.navigate('detail');
    one.addTranscript({ id: 'a', at: new Date().toISOString(), role: 'user', text: 'Only in the first deck', status: 'complete' });
    await one.setAutoApprove(false);
    one.setAgentState({ profileId: 'claude', modelId: 'opus' });
    await one.dispose();

    // A different presentation must not inherit the first one's conversation.
    const other = new StudioEngine({ projectRoot: second, studioUrl: 'http://127.0.0.1:3', previewUrl: 'http://127.0.0.1:4' });
    const otherState = await other.getState();
    expect(otherState.agent.transcript).toEqual([]);
    expect(otherState.agent.autoApproveSafe).toBe(true);
    expect(otherState.agent.profileId).toBeUndefined();
    expect(otherState.activeSlideId).toBe('opening');
    await other.dispose();

    // Reopening the first resumes where it left off, with the agent disconnected.
    const reopened = new StudioEngine({ projectRoot: first, studioUrl: 'http://127.0.0.1:5', previewUrl: 'http://127.0.0.1:6' });
    const resumed = await reopened.getState();
    expect(resumed.activeSlideId).toBe('detail');
    expect(resumed.agent.transcript.map(({ text }) => text)).toEqual(['Only in the first deck']);
    expect(resumed.agent.autoApproveSafe).toBe(false);
    // The connector and model come back so returning reconnects to the same
    // agent, while the process itself is correctly reported as not running.
    expect(resumed.agent.profileId).toBe('claude');
    expect(resumed.agent.modelId).toBe('opus');
    expect(resumed.agent.lifecycle).toBe('disconnected');
    // Studio's memory lives in Studio's directory, never in the author's folder.
    expect(existsSync(join(first, 'session.json'))).toBe(false);
    await reopened.dispose();
  });

  it('creates a presentation from a template that runs with no install of its own', async () => {
    const root = project();
    const assets = mkdtempSync(join(tmpdir(), 'openpresent-studio-assets-'));
    temporary.push(assets);
    write(join(assets, 'index.html'), '<!doctype html><title>Studio test</title></head><body>Studio</body>');
    const server = await startStudio({ projectRoot: root, clientAssets: assets });
    try {
      const created = await fetch(`${server.url}/api/library/create`, {
        method: 'POST',
        headers: { authorization: `Bearer ${server.token}`, origin: server.url, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Template Smoke', templateId: 'metric' }),
      });
      expect(created.status).toBe(200);
      const body = await created.json() as { path: string; library: Array<{ title: string; slideCount: number }> };

      // A Studio-created document carries no node_modules, so the preview only
      // works if Studio supplies the runtime rather than the folder.
      expect(existsSync(join(body.path, 'node_modules'))).toBe(false);
      expect(server.engine.projectRoot).toBe(canonical(body.path));
      expect((await server.engine.getOutline()).map(({ id }) => id)).toEqual(['opening']);
      expect(body.library.find((entry) => entry.title === 'template smoke')?.slideCount).toBe(1);

      // Serving through the managed runtime is asserted in tests/studio-browser.mjs:
      // driving a Vite dev server from inside Vitest deadlocks, since Vitest is Vite.
      expect(server.previewUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    } finally { await server.close(); }
  }, 40_000);

  it('remembers presentations and switches the workspace between them', async () => {
    const data = mkdtempSync(join(tmpdir(), 'openpresent-data-'));
    const docs = mkdtempSync(join(tmpdir(), 'openpresent-docs-'));
    temporary.push(data, docs);
    const previousData = process.env.OPENPRESENT_DATA_DIR;
    const previousDocs = process.env.OPENPRESENT_DOCUMENTS_DIR;
    process.env.OPENPRESENT_DATA_DIR = data;
    process.env.OPENPRESENT_DOCUMENTS_DIR = docs;
    const first = project();
    const second = project();
    write(join(second, 'src/deck.tsx'), `
      import { defineDeck, Slide } from '@openpresent/core';
      export const deck = defineDeck({ metadata: { id: 'second', title: 'Second deck' }, slides: [
        <Slide id="only" title="Only slide"><h1>Second deck</h1></Slide>,
      ] });
    `);
    const assets = mkdtempSync(join(tmpdir(), 'openpresent-studio-assets-'));
    temporary.push(assets);
    write(join(assets, 'index.html'), '<!doctype html><title>Studio test</title></head><body>Studio</body>');
    const server = await startStudio({ projectRoot: first, clientAssets: assets });
    try {
      // Opening a presentation records it in the library, which lives outside it.
      expect(readLibrary().map(({ path }) => path)).toEqual([canonical(first)]);
      expect(existsSync(join(first, 'library.json'))).toBe(false);

      const firstPreview = server.previewUrl;
      await server.openDocument(second);
      expect(server.engine.projectRoot).toBe(canonical(second));
      expect((await server.engine.getOutline()).map(({ id }) => id)).toEqual(['only']);
      // A new preview server is stood up, so clients must follow the new origin.
      expect(server.previewUrl).not.toBe(firstPreview);
      expect((await server.engine.getState()).previewUrl).toBe(server.previewUrl);

      const library = readLibrary();
      expect(library.map(({ path }) => path)).toEqual([canonical(second), canonical(first)]);

      // Re-opening the first one switches back without duplicating the entry.
      await server.openDocument(first);
      expect(server.engine.projectRoot).toBe(canonical(first));
      expect(readLibrary()).toHaveLength(2);

      expect(forgetDocument(library[0].id).map(({ path }) => path)).toEqual([canonical(first)]);
      expect(existsSync(second)).toBe(true);
    } finally {
      await server.close();
      if (previousData === undefined) delete process.env.OPENPRESENT_DATA_DIR; else process.env.OPENPRESENT_DATA_DIR = previousData;
      if (previousDocs === undefined) delete process.env.OPENPRESENT_DOCUMENTS_DIR; else process.env.OPENPRESENT_DOCUMENTS_DIR = previousDocs;
    }
  }, 30_000);

  it('reports a fixed Studio port conflict instead of silently choosing another port', async () => {
    const root = project();
    const blocker = createNetServer();
    await new Promise<void>((done) => blocker.listen(0, '127.0.0.1', done));
    const address = blocker.address();
    if (!address || typeof address === 'string') throw new Error('No blocker address.');
    await expect(startStudio({ projectRoot: root, studioPort: address.port })).rejects.toThrow(/Could not start OpenPresent Studio/);
    await new Promise<void>((done) => blocker.close(() => done()));
  });
});
