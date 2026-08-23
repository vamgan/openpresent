import { existsSync, realpathSync, statSync } from 'node:fs';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';

const BLOCKED_SEGMENTS = new Set(['.git', 'node_modules', 'dist', '.openpresent']);
const EDITABLE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.css', '.json', '.md', '.html', '.svg']);

function outside(root: string, target: string): boolean {
  const path = relative(root, target);
  return path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path);
}

function canonicalMissingPath(path: string): string {
  const tail: string[] = [];
  let cursor = path;
  while (!existsSync(cursor)) {
    const parent = dirname(cursor);
    if (parent === cursor) break;
    tail.unshift(path.slice(parent.length + 1, cursor.length));
    cursor = parent;
  }
  const canonicalParent = realpathSync(cursor);
  return resolve(canonicalParent, ...tail);
}

export function canonicalProjectRoot(projectRoot: string): string {
  const path = realpathSync(resolve(projectRoot));
  if (!statSync(path).isDirectory()) throw new Error(`Project root is not a directory: ${path}`);
  return path;
}

export function resolveProjectPath(projectRoot: string, candidate: string, options: { mustExist?: boolean; editable?: boolean } = {}): string {
  const root = canonicalProjectRoot(projectRoot);
  const absolute = resolve(root, candidate);
  if (outside(root, absolute)) throw new Error(`Path escapes the selected project root: ${candidate}`);
  if (options.mustExist && !existsSync(absolute)) throw new Error(`Project file does not exist: ${candidate}`);
  const canonical = existsSync(absolute) ? realpathSync(absolute) : canonicalMissingPath(absolute);
  if (outside(root, canonical)) throw new Error(`Path resolves outside the selected project root: ${candidate}`);
  const segments = relative(root, canonical).split(sep);
  if (segments.some((segment) => BLOCKED_SEGMENTS.has(segment))) throw new Error(`Path is not part of editable presentation source: ${candidate}`);
  if (options.editable && !EDITABLE_EXTENSIONS.has(extname(canonical).toLowerCase())) {
    throw new Error(`Unsupported presentation source type for guarded edits: ${candidate}`);
  }
  return canonical;
}

export function assertLoopbackUrl(value: string): URL {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || !['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) {
    throw new Error(`OpenPresent Studio only accepts loopback URLs, received ${value}.`);
  }
  return url;
}

export function isAllowedBrowserOrigin(origin: string | undefined, studioUrl: string): boolean {
  if (!origin) return true;
  try { return new URL(origin).origin === new URL(studioUrl).origin; }
  catch { return false; }
}

