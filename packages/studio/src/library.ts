import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { homedir, platform, tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';

/**
 * The library of presentations the author has created or opened. It lives in
 * Studio's own data directory rather than in any presentation, so a document
 * stays a plain folder the author can move, copy, or delete without Studio
 * noticing, and so no Studio bookkeeping is ever written into their work.
 */
export interface LibraryEntry {
  id: string;
  /** Project root holding the deck; the document the author owns. */
  path: string;
  title: string;
  slideCount: number;
  createdAt: string;
  lastOpenedAt: string;
  /** Set when the folder has been moved or deleted since it was last opened. */
  missing?: boolean;
}

export function studioDataRoot(): string {
  const override = process.env.OPENPRESENT_DATA_DIR;
  if (override) return resolve(override);
  const home = homedir() || tmpdir();
  if (platform() === 'darwin') return join(home, 'Library', 'Application Support', 'OpenPresent');
  if (platform() === 'win32') return join(process.env.APPDATA ?? join(home, 'AppData', 'Roaming'), 'OpenPresent');
  return join(process.env.XDG_DATA_HOME ?? join(home, '.local', 'share'), 'openpresent');
}

/** Where new presentations are created: the author's space, never the install. */
export function defaultDocumentsRoot(): string {
  const override = process.env.OPENPRESENT_DOCUMENTS_DIR;
  if (override) return resolve(override);
  const home = homedir() || tmpdir();
  const documents = join(home, 'Documents');
  return join(existsSync(documents) ? documents : home, 'OpenPresent');
}

function libraryFile() { return join(studioDataRoot(), 'library.json'); }

function writeLibrary(entries: LibraryEntry[]) {
  const path = libraryFile();
  mkdirSync(join(path, '..'), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify({ version: 1, entries }, null, 2)}\n`, 'utf8');
  renameSync(temporary, path);
}

function isEntry(value: unknown): value is LibraryEntry {
  const item = value as Partial<LibraryEntry> | null;
  return Boolean(item && typeof item.id === 'string' && typeof item.path === 'string' && typeof item.title === 'string');
}

/** A presentation is any folder Studio can open: an index.html plus a deck entry. */
export function isDocumentRoot(path: string): boolean {
  if (!existsSync(join(path, 'index.html'))) return false;
  return ['src/deck.tsx', 'deck.tsx', 'src/deck.ts', 'deck.ts'].some((candidate) => existsSync(join(path, candidate)));
}

export function readLibrary(): LibraryEntry[] {
  const path = libraryFile();
  if (!existsSync(path)) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(readFileSync(path, 'utf8')); } catch { return []; }
  const entries = (parsed as { entries?: unknown[] } | null)?.entries;
  if (!Array.isArray(entries)) return [];
  return entries
    .filter(isEntry)
    .map((entry) => ({ ...entry, missing: !isDocumentRoot(entry.path) }))
    .sort((left, right) => right.lastOpenedAt.localeCompare(left.lastOpenedAt));
}

/**
 * Presentations sitting in the documents folder that the library has not
 * recorded: created before the library existed, restored from a backup, or
 * simply copied in. The folder is what the author owns, so it is the source of
 * truth and the library is only a recency index over it.
 */
export function discoverDocuments(parent = defaultDocumentsRoot()): LibraryEntry[] {
  if (!existsSync(parent)) return [];
  const recorded = new Set(readLibrary().map((entry) => resolve(entry.path)));
  const found: LibraryEntry[] = [];
  for (const item of readdirSync(parent, { withFileTypes: true })) {
    if (!item.isDirectory()) continue;
    const path = resolve(join(parent, item.name));
    if (recorded.has(path) || !isDocumentRoot(path)) continue;
    const at = statSync(path).mtime.toISOString();
    found.push({
      id: `found:${path}`,
      path,
      title: documentTitle(path),
      slideCount: 0,
      createdAt: at,
      lastOpenedAt: at,
    });
  }
  return found;
}

/** Everything the author can open, recorded or merely present on disk. */
export function listPresentations(): LibraryEntry[] {
  return [...readLibrary(), ...discoverDocuments()]
    .sort((left, right) => right.lastOpenedAt.localeCompare(left.lastOpenedAt));
}

/** Records a presentation as opened, keyed by path so re-opening never duplicates. */
export function rememberDocument(input: { path: string; title: string; slideCount: number }): LibraryEntry {
  const path = resolve(input.path);
  const now = new Date().toISOString();
  const entries = readLibrary();
  const existing = entries.find((entry) => resolve(entry.path) === path);
  const entry: LibraryEntry = existing
    ? { ...existing, title: input.title, slideCount: input.slideCount, lastOpenedAt: now, missing: false }
    : { id: randomUUID(), path, title: input.title, slideCount: input.slideCount, createdAt: now, lastOpenedAt: now };
  writeLibrary([entry, ...entries.filter((item) => item.id !== entry.id)].map(({ missing: _missing, ...rest }) => rest));
  return entry;
}

/** Removes a presentation from the list. The author's folder is left untouched. */
export function forgetDocument(id: string): LibraryEntry[] {
  writeLibrary(readLibrary().filter((entry) => entry.id !== id).map(({ missing: _missing, ...rest }) => rest));
  return readLibrary();
}

export function documentSlug(name: string): string {
  return name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'presentation';
}

/** Picks a free folder for a new presentation without ever overwriting one. */
export function reserveDocumentPath(name: string, parent = defaultDocumentsRoot()): string {
  mkdirSync(parent, { recursive: true });
  const base = documentSlug(name);
  let candidate = join(parent, base);
  let suffix = 2;
  while (existsSync(candidate) && readdirSync(candidate).length > 0) candidate = join(parent, `${base}-${suffix++}`);
  return candidate;
}

export function documentTitle(path: string): string {
  return basename(resolve(path)).replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Untitled presentation';
}
