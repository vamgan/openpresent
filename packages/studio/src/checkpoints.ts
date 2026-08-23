import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { canonicalProjectRoot, resolveProjectPath } from './security';
import type { GuardedEdit, EditResult, HistoryEntry, UndoResult } from './types';

interface FileSnapshot {
  path: string;
  existedBefore: boolean;
  /** Content on both sides of the change, so a step can be replayed in either direction. */
  before?: string;
  after?: string;
}

interface Checkpoint {
  id: string;
  label: string;
  createdAt: string;
  files: FileSnapshot[];
}

/** Keeps memory bounded on long sessions while covering any realistic undo depth. */
const HISTORY_LIMIT = 50;

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function atomicWrite(path: string, content: string) {
  mkdirSync(join(path, '..'), { recursive: true });
  const temporary = `${path}.openpresent-${randomUUID()}.tmp`;
  writeFileSync(temporary, content, 'utf8');
  renameSync(temporary, path);
}

function changedIn(checkpoint: Checkpoint) {
  return checkpoint.files.filter((file) => file.after !== undefined && file.after !== file.before);
}

/**
 * An ordered history of Studio-owned edits with a cursor, so authors can step
 * back through several changes and forward again — including the multi-file
 * writes an agent makes in one turn, which count as a single step.
 *
 * Every step records both sides of each file, and both undo and redo refuse to
 * run when a file has diverged since the step was recorded, so edits made
 * outside Studio are never silently discarded.
 */
export class CheckpointManager {
  private readonly directory = join(process.env.TMPDIR ?? '/tmp', `openpresent-checkpoints-${randomUUID()}`);
  private readonly projectRoot: string;
  private pending?: Checkpoint;
  private done: Checkpoint[] = [];
  private undone: Checkpoint[] = [];

  constructor(projectRoot: string) {
    this.projectRoot = canonicalProjectRoot(projectRoot);
    mkdirSync(this.directory, { recursive: true });
  }

  get available() { return this.done.length > 0; }
  get redoAvailable() { return this.undone.length > 0; }
  get id() { return this.pending?.id ?? this.done.at(-1)?.id; }

  begin(paths: string[], label = 'Edit'): string {
    const files = [...new Set(paths)].map((candidate) => {
      const path = resolveProjectPath(this.projectRoot, candidate, { editable: true });
      const existedBefore = existsSync(path);
      return {
        path,
        existedBefore,
        ...(existedBefore ? { before: readFileSync(path, 'utf8') } : {}),
      } satisfies FileSnapshot;
    });
    this.pending = { id: randomUUID(), label, createdAt: new Date().toISOString(), files };
    return this.pending.id;
  }

  hasPath(path: string): boolean {
    const canonical = resolveProjectPath(this.projectRoot, path, { editable: true });
    return Boolean(this.pending?.files.some((file) => file.path === canonical));
  }

  noteAfter(paths: string[]) {
    if (!this.pending) throw new Error('No OpenPresent checkpoint is active.');
    for (const candidate of paths) {
      const path = resolveProjectPath(this.projectRoot, candidate, { mustExist: true, editable: true });
      const snapshot = this.pending.files.find((file) => file.path === path);
      if (!snapshot) throw new Error(`File was not included in the active checkpoint: ${relative(this.projectRoot, path)}`);
      snapshot.after = readFileSync(path, 'utf8');
    }
  }

  changedFiles(): string[] {
    const checkpoint = this.pending ?? this.done.at(-1);
    if (!checkpoint) return [];
    return changedIn(checkpoint).map((file) => relative(this.projectRoot, file.path));
  }

  /** Commits the open step, or drops it when nothing actually changed. */
  commit(label?: string) {
    const checkpoint = this.pending;
    this.pending = undefined;
    if (!checkpoint || changedIn(checkpoint).length === 0) return;
    if (label) checkpoint.label = label;
    checkpoint.files = changedIn(checkpoint);
    this.done.push(checkpoint);
    if (this.done.length > HISTORY_LIMIT) this.done.shift();
    // A new edit after undoing abandons the branch that was undone.
    this.undone = [];
  }

  /** Kept for the agent flow, where a turn may legitimately change nothing. */
  discardIfUnchanged() { this.commit(); }

  applyGuarded(edits: GuardedEdit[], label = 'Edit'): EditResult {
    if (edits.length === 0) throw new Error('At least one guarded edit is required.');
    const prepared = edits.map((edit) => {
      const path = resolveProjectPath(this.projectRoot, edit.path, { mustExist: true, editable: true });
      const content = readFileSync(path, 'utf8');
      if (edit.expectedSha256 && sha256(content) !== edit.expectedSha256) throw new Error(`Guard failed because ${edit.path} changed after it was inspected.`);
      if (!edit.oldText) throw new Error(`Guarded edit for ${edit.path} requires non-empty oldText.`);
      const occurrences = content.split(edit.oldText).length - 1;
      if (occurrences !== 1) throw new Error(`Guarded edit expected oldText exactly once in ${edit.path}, found ${occurrences}.`);
      return { path, next: content.replace(edit.oldText, edit.newText) };
    });
    const id = this.begin(prepared.map((item) => item.path), label);
    for (const item of prepared) atomicWrite(item.path, item.next);
    this.noteAfter(prepared.map((item) => item.path));
    const changedFiles = this.changedFiles();
    this.commit();
    return { checkpointId: id, changedFiles };
  }

  writeFromAgent(path: string, content: string, expectedSha256: string): string {
    const canonical = resolveProjectPath(this.projectRoot, path, { mustExist: true, editable: true });
    const current = readFileSync(canonical, 'utf8');
    if (sha256(current) !== expectedSha256) throw new Error(`Agent write guard failed because ${relative(this.projectRoot, canonical)} changed after it was read.`);
    if (!this.pending) this.begin([canonical], 'Agent edit');
    if (!this.hasPath(canonical)) throw new Error(`Agent write was not included in the active OpenPresent checkpoint: ${relative(this.projectRoot, canonical)}`);
    atomicWrite(canonical, content);
    this.noteAfter([canonical]);
    return relative(this.projectRoot, canonical);
  }

  history(): HistoryEntry[] {
    return this.done.map((checkpoint) => ({
      id: checkpoint.id,
      label: checkpoint.label,
      createdAt: checkpoint.createdAt,
      changedFiles: checkpoint.files.map((file) => relative(this.projectRoot, file.path)),
    }));
  }

  undo(): UndoResult {
    const checkpoint = this.done.at(-1);
    if (!checkpoint) throw new Error('There is no studio-owned edit to undo.');
    this.assertUnchanged(checkpoint, 'after');
    const restoredFiles = this.applySide(checkpoint, 'before');
    this.done.pop();
    this.undone.push(checkpoint);
    return { checkpointId: checkpoint.id, restoredFiles, label: checkpoint.label };
  }

  redo(): UndoResult {
    const checkpoint = this.undone.at(-1);
    if (!checkpoint) throw new Error('There is no undone edit to redo.');
    this.assertUnchanged(checkpoint, 'before');
    const restoredFiles = this.applySide(checkpoint, 'after');
    this.undone.pop();
    this.done.push(checkpoint);
    return { checkpointId: checkpoint.id, restoredFiles, label: checkpoint.label };
  }

  dispose() {
    rmSync(this.directory, { recursive: true, force: true });
    this.pending = undefined;
    this.done = [];
    this.undone = [];
  }

  /** Refuses to move when the file no longer matches the side we are leaving. */
  private assertUnchanged(checkpoint: Checkpoint, side: 'before' | 'after') {
    for (const file of checkpoint.files) {
      const expected = file[side];
      const current = existsSync(file.path) ? readFileSync(file.path, 'utf8') : undefined;
      if (current !== expected) {
        const action = side === 'after' ? 'Undo' : 'Redo';
        throw new Error(`${action} refused because ${relative(this.projectRoot, file.path)} changed after the studio edit.`);
      }
    }
  }

  private applySide(checkpoint: Checkpoint, side: 'before' | 'after'): string[] {
    const restored: string[] = [];
    for (const file of checkpoint.files) {
      const content = file[side];
      if (content === undefined) rmSync(file.path, { force: true });
      else atomicWrite(file.path, content);
      restored.push(relative(this.projectRoot, file.path));
    }
    return restored;
  }
}
