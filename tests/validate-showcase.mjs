import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { validateUrl } from '../packages/validator/dist/index.js';

const repository = resolve(new URL('..', import.meta.url).pathname);

async function freePort() {
  return await new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') return reject(new Error('Could not allocate a showcase port.'));
      server.close(() => resolvePort(address.port));
    });
  });
}

async function waitForHttp(url, processHandle, output) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (processHandle.exitCode !== null) throw new Error(`Showcase preview exited early.\n${output.value}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Preview is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 150));
  }
  throw new Error(`Timed out waiting for showcase preview.\n${output.value}`);
}

const port = await freePort();
const url = `http://127.0.0.1:${port}`;
const output = { value: '' };
const preview = spawn('pnpm', ['--filter', '@openpresent/showcase', 'exec', 'vite', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  cwd: repository,
  env: process.env,
  stdio: ['ignore', 'pipe', 'pipe'],
});
preview.stdout.on('data', (chunk) => { output.value += chunk.toString(); });
preview.stderr.on('data', (chunk) => { output.value += chunk.toString(); });

try {
  await waitForHttp(url, preview, output);
  for (const [viewportWidth, viewportHeight] of [[1440, 900], [900, 700]]) {
    const result = await validateUrl(url, { viewportWidth, viewportHeight });
    if (result.diagnostics.length > 0) {
      throw new Error(`Showcase URL validation failed at ${viewportWidth}x${viewportHeight}:\n${JSON.stringify(result.diagnostics, null, 2)}`);
    }
  }

  const screenshotDirectory = resolve(repository, 'test-results', 'screenshots');
  mkdirSync(screenshotDirectory, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    await desktop.goto(`${url}/#opening`, { waitUntil: 'networkidle' });
    await desktop.screenshot({ path: resolve(screenshotDirectory, 'showcase-opening-1440x900.png'), fullPage: true });
    const compact = await browser.newPage({ viewport: { width: 900, height: 700 }, reducedMotion: 'reduce' });
    await compact.goto(`${url}/#charts`, { waitUntil: 'networkidle' });
    await compact.screenshot({ path: resolve(screenshotDirectory, 'showcase-charts-900x700.png'), fullPage: true });
  } finally {
    await browser.close();
  }
  console.log('Showcase URL validation passed for every slide at 1440x900 and 900x700; fresh screenshots captured.');
} finally {
  preview.kill('SIGTERM');
  await Promise.race([
    new Promise((resolveExit) => preview.once('exit', resolveExit)),
    new Promise((resolveWait) => setTimeout(resolveWait, 3_000)),
  ]);
}
