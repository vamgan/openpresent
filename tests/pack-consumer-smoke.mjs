import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temporary = mkdtempSync(join(tmpdir(), 'openpresent-pack-'));
const packDirectory = join(temporary, 'packs');
const consumer = join(temporary, 'consumer');
const packageNames = [
  '@openpresent/core',
  '@openpresent/components',
  '@openpresent/skills',
  '@openpresent/validator',
  '@openpresent/studio',
  '@openpresent/mcp',
  '@openpresent/cli',
];

function run(command, args, cwd = repository) {
  execFileSync(command, args, { cwd, stdio: 'inherit', env: process.env });
}

function write(path, contents) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function exportTargets(value) {
  if (typeof value === 'string') return [value];
  if (!value || typeof value !== 'object') return [];
  return Object.values(value).flatMap(exportTargets);
}

function assertPackedManifest(tarball) {
  const extracted = join(temporary, 'inspect', tarball.split('/').at(-1));
  mkdirSync(extracted, { recursive: true });
  run('tar', ['-xzf', tarball, '-C', extracted]);
  const packageRoot = join(extracted, 'package');
  const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
  const targets = [manifest.main, manifest.module, manifest.types, manifest.bin, ...exportTargets(manifest.exports)]
    .flatMap((target) => typeof target === 'object' && target ? Object.values(target) : [target])
    .filter((target) => typeof target === 'string');

  for (const target of targets) {
    if (!target.startsWith('./dist/')) {
      throw new Error(`${manifest.name} publishes a non-dist entry: ${target}`);
    }
    const shippedPath = join(packageRoot, target.slice(2));
    try {
      readFileSync(shippedPath);
    } catch {
      throw new Error(`${manifest.name} export does not exist in its tarball: ${target}`);
    }
  }

  const entries = execFileSync('tar', ['-tzf', tarball], { encoding: 'utf8' });
  if (entries.split('\n').some((entry) => entry.startsWith('package/src/'))) {
    throw new Error(`${manifest.name} unexpectedly shipped source files.`);
  }
  if (manifest.name === '@openpresent/skills') {
    for (const resource of [
      'package/skills/deck-direction/SKILL.md',
      'package/skills/deck-direction/agents/openai.yaml',
      'package/skills/deck-direction/references/design-system-contract.md',
    ]) {
      if (!entries.split('\n').includes(resource)) throw new Error(`@openpresent/skills is missing ${resource}.`);
    }
  }
  if (manifest.name === '@openpresent/studio') {
    for (const resource of ['package/dist/client/index.html', 'package/dist/templates/starter/package.json']) {
      if (!entries.split('\n').includes(resource)) throw new Error(`@openpresent/studio is missing browser asset ${resource}.`);
    }
    if (!entries.split('\n').some((entry) => entry.startsWith('package/dist/client/assets/') && entry.endsWith('.js'))) {
      throw new Error('@openpresent/studio is missing its compiled browser JavaScript.');
    }
    if (typeof manifest.dependencies?.['@assistant-ui/react'] !== 'string') {
      throw new Error('@openpresent/studio must declare its assistant-ui browser runtime dependency.');
    }
  }
}

async function freePort() {
  return await new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') return reject(new Error('Could not allocate a test port.'));
      server.close(() => resolvePort(address.port));
    });
  });
}

async function waitForHttp(url, processHandle, output) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (processHandle.exitCode !== null) {
      throw new Error(`Packed consumer dev server exited early.\n${output.value}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 150));
  }
  throw new Error(`Timed out waiting for ${url}.\n${output.value}`);
}

mkdirSync(packDirectory, { recursive: true });
mkdirSync(consumer, { recursive: true });

try {
  for (const name of packageNames) {
    run('pnpm', ['--filter', name, 'pack', '--pack-destination', packDirectory]);
  }

  const tarballs = readdirSync(packDirectory).filter((name) => name.endsWith('.tgz')).map((name) => join(packDirectory, name));
  if (tarballs.length !== packageNames.length) {
    throw new Error(`Expected ${packageNames.length} tarballs, found ${tarballs.length}.`);
  }
  for (const tarball of tarballs) assertPackedManifest(tarball);

  const tarballFor = (fragment) => tarballs.find((path) => path.includes(fragment));
  const dependencies = {
    '@openpresent/core': `file:${tarballFor('openpresent-core-')}`,
    '@openpresent/components': `file:${tarballFor('openpresent-components-')}`,
    '@openpresent/skills': `file:${tarballFor('openpresent-skills-')}`,
    '@openpresent/validator': `file:${tarballFor('openpresent-validator-')}`,
    '@openpresent/studio': `file:${tarballFor('openpresent-studio-')}`,
    '@openpresent/mcp': `file:${tarballFor('openpresent-mcp-')}`,
    '@openpresent/cli': `file:${tarballFor('openpresent-cli-')}`,
    motion: '^12.23.12',
    react: '^19.1.1',
    'react-dom': '^19.1.1',
  };
  if (Object.values(dependencies).some((value) => value.includes('undefined'))) {
    throw new Error('Could not match every packed package tarball.');
  }

  const localOverrides = Object.fromEntries(
    Object.entries(dependencies).filter(([name]) => name.startsWith('@openpresent/')),
  );
  write(join(consumer, 'package.json'), `${JSON.stringify({
    name: 'openpresent-packed-consumer',
    private: true,
    type: 'module',
    scripts: { typecheck: 'tsc --noEmit', build: 'vite build', dev: 'vite' },
    dependencies,
    devDependencies: {
      '@types/node': '^24.3.0',
      '@types/react': '^19.1.10',
      '@types/react-dom': '^19.1.7',
      '@modelcontextprotocol/client': '^2.0.0',
      '@vitejs/plugin-react': '^5.0.2',
      typescript: '^5.9.2',
      vite: '^7.1.3',
    },
    pnpm: { overrides: localOverrides },
  }, null, 2)}\n`);
  write(join(consumer, 'tsconfig.json'), `${JSON.stringify({
    compilerOptions: {
      target: 'ES2022', lib: ['ES2022', 'DOM'], module: 'ESNext', moduleResolution: 'Bundler',
      strict: true, noEmit: true, jsx: 'react-jsx', skipLibCheck: true,
    },
    include: ['src', 'vite.config.ts'],
  }, null, 2)}\n`);
  write(join(consumer, 'vite.config.ts'), `import react from '@vitejs/plugin-react';\nimport { defineConfig } from 'vite';\nexport default defineConfig({ plugins: [react()], optimizeDeps: { entries: ['src/main.tsx'] } });\n`);
  write(join(consumer, 'index.html'), '<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>\n');
  write(join(consumer, 'src/deck.tsx'), `import { Slide, defineDeck } from '@openpresent/core';\nimport { Hero } from '@openpresent/components';\nexport const deck = defineDeck({ metadata: { id: 'packed', title: 'Packed consumer' }, slides: [<Slide id="opening" title="Opening"><Hero title="Packed OpenPresent" /></Slide>, <Slide id="close" title="Close"><p>Packaged close</p></Slide>] });\n`);
  write(join(consumer, 'src/main.tsx'), `import { createRoot } from 'react-dom/client';\nimport { Presentation } from '@openpresent/core';\nimport { deck } from './deck';\nimport '@openpresent/core/styles.css';\nimport '@openpresent/components/styles.css';\ncreateRoot(document.getElementById('root')!).render(<Presentation deck={deck} />);\n`);
  write(join(consumer, 'src/package-api.ts'), `import { createProgram } from '@openpresent/cli';\nimport { createMcpServer } from '@openpresent/mcp';\nimport { listSkills, resolveSkill } from '@openpresent/skills';\nimport { connectStudio } from '@openpresent/studio';\nimport { validateSource } from '@openpresent/validator';\nexport const program = createProgram();\nexport const mcp = createMcpServer;\nexport const studio = connectStudio;\nexport const skills = listSkills();\nexport const skillPath = resolveSkill('deck-direction');\nexport const result = validateSource('<Slide id="packed" title="Packed" />');\n`);
  const fakeAgent = join(repository, 'tests/fixtures/fake-acp-agent.mjs');
  write(join(consumer, '.openpresent/agents.json'), `${JSON.stringify({ profiles: [{
    id: 'fake', label: 'Packed fake ACP', command: process.execPath,
    args: [fakeAgent, '--from', 'Packed OpenPresent', '--to', 'Packed directed', '--log', join(consumer, '.openpresent/fake-agent.jsonl')],
  }] }, null, 2)}\n`);
  write(join(consumer, 'packed-studio-smoke.mjs'), `import { fileURLToPath } from 'node:url';\nimport { startStudio } from '@openpresent/studio';\nconst mcpEntry = fileURLToPath(import.meta.resolve('@openpresent/mcp'));\nconst server = await startStudio({ projectRoot: process.cwd(), mcpCommand: process.execPath, mcpArgs: [mcpEntry] });\ntry {\n  const html = await (await fetch(server.url)).text();\n  const asset = html.match(/(?:src|href)="([^"]+\\.(?:js|css))"/)?.[1];\n  if (!html.includes('OpenPresent') || !asset || !(await fetch(new URL(asset, server.url))).ok) throw new Error('Packed Studio browser assets were not served.');\n  const state = await server.engine.getState();\n  if (state.outline[0]?.id !== 'opening') throw new Error('Packed Studio did not load the authoritative outline.');\n  console.log(JSON.stringify({ studio: server.url, preview: server.previewUrl, assets: true }));\n} finally { await server.close(); }\n`);
  write(join(consumer, 'packed-mcp-smoke.mjs'), `import { fileURLToPath } from 'node:url';\nimport { Client } from '@modelcontextprotocol/client';\nimport { StdioClientTransport } from '@modelcontextprotocol/client/stdio';\nconst entry = fileURLToPath(import.meta.resolve('@openpresent/mcp'));\nconst transport = new StdioClientTransport({ command: process.execPath, args: [entry, '--project', process.cwd()], cwd: process.cwd(), stderr: 'pipe' });\nlet stderr = ''; transport.stderr?.on('data', chunk => { stderr += chunk.toString(); });\nconst client = new Client({ name: 'packed-openpresent-smoke', version: '1.0.0' });\ntry {\n  await client.connect(transport);\n  const tools = await client.listTools();\n  const expected = ['open_workspace','get_state','get_outline','get_selection','navigate_slide','validate_deck','capture_slide','apply_edit','delete_slide','undo'];\n  if (tools.tools.length < 10 || expected.some(name => !tools.tools.some(tool => tool.name === name))) throw new Error('Packed MCP tool surface is incomplete.');\n  const opened = await client.callTool({ name: 'open_workspace', arguments: {} });\n  await client.callTool({ name: 'get_state', arguments: {} });\n  await client.callTool({ name: 'get_outline', arguments: {} });\n  await client.callTool({ name: 'get_selection', arguments: {} });\n  await client.callTool({ name: 'navigate_slide', arguments: { slideId: 'opening' } });\n  const validation = await client.callTool({ name: 'validate_deck', arguments: { browser: false } });\n  const capture = await client.callTool({ name: 'capture_slide', arguments: { slideId: 'opening' } });\n  await client.callTool({ name: 'apply_edit', arguments: { edits: [{ path: 'src/deck.tsx', oldText: 'Packed OpenPresent', newText: 'Packed MCP edit' }] } });\n  await client.callTool({ name: 'undo', arguments: {} });\n  const deleted = await client.callTool({ name: 'delete_slide', arguments: { slideId: 'close' } });\n  const afterDelete = await client.callTool({ name: 'get_outline', arguments: {} });\n  await client.callTool({ name: 'undo', arguments: {} });\n  const afterUndo = await client.callTool({ name: 'get_outline', arguments: {} });\n  if (opened.isError || validation.isError || capture.isError || deleted.isError || !capture.content.some(item => item.type === 'image')) throw new Error('Packed MCP call failed.');\n  if (afterDelete.structuredContent?.slides?.length !== 1 || afterUndo.structuredContent?.slides?.length !== 2) throw new Error('Packed MCP delete/undo did not preserve the authoritative outline.');\n  console.log(JSON.stringify({ tools: tools.tools.length, protocolClean: true, stderrReady: stderr.includes('ready') }));\n} finally { await client.close(); }\n`);
  write(join(consumer, 'packed-acp-smoke.mjs'), `import { readFileSync } from 'node:fs';\nimport { fileURLToPath } from 'node:url';\nimport { startStudio } from '@openpresent/studio';\nconst mcpEntry = fileURLToPath(import.meta.resolve('@openpresent/mcp'));\nconst server = await startStudio({ projectRoot: process.cwd(), mcpCommand: process.execPath, mcpArgs: [mcpEntry] });\ntry {\n  const result = await server.engine.promptAgent('fake', 'Strengthen the packed opening.');\n  const source = readFileSync('src/deck.tsx', 'utf8');\n  const log = readFileSync('.openpresent/fake-agent.jsonl', 'utf8');\n  if (!source.includes('Packed directed') || !result.changedFiles.includes('src/deck.tsx')) throw new Error('Packed ACP edit did not reach source.');\n  if (!log.includes('mcp-attached') || log.includes('npx -y @openpresent/mcp')) throw new Error('Packed ACP did not attach the deterministic installed MCP entry.');\n  await server.engine.undo();\n  console.log(JSON.stringify({ acp: true, attachedMcp: true, restored: readFileSync('src/deck.tsx', 'utf8').includes('Packed OpenPresent') }));\n} finally { await server.close(); }\n`);

  run('pnpm', ['install', '--ignore-workspace'], consumer);
  run('pnpm', ['typecheck'], consumer);
  run('pnpm', ['build'], consumer);
  run(process.execPath, ['packed-studio-smoke.mjs'], consumer);
  run(process.execPath, ['packed-mcp-smoke.mjs'], consumer);
  run(process.execPath, ['packed-acp-smoke.mjs'], consumer);

  const port = await freePort();
  const output = { value: '' };
  const dev = spawn('pnpm', ['dev', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: consumer,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  dev.stdout.on('data', (chunk) => { output.value += chunk.toString(); });
  dev.stderr.on('data', (chunk) => { output.value += chunk.toString(); });
  try {
    const rootResponse = await waitForHttp(`http://127.0.0.1:${port}/`, dev, output);
    const moduleResponse = await fetch(`http://127.0.0.1:${port}/src/main.tsx`);
    const bodies = `${await rootResponse.text()}\n${await moduleResponse.text()}\n${output.value}`;
    if (!moduleResponse.ok || /failed to resolve import|internal server error|dist\/assets\//i.test(bodies)) {
      throw new Error(`Packed consumer dev scan failed.\n${bodies}`);
    }
  } finally {
    dev.kill('SIGTERM');
    await Promise.race([
      new Promise((resolveExit) => dev.once('exit', resolveExit)),
      new Promise((resolveWait) => setTimeout(resolveWait, 3_000)),
    ]);
    // A dev server that ignores SIGTERM keeps its stdio pipes open, and those
    // pipes keep this process alive long after the checks have all passed.
    if (dev.exitCode === null && dev.signalCode === null) dev.kill('SIGKILL');
    dev.unref();
  }

  console.log('Packed consumer smoke passed: exports/assets, typecheck, build/dev, Studio, MCP, ACP attach, guarded edit, capture, and undo.');
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
