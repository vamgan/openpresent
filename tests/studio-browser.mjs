import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { startStudio } from '../packages/studio/dist/index.js';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const work = join(repository, 'work');
mkdirSync(work, { recursive: true });
const project = mkdtempSync(join(work, 'studio-browser-'));
const screenshots = join(work, 'screenshots');
mkdirSync(screenshots, { recursive: true });
const fake = join(repository, 'tests/fixtures/fake-acp-agent.mjs');
const fakeLog = join(project, '.openpresent/fake-agent.jsonl');

function write(path, contents) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

write(join(project, 'package.json'), '{"name":"openpresent-browser-fixture","private":true,"type":"module"}\n');
write(join(project, 'index.html'), '<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>\n');
write(join(project, 'vite.config.mjs'), `import react from '@vitejs/plugin-react';\nimport { defineConfig } from 'vite';\nexport default defineConfig({ plugins: [react()], resolve: { alias: [\n  { find: 'react-dom/client', replacement: ${JSON.stringify(join(repository, 'packages/studio/node_modules/react-dom/client.js'))} },\n  { find: 'react/jsx-dev-runtime', replacement: ${JSON.stringify(join(repository, 'packages/studio/node_modules/react/jsx-dev-runtime.js'))} },\n  { find: 'react/jsx-runtime', replacement: ${JSON.stringify(join(repository, 'packages/studio/node_modules/react/jsx-runtime.js'))} },\n  { find: /^react$/, replacement: ${JSON.stringify(join(repository, 'packages/studio/node_modules/react/index.js'))} },\n  { find: 'motion/react', replacement: ${JSON.stringify(join(repository, 'packages/core/node_modules/motion/dist/es/react.mjs'))} },\n  { find: '@openpresent/core/styles.css', replacement: ${JSON.stringify(join(repository, 'packages/core/src/styles.css'))} },\n  { find: '@openpresent/components/styles.css', replacement: ${JSON.stringify(join(repository, 'packages/components/src/styles.css'))} },\n  { find: /^@openpresent\\/core$/, replacement: ${JSON.stringify(join(repository, 'packages/core/src/index.ts'))} },\n  { find: /^@openpresent\\/components$/, replacement: ${JSON.stringify(join(repository, 'packages/components/src/index.ts'))} },\n] }, server: { fs: { allow: [${JSON.stringify(repository)}] } } });\n`);
write(join(project, 'src/main.tsx'), `import { createRoot } from 'react-dom/client';\nimport { Presentation } from '@openpresent/core';\nimport { deck } from './deck';\nimport '@openpresent/core/styles.css';\nimport '@openpresent/components/styles.css';\nimport './styles.css';\ncreateRoot(document.getElementById('root')!).render(<Presentation deck={deck} />);\n`);
write(join(project, 'src/deck.tsx'), `import { defineDeck, Slide } from '@openpresent/core';\nimport { Hero } from '@openpresent/components';\nexport const deck = defineDeck({ metadata: { id: 'browser-fixture', title: 'Browser fixture' }, slides: [\n  <Slide id="opening" title="Opening"><Hero title="Browser original" subtitle="A semantic primitive" /><div className="freeform-note">Freeform evidence note</div></Slide>,\n  <Slide id="second" title="Second"><div className="second-slide"><h1>Second beat</h1><p>Navigation stays synchronized.</p></div></Slide>,\n] });\n`);
write(join(project, 'src/styles.css'), `:root{font-family:system-ui;color:#f5f3ef;background:#0b0b0c}.op-slide{padding:90px;background:#0b0b0c}.freeform-note{position:absolute;left:100px;bottom:90px;padding:22px 28px;border:2px solid #ff624f;font-size:24px}.second-slide h1{font-size:72px}.second-slide p{font-size:28px}\n`);
write(join(project, '.openpresent/agents.json'), `${JSON.stringify({ profiles: [{
  id: 'fake', label: 'Deterministic fake', command: process.execPath,
  args: [fake, '--from', 'Browser original', '--to', 'Browser directed', '--log', fakeLog],
}] }, null, 2)}\n`);

const mcpEntry = join(repository, 'packages/mcp/dist/index.js');
let studio;
let browser;
let mcp;
try {
  studio = await startStudio({ projectRoot: project, mcpCommand: process.execPath, mcpArgs: [mcpEntry] });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [mcpEntry, '--attach-url', studio.url, '--token', studio.token],
    cwd: project,
    stderr: 'pipe',
  });
  mcp = new Client({ name: 'openpresent-browser-test', version: '1.0.0' });
  await mcp.connect(transport);
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const browserErrors = [];
  page.on('pageerror', (error) => browserErrors.push(`page: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') browserErrors.push(`console: ${message.text()}`); });
  page.on('requestfailed', (request) => browserErrors.push(`request: ${request.url()} ${request.failure()?.errorText ?? ''}`));
  await page.goto(studio.url, { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Where do you want to start?')).toBeVisible();
  await expect(page.getByText('npx -y @openpresent/cli studio ./my-deck --create --skill deck-direction --open')).toBeVisible();
  await page.screenshot({ path: join(screenshots, 'studio-start.png'), fullPage: true });
  await page.getByRole('button', { name: 'Continue editing' }).click();
  await expect(page.getByText('Ask for a presentation change')).toBeVisible();
  await expect(page.locator('.topbar-actions > .persistence-status')).toHaveText('Saved locally');
  await expect(page.getByLabel('Agent profile')).toContainText('Codex');
  await expect(page.locator('.thumbnail iframe')).toHaveCount(2);
  await expect(page.frameLocator('iframe[title="Opening slide preview"]').locator('[data-openpresent-slide="opening"]')).toBeVisible();
  const frame = page.frameLocator('iframe[title="Live OpenPresent deck"]');
  try {
    await expect(frame.locator('[data-openpresent-slide="opening"]')).toBeVisible({ timeout: 10_000 });
  } catch {
    const frames = await Promise.all(page.frames().map(async (item) => ({ url: item.url(), text: (await item.locator('body').textContent().catch(() => ''))?.slice(0, 800) })));
    const moduleError = await fetch(new URL('/src/main.tsx', studio.previewUrl)).then((response) => response.text()).catch((error) => String(error));
    throw new Error(`Studio preview did not render. Browser errors: ${browserErrors.join(' | ') || 'none'}; frames: ${JSON.stringify(frames)}; module: ${moduleError.slice(0, 1600)}`);
  }

  await frame.locator('[data-openpresent-component="Hero"] h1').click();
  await expect(page.locator('.selection-type')).toHaveText('Hero');
  let selection = (await mcp.callTool({ name: 'get_selection', arguments: {} })).structuredContent?.selection;
  if (selection?.component !== 'Hero' || selection?.ownerComponent !== 'Hero' || selection?.tag !== 'h1' || selection?.slideId !== 'opening') throw new Error('Leaf primitive selection did not preserve its owning primitive in shared MCP state.');

  const editableHeading = frame.locator('[data-openpresent-component="Hero"] h1');
  await editableHeading.dblclick();
  await expect(editableHeading).toHaveAttribute('contenteditable', 'plaintext-only');
  await editableHeading.fill('Inline browser edit');
  await editableHeading.press('Enter');
  await expect(frame.getByText('Inline browser edit')).toBeVisible({ timeout: 12_000 });
  await expect.poll(() => readFileSync(join(project, 'src/deck.tsx'), 'utf8').includes('Inline browser edit'), { timeout: 12_000 }).toBe(true);
  await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(frame.getByText('Browser original')).toBeVisible({ timeout: 12_000 });

  await frame.locator('.freeform-note').evaluate((element) => element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
  await expect(page.locator('.selection-type')).toHaveText('div');
  selection = (await mcp.callTool({ name: 'get_selection', arguments: {} })).structuredContent?.selection;
  if (selection?.component !== 'div' || !selection?.text.includes('Freeform evidence')) throw new Error('Freeform selection did not reach shared MCP state.');

  await page.locator('.thumbnail-hit').nth(1).click();
  await expect(frame.locator('[data-openpresent-slide="second"]')).toBeVisible();
  await expect(page.getByRole('button', { name: /Second/ })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.selection-type')).toHaveText('No selection');
  const navigation = await mcp.callTool({ name: 'get_state', arguments: {} });
  if (navigation.structuredContent?.activeSlideId !== 'second') throw new Error('Rail navigation did not synchronize MCP state.');

  await page.getByRole('button', { name: 'Delete slide' }).click();
  await page.getByRole('group', { name: 'Confirm slide deletion' }).getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('button', { name: /Second/ })).toHaveCount(0);
  if (readFileSync(join(project, 'src/deck.tsx'), 'utf8').includes('id="second"')) throw new Error('Browser delete did not remove the authoritative Slide node.');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('button', { name: /Second/ })).toBeVisible();

  await page.getByRole('button', { name: '+ New slide' }).click();
  const templateDialog = page.getByRole('dialog', { name: 'New slide' });
  await expect(templateDialog).toBeVisible();
  await templateDialog.getByRole('button', { name: /^Metric/ }).click();
  await expect(frame.locator('[data-openpresent-slide="metric"]')).toBeVisible({ timeout: 12_000 });
  const insertedSource = readFileSync(join(project, 'src/deck.tsx'), 'utf8');
  if (!insertedSource.includes('<Slide id="metric"') || !insertedSource.includes('Grid, Metric')) throw new Error('Template insertion did not add the slide and required imports to authoritative TSX.');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('button', { name: /Evidence in three signals/ })).toHaveCount(0);

  await page.getByRole('button', { name: /Opening/ }).click();
  await frame.locator('[data-openpresent-component="Hero"] h1').click();
  await page.getByLabel('Agent profile').selectOption('fake');
  const agentComposer = page.getByLabel('Ask the agent to create or change this presentation');
  await agentComposer.fill('First line');
  await agentComposer.press('Shift+Enter');
  await expect(agentComposer).toHaveValue('First line\n');
  await agentComposer.fill('Make the selected opening more decisive.');
  await expect(page.getByRole('button', { name: 'Send' })).toBeEnabled();
  await agentComposer.press('Enter');
  try {
    await expect(page.getByText('Make the selected opening more decisive.')).toBeVisible();
  } catch (reason) {
    throw new Error(`assistant-ui did not append the user turn. ${reason}\nBrowser errors: ${browserErrors.join(' | ') || 'none'}\nPage:\n${await page.locator('body').innerText()}`);
  }
  try {
    await expect(frame.getByText('Browser directed')).toBeVisible({ timeout: 12_000 });
  } catch (reason) {
    const activity = await page.getByLabel('Agent activity').innerText().catch(() => 'No agent activity rendered.');
    const agentLog = existsSync(fakeLog) ? readFileSync(fakeLog, 'utf8') : 'No fake agent log was created.';
    throw new Error(`assistant-ui send did not complete the ACP edit. ${reason}\nActivity:\n${activity}\nAgent log:\n${agentLog}`);
  }
  await expect(page.getByText(/Changed “Browser original”/)).toBeVisible();
  const actionGroup = page.locator('.action-group');
  await expect(actionGroup).toHaveCount(1);
  await expect(actionGroup.locator('summary')).toHaveText('4 actions');
  await expect(actionGroup).not.toHaveAttribute('open', '');
  await expect(page.locator('.message.is-tool, .message.is-permission')).toHaveCount(0);
  await actionGroup.locator('summary').click();
  await expect(actionGroup.locator('li')).toHaveCount(4);
  if (!readFileSync(join(project, 'src/deck.tsx'), 'utf8').includes('Browser directed')) throw new Error('ACP browser flow did not change source.');
  const changed = await studio.engine.getState();
  if (!changed.changedFiles.includes('src/deck.tsx') || !changed.undoAvailable) throw new Error('Studio did not expose change and undo state.');
  if (!readFileSync(fakeLog, 'utf8').includes('mcp-attached')) throw new Error('Studio-first ACP session did not receive its client-provided MCP server.');
  await page.screenshot({ path: join(screenshots, 'studio-desktop.png'), fullPage: true });

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(frame.getByText('Browser original')).toBeVisible({ timeout: 12_000 });
  if (!readFileSync(join(project, 'src/deck.tsx'), 'utf8').includes('Browser original')) throw new Error('Browser undo did not restore source.');

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Saved and checked src/deck.tsx');
  await page.getByRole('status').getByRole('button', { name: 'Dismiss' }).click();
  await page.locator('.export-menu > summary').click();
  const printLink = page.getByRole('link', { name: 'Open print view' });
  await expect(printLink).toHaveAttribute('href', /openpresentPrint=1/);
  await page.getByRole('button', { name: 'Build HTML' }).click();
  await expect(page.getByRole('status')).toContainText('Built static HTML at dist/index.html', { timeout: 15_000 });
  await expect.poll(() => existsSync(join(project, 'dist/index.html')), { timeout: 15_000 }).toBe(true);

  const composer = page.getByLabel('Ask the agent to create or change this presentation');
  await composer.fill('FAKE_CANCEL');
  await composer.press('Enter');
  await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible({ timeout: 5_000 });
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByText('Cancelled cleanly.')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('button', { name: 'Send' })).toBeVisible();
  await expect.poll(() => readFileSync(fakeLog, 'utf8').includes('prompt-cancelled'), { timeout: 5_000 }).toBe(true);

  await page.setViewportSize({ width: 720, height: 920 });
  await expect(page.getByLabel('AI authoring panel')).toBeVisible();
  const compactActionsToggle = page.getByRole('button', { name: 'Document actions' });
  await expect(compactActionsToggle).toBeVisible();
  await compactActionsToggle.click();
  const compactActions = page.getByRole('group', { name: 'Compact document actions' });
  await expect(compactActions).toBeVisible();
  const compactState = await studio.engine.getState();
  const compactStatus = compactActions.getByRole('status', { name: 'Document status' });
  await expect(compactStatus).toContainText('Saved locally');
  await expect(compactStatus).toContainText(compactState.validation.lifecycle === 'clean' ? 'Clean' : compactState.validation.lifecycle);
  if (compactState.undoAvailable) await expect(compactActions.getByRole('button', { name: 'Undo' })).toBeEnabled();
  else await expect(compactActions.getByRole('button', { name: 'Undo' })).toBeDisabled();
  const compactSave = compactActions.getByRole('button', { name: 'Save' });
  await expect(compactSave).toBeEnabled();
  await expect(compactActions.getByRole('button', { name: 'Validate' })).toBeEnabled();
  await compactActions.getByRole('button', { name: 'Validate' }).click();
  await expect.poll(async () => (await studio.engine.getState()).validation.lifecycle).toBe('clean');
  await expect(compactSave).toBeEnabled();
  await compactSave.focus();
  await expect(compactSave).toBeFocused();
  if (await compactActions.isVisible()) await compactActionsToggle.click();
  await page.getByRole('button', { name: '+ New slide' }).click();
  await expect(page.getByRole('dialog', { name: 'New slide' })).toBeVisible();
  await page.getByRole('dialog', { name: 'New slide' }).getByRole('button', { name: 'Close template library' }).click();
  await compactActionsToggle.click();
  await expect(compactActions).toBeVisible();
  await page.getByLabel('Agent profile').focus();
  await expect(page.getByLabel('Agent profile')).toBeFocused();
  await page.screenshot({ path: join(screenshots, 'studio-compact.png'), fullPage: true });
  if (browserErrors.length) throw new Error(`Studio emitted browser errors: ${browserErrors.join(' | ')}`);
  await context.close();
  console.log(JSON.stringify({
    studio: studio.url,
    preview: studio.previewUrl,
    selection: ['Hero leaf with owner', 'freeform'],
    inlineTextEdit: true,
    thumbnailNavigation: true,
    newSlide: true,
    savedLocally: true,
    staticHtmlExport: true,
    compactDocumentActions: true,
    compactNewSlide: true,
    assistantUi: true,
    cancellation: true,
    groupedAgentActions: 4,
    deleteSlide: true,
    sharedMcp: true,
    acpEdit: true,
    undo: true,
    screenshots: ['work/screenshots/studio-start.png', 'work/screenshots/studio-desktop.png', 'work/screenshots/studio-compact.png'],
  }));
} finally {
  await mcp?.close().catch(() => undefined);
  await browser?.close().catch(() => undefined);
  await studio?.close().catch(() => undefined);
  rmSync(project, { recursive: true, force: true });
}
