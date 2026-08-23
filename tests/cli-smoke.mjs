import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cli = resolve(repository, 'packages/cli/dist/index.js');
const temporary = mkdtempSync(join(tmpdir(), 'openpresent-cli-'));
const deck = join(temporary, 'agent-deck');

function run(command, args, cwd = repository) {
  return execFileSync(command, args, { cwd, stdio: 'pipe', encoding: 'utf8', env: process.env });
}

async function freePort() {
  return await new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') return reject(new Error('Could not allocate a CLI smoke port.'));
      server.close(() => resolvePort(address.port));
    });
  });
}

async function waitForHttp(url, processHandle, output) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (processHandle.exitCode !== null) throw new Error(`CLI dev server exited early.\n${output.value}`);
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch {
      // Dev server is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 150));
  }
  throw new Error(`Timed out waiting for CLI dev server.\n${output.value}`);
}

try {
  const listed = run('node', [cli, 'skills', 'list']);
  if (!listed.includes('deck-direction')) throw new Error('CLI skills list omitted deck-direction.');
  run('node', [cli, 'create', deck, '--skill', 'deck-direction']);
  if (!existsSync(join(deck, '.agents/skills/deck-direction/SKILL.md'))) {
    throw new Error('CLI create did not install the requested skill.');
  }
  run('pnpm', ['install', '--ignore-workspace'], deck);
  run('pnpm', ['typecheck'], deck);
  const validation = run('pnpm', ['validate'], deck);
  if (!validation.includes('validation passed')) throw new Error(`Starter did not use the real validator.\n${validation}`);
  run('node', [cli, 'build', deck]);
  if (!existsSync(join(deck, 'dist/index.html'))) throw new Error('CLI build did not produce dist/index.html.');

  const port = await freePort();
  const output = { value: '' };
  const dev = spawn('node', [cli, 'dev', deck, '--host', '127.0.0.1', '--port', String(port)], {
    cwd: repository,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  dev.stdout.on('data', (chunk) => { output.value += chunk.toString(); });
  dev.stderr.on('data', (chunk) => { output.value += chunk.toString(); });
  try {
    const response = await waitForHttp(`http://127.0.0.1:${port}/`, dev, output);
    const moduleResponse = await fetch(`http://127.0.0.1:${port}/src/main.tsx`);
    const evidence = `${await response.text()}\n${await moduleResponse.text()}\n${output.value}`;
    if (!moduleResponse.ok || /failed to resolve import|internal server error|dist\/assets\//i.test(evidence)) {
      throw new Error(`CLI dev prior-output scan failed.\n${evidence}`);
    }
  } finally {
    dev.kill('SIGTERM');
    await Promise.race([
      new Promise((resolveExit) => dev.once('exit', resolveExit)),
      new Promise((resolveWait) => setTimeout(resolveWait, 3_000)),
    ]);
  }

  console.log('CLI smoke passed: skills list, create with skill, typecheck, real validate, build, and dev HTTP 200.');
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
