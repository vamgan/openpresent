import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createReadStream, existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { build as viteBuild, createServer as createViteServer, type Plugin, type ViteDevServer } from 'vite';
import { resolveCommandPath } from './agents';
import { StudioEngine } from './engine';
import {
  defaultDocumentsRoot,
  documentTitle,
  studioDataRoot,
  forgetDocument,
  isDocumentRoot,
  listPresentations,
  readLibrary,
  rememberDocument,
  reserveDocumentPath,
} from './library';
import { inlineStaticHtml } from './export-html';
import { viteOptionsFor } from './preview-runtime';
import { scaffoldStudioDocument, scaffoldStudioProject } from './scaffold';
import { canonicalProjectRoot, isAllowedBrowserOrigin } from './security';
import type { GuardedEdit, StudioState } from './types';

const HOST = '127.0.0.1';
const CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.map': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.woff2': 'font/woff2',
};

export interface StartStudioOptions {
  projectRoot?: string;
  entry?: string;
  studioPort?: number;
  previewPort?: number;
  open?: boolean;
  create?: boolean;
  skill?: string;
  clientAssets?: string;
  /** Deterministic local command used when an ACP agent attaches OpenPresent's MCP tools. */
  mcpCommand?: string;
  mcpArgs?: string[];
}

export interface StudioServer {
  url: string;
  /** Tracks the open presentation, which can change during the session. */
  readonly previewUrl: string;
  token: string;
  readonly engine: StudioEngine;
  /** Switches the workspace to another presentation in the author's library. */
  openDocument(target: string): Promise<{ studioUrl: string; previewUrl: string; entry: string }>;
  close(): Promise<void>;
}

/**
 * Keeps deck edits from reloading the page. A data-only deck needs nothing from
 * this plugin: React Fast Refresh skips modules that declare no components, so
 * the deck stays non-self-accepting and Vite propagates the update to the entry's
 * `accept('./deck')` boundary. The moment an author defines a helper component
 * beside their slides, though, Fast Refresh claims the module, fails its boundary
 * check because `deck` is not a component, and calls `invalidate()` — a full
 * reload on every keystroke. Rewrite that call into a handoff so those decks
 * repaint in place too. Entries without the hook keep the reload behavior.
 */

async function openDefaultBrowser(url: string) {
  const [command, args] = process.platform === 'darwin'
    ? ['open', [url]] as const
    : process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', url]] as const
      : ['xdg-open', [url]] as const;
  const child = spawn(command, args, { detached: true, stdio: 'ignore' });
  child.unref();
}

function sendJson(response: ServerResponse, status: number, payload: unknown) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(`${JSON.stringify(payload)}\n`);
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > 1_000_000) throw new Error('Studio request body exceeds 1 MB.');
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>; }
  catch { throw new Error('Studio request body must be valid JSON.'); }
}

function tokenMatches(request: IncomingMessage, token: string) {
  const provided = request.headers.authorization?.replace(/^Bearer\s+/i, '') ?? request.headers['x-openpresent-token'];
  if (typeof provided !== 'string') return false;
  const left = Buffer.from(provided);
  const right = Buffer.from(token);
  return left.length === right.length && timingSafeEqual(left, right);
}

function actualPort(server: import('node:http').Server): number {
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Studio server did not expose a TCP address.');
  return address.port;
}

function vitePort(server: ViteDevServer): number {
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') throw new Error('Preview server did not expose a TCP address.');
  return address.port;
}

export async function startStudio(options: StartStudioOptions = {}): Promise<StudioServer> {
  // With no explicit target, resume the presentation that was open last. A
  // restart should put the author back where they were rather than dropping them
  // into whatever directory the process happens to start in.
  const lastOpened = listPresentations().find((entry) => !entry.missing)?.path;
  const requestedRoot = resolve(options.projectRoot ?? lastOpened ?? process.cwd());
  if (options.create) {
    if (options.entry) throw new Error('Studio --create accepts a target directory, not a separate deck entry.');
    scaffoldStudioProject(requestedRoot, { ...(options.skill ? { skill: options.skill } : {}) });
  }
  if (!existsSync(requestedRoot)) throw new Error(`Studio project does not exist: ${requestedRoot}. Use --create with an empty target to scaffold it.`);
  const root = canonicalProjectRoot(statSync(requestedRoot).isFile() ? join(requestedRoot, '..') : requestedRoot);
  if (!existsSync(join(root, 'index.html'))) throw new Error(`Studio project must contain index.html: ${root}`);
  const token = randomBytes(32).toString('base64url');
  // The open presentation is swappable: Studio is a workspace over a library of
  // documents, not a process bound to one folder for its lifetime.
  let engine = new StudioEngine({ projectRoot: root, entry: options.entry, openBrowser: openDefaultBrowser });
  const clientAssets = options.clientAssets ?? fileURLToPath(new URL('./client/', import.meta.url));
  let studioUrl = '';
  let previewUrl = '';
  let closed = false;
  let preview: ViteDevServer | undefined;
  let staticBuild: Promise<{ format: 'html'; filename: string; html: string; builtAt: string }> | undefined;
  let switching: Promise<unknown> | undefined;

  /**
   * Builds into a scratch directory and folds every asset into one HTML file, so
   * exporting never writes build output into the author's project and the
   * browser can hand the reader a single portable document to save where they
   * choose.
   */
  const buildStaticHtml = () => {
    if (staticBuild) return staticBuild;
    staticBuild = (async () => {
      const documentRoot = engine.projectRoot;
      const outDir = mkdtempSync(join(tmpdir(), 'openpresent-export-'));
      try {
        const { fsAllow: _fsAllow, ...options } = viteOptionsFor(documentRoot, engine.entryPath);
        await viteBuild({
          root: documentRoot,
          base: './',
          clearScreen: false,
          logLevel: 'silent',
          ...options,
          build: { outDir, emptyOutDir: true },
        });
        const index = join(outDir, 'index.html');
        if (!existsSync(index)) throw new Error('Static build completed without producing an index.html.');
        return {
          format: 'html' as const,
          filename: `${basename(documentRoot) || 'presentation'}.html`,
          html: inlineStaticHtml(outDir, index),
          builtAt: new Date().toISOString(),
        };
      } finally { rmSync(outDir, { recursive: true, force: true }); }
    })().finally(() => { staticBuild = undefined; });
    return staticBuild;
  };

  /**
   * Pushes state to open clients instead of having each poll for it. Sends are
   * coalesced because a single agent turn touches state many times per second.
   */
  const clients = new Set<ServerResponse>();
  let broadcastTimer: ReturnType<typeof setTimeout> | undefined;
  const broadcast = () => {
    if (broadcastTimer || clients.size === 0) return;
    broadcastTimer = setTimeout(() => {
      broadcastTimer = undefined;
      void engine.getState().then((state) => {
        const frame = `data: ${JSON.stringify(state)}\n\n`;
        for (const client of clients) client.write(frame);
      }).catch(() => undefined);
    }, 60);
    broadcastTimer.unref?.();
  };
  let unsubscribe = engine.subscribe(broadcast);

  const mountPreview = async (documentRoot: string, entryPath: string, port = 0, strictPort = false) => {
    const { fsAllow, ...viteOptions } = viteOptionsFor(documentRoot, entryPath);
    const server = await createViteServer({
      root: documentRoot,
      clearScreen: false,
      logLevel: 'silent',
      ...viteOptions,
      server: {
        host: HOST,
        port,
        strictPort,
        cors: { origin: studioUrl },
        ...(fsAllow ? { fs: { allow: fsAllow } } : {}),
      },
    });
    await server.listen();
    return server;
  };

  const applyMcpServer = () => {
    const mcpCommand = options.mcpCommand ? resolveCommandPath(options.mcpCommand) : undefined;
    if (options.mcpCommand && !mcpCommand) throw new Error(`OpenPresent MCP command is unavailable: ${options.mcpCommand}`);
    if (mcpCommand) engine.setAcpMcpServer({
      name: 'openpresent',
      command: mcpCommand,
      args: [...(options.mcpArgs ?? []), '--attach'],
      env: [
        { name: 'OPENPRESENT_STUDIO_URL', value: studioUrl },
        { name: 'OPENPRESENT_STUDIO_TOKEN', value: token },
        { name: 'OPENPRESENT_PROJECT', value: engine.projectRoot },
      ],
    });
  };

  const recordOpenDocument = async () => {
    const outline = await engine.getOutline();
    return rememberDocument({ path: engine.projectRoot, title: documentTitle(engine.projectRoot), slideCount: outline.length });
  };

  /**
   * Swaps the open presentation. The preview server's root is fixed at creation,
   * so switching documents means standing up a fresh one and retiring the old
   * engine — including its agent session — rather than mutating either in place.
   */
  const openDocument = async (target: string) => {
    if (switching) await switching.catch(() => undefined);
    const run = (async () => {
      const canonical = canonicalProjectRoot(resolve(target));
      if (!isDocumentRoot(canonical)) throw new Error(`Not an OpenPresent presentation: ${canonical}`);
      if (canonical === engine.projectRoot) return { studioUrl, previewUrl, entry: engine.entryPath };
      const nextEngine = new StudioEngine({ projectRoot: canonical, openBrowser: openDefaultBrowser });
      const nextPreview = await mountPreview(canonical, nextEngine.entryPath);
      const previousEngine = engine;
      const previousPreview = preview;
      engine = nextEngine;
      preview = nextPreview;
      previewUrl = `http://${HOST}:${vitePort(nextPreview)}`;
      engine.setUrls(studioUrl, previewUrl);
      // Follow the new engine so open clients keep receiving updates.
      unsubscribe();
      unsubscribe = engine.subscribe(broadcast);
      applyMcpServer();
      broadcast();
      await previousPreview?.close().catch(() => undefined);
      await previousEngine.dispose().catch(() => undefined);
      await recordOpenDocument();
      return { studioUrl, previewUrl, entry: engine.entryPath };
    })();
    switching = run;
    try { return await run; } finally { if (switching === run) switching = undefined; }
  };

  /** Creates a presentation in the author's own space and opens it. */
  const createDocument = async (name: string, templateId?: string) => {
    const target = reserveDocumentPath(name || 'presentation');
    scaffoldStudioDocument(target, { ...(options.skill ? { skill: options.skill } : {}) });
    const opened = await openDocument(target);
    // Always reset to the chosen starting point. Without this a new presentation
    // would open showing the starter's demo slides, which the author never asked
    // for and which an agent would then have to clear before it could begin.
    await engine.newDeck(templateId ?? 'blank');
    // Re-record after the template lands, or the library shows the starter's count.
    await recordOpenDocument();
    return { ...opened, path: target, library: listPresentations() };
  };

  const http = createHttpServer(async (request, response) => {
    try {
      const host = request.headers.host?.split(':')[0];
      if (host !== HOST && host !== 'localhost') return sendJson(response, 403, { error: 'Studio only accepts loopback Host headers.' });
      const url = new URL(request.url ?? '/', studioUrl || `http://${HOST}`);
      if (url.pathname.startsWith('/api/')) {
        if (!isAllowedBrowserOrigin(request.headers.origin, studioUrl)) return sendJson(response, 403, { error: 'Request origin is not the active Studio origin.' });
        const mutation = request.method !== 'GET';
        if (mutation && !tokenMatches(request, token)) return sendJson(response, 401, { error: 'Missing or invalid OpenPresent session token.' });
        const body = mutation ? await readJson(request) : {};
        if (request.method === 'GET' && url.pathname === '/api/health') return sendJson(response, 200, { ok: true, version: 1 });
        if (request.method === 'GET' && url.pathname === '/api/state') return sendJson(response, 200, await engine.getState());
        if (request.method === 'GET' && url.pathname === '/api/events') {
          response.writeHead(200, {
            'content-type': 'text/event-stream; charset=utf-8',
            'cache-control': 'no-store',
            connection: 'keep-alive',
          });
          // Send the opening frame before joining the broadcast set. Joining
          // first leaves the state read below racing any change that lands
          // while it runs, which would deliver the newer frame and then
          // overwrite it with this older one.
          response.write(`data: ${JSON.stringify(await engine.getState())}\n\n`);
          clients.add(response);
          // Keeps intermediaries and idle sockets from dropping a quiet stream.
          const heartbeat = setInterval(() => response.write(': keep-alive\n\n'), 25_000);
          heartbeat.unref?.();
          const stop = () => { clearInterval(heartbeat); clients.delete(response); };
          request.on('close', stop);
          request.on('error', stop);
          return;
        }
        if (request.method === 'GET' && url.pathname === '/api/outline') return sendJson(response, 200, await engine.getOutline());
        if (request.method === 'GET' && url.pathname === '/api/templates') return sendJson(response, 200, await engine.listSlideTemplates());
        if (request.method === 'GET' && url.pathname === '/api/selection') return sendJson(response, 200, await engine.getSelection() ?? null);
        if (request.method === 'GET' && url.pathname === '/api/library') {
          return sendJson(response, 200, { entries: listPresentations(), openPath: engine.projectRoot, documentsRoot: defaultDocumentsRoot() });
        }
        if (request.method === 'POST' && url.pathname === '/api/library/open') {
          const entry = listPresentations().find((item) => item.id === body.id);
          const target = typeof body.path === 'string' && body.path ? body.path : entry?.path;
          if (!target) return sendJson(response, 404, { error: 'That presentation is no longer in the library.' });
          return sendJson(response, 200, { ...await openDocument(target), library: listPresentations() });
        }
        if (request.method === 'POST' && url.pathname === '/api/library/create') {
          return sendJson(response, 200, await createDocument(String(body.name ?? ''), typeof body.templateId === 'string' && body.templateId ? body.templateId : undefined));
        }
        if (request.method === 'POST' && url.pathname === '/api/library/forget') {
          return sendJson(response, 200, { entries: forgetDocument(String(body.id ?? '')) });
        }
        if (request.method === 'POST' && url.pathname === '/api/open') return sendJson(response, 200, await engine.open(Boolean(body.openBrowser)));
        if (request.method === 'POST' && url.pathname === '/api/navigate') return sendJson(response, 200, await engine.navigate(String(body.slideId ?? '')));
        if (request.method === 'POST' && url.pathname === '/api/selection') return sendJson(response, 200, await engine.setSelection(body.selection));
        if (request.method === 'POST' && url.pathname === '/api/selection/clear') return sendJson(response, 200, await engine.clearSelection());
        if (request.method === 'POST' && url.pathname === '/api/selection/replace') return sendJson(response, 200, await engine.replaceSelectedText(String(body.text ?? '')));
        if (request.method === 'POST' && url.pathname === '/api/slide/delete') return sendJson(response, 200, await engine.deleteSlide(String(body.slideId ?? '')));
        if (request.method === 'POST' && url.pathname === '/api/slide/insert') return sendJson(response, 200, await engine.insertSlide(String(body.templateId ?? '')));
        if (request.method === 'POST' && url.pathname === '/api/deck/new') return sendJson(response, 200, await engine.newDeck(typeof body.templateId === 'string' && body.templateId ? body.templateId : undefined));
        if (request.method === 'POST' && url.pathname === '/api/save') return sendJson(response, 200, await engine.save());
        if (request.method === 'POST' && url.pathname === '/api/export/html') return sendJson(response, 200, await buildStaticHtml());
        if (request.method === 'POST' && url.pathname === '/api/validate') return sendJson(response, 200, await engine.validate({ browser: Boolean(body.browser) }));
        if (request.method === 'POST' && url.pathname === '/api/capture') return sendJson(response, 200, await engine.capture(typeof body.slideId === 'string' ? body.slideId : undefined));
        if (request.method === 'POST' && url.pathname === '/api/edit') return sendJson(response, 200, await engine.applyEdits(body.edits as GuardedEdit[]));
        if (request.method === 'POST' && url.pathname === '/api/undo') return sendJson(response, 200, await engine.undo());
        if (request.method === 'POST' && url.pathname === '/api/redo') return sendJson(response, 200, await engine.redo());
        if (request.method === 'POST' && url.pathname === '/api/history/revert') return sendJson(response, 200, await engine.revertTo(String(body.checkpointId ?? '')));
        if (request.method === 'POST' && url.pathname === '/api/agent/start') return sendJson(response, 200, await engine.startAgent(String(body.profileId ?? ''), typeof body.modelId === 'string' && body.modelId ? body.modelId : undefined));
        if (request.method === 'POST' && url.pathname === '/api/agent/prompt') return sendJson(response, 200, await engine.promptAgent(String(body.profileId ?? ''), String(body.prompt ?? '')));
        if (request.method === 'POST' && url.pathname === '/api/agent/cancel') return sendJson(response, 200, await engine.cancelAgent());
        if (request.method === 'POST' && url.pathname === '/api/agent/stop') return sendJson(response, 200, await engine.stopAgent());
        if (request.method === 'POST' && url.pathname === '/api/agent/transcript/clear') return sendJson(response, 200, await engine.clearTranscript());
        if (request.method === 'POST' && url.pathname === '/api/agent/permission') return sendJson(response, 200, await engine.respondPermission(String(body.requestId ?? ''), String(body.optionId ?? '')));
        if (request.method === 'POST' && url.pathname === '/api/agent/model') return sendJson(response, 200, await engine.setModel(typeof body.modelId === 'string' && body.modelId ? body.modelId : undefined, typeof body.profileId === 'string' && body.profileId ? body.profileId : undefined));
        if (request.method === 'POST' && url.pathname === '/api/agent/approvals') return sendJson(response, 200, await engine.setAutoApprove(Boolean(body.autoApproveSafe)));
        return sendJson(response, 404, { error: `Unknown Studio API route: ${url.pathname}` });
      }
      if (!existsSync(clientAssets)) return sendJson(response, 503, { error: 'Studio browser assets are missing. Build @openpresent/studio before starting it.' });
      const requested = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
      const path = resolve(clientAssets, requested);
      if (isAbsolute(relative(clientAssets, path)) || relative(clientAssets, path).startsWith('..')) return sendJson(response, 403, { error: 'Invalid Studio asset path.' });
      if (!existsSync(path) || !statSync(path).isFile()) return sendJson(response, 404, { error: 'Studio asset not found.' });
      if (requested === 'index.html') {
        const boot = { version: 1, token, studioUrl, previewUrl };
        const html = readFileSync(path, 'utf8').replace('</head>', `<script>window.__OPENPRESENT_BOOT__=${JSON.stringify(boot).replace(/</g, '\\u003c')}</script></head>`);
        response.writeHead(200, { 'content-type': CONTENT_TYPES['.html'], 'cache-control': 'no-store' });
        return response.end(html);
      }
      response.writeHead(200, { 'content-type': CONTENT_TYPES[extname(path)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
      createReadStream(path).pipe(response);
    } catch (error) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
    }
  });

  try {
    await new Promise<void>((resolveListen, reject) => {
      const onError = (error: Error) => reject(error);
      http.once('error', onError);
      http.listen(options.studioPort ?? 0, HOST, () => { http.off('error', onError); resolveListen(); });
    });
    studioUrl = `http://${HOST}:${actualPort(http)}`;
    // Same path as switching presentations, so the first document opened gets
    // the managed runtime on exactly the same terms as every later one.
    preview = await mountPreview(root, engine.entryPath, options.previewPort ?? 0, options.previewPort !== undefined);
    previewUrl = `http://${HOST}:${vitePort(preview)}`;
    engine.setUrls(studioUrl, previewUrl);
    applyMcpServer();
    await recordOpenDocument();
    if (options.open) await openDefaultBrowser(studioUrl);
  } catch (error) {
    await preview?.close();
    await new Promise<void>((resolveClose) => http.close(() => resolveClose()));
    await engine.dispose();
    throw new Error(`Could not start OpenPresent Studio: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Getters, not snapshots: the open presentation can change during the session.
  return {
    url: studioUrl,
    get previewUrl() { return previewUrl; },
    token,
    get engine() { return engine; },
    openDocument,
    async close() {
      if (closed) return;
      closed = true;
      unsubscribe();
      if (broadcastTimer) clearTimeout(broadcastTimer);
      for (const client of clients) client.end();
      clients.clear();
      await preview?.close();
      await new Promise<void>((resolveClose, reject) => http.close((error) => error ? reject(error) : resolveClose()));
      await engine.dispose();
    },
  };
}
