import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { studioDataRoot } from './library';
import type { AgentTranscriptItem } from './types';

/**
 * Working state for one presentation: where the author left off and what the
 * agent has said so far. It is scoped to the document rather than to the Studio
 * process, so switching presentations swaps conversations instead of carrying
 * one deck's history into another, and reopening resumes where you were.
 *
 * It is stored beside the library in Studio's own directory — this is Studio's
 * memory of your work, not part of the document, and must never be written into
 * the author's folder.
 */
export interface StoredSession {
  version: 1;
  documentPath: string;
  activeSlideId?: string;
  transcript: AgentTranscriptItem[];
  autoApproveSafe: boolean;
  /** The connector last used here, so returning reopens the same agent. */
  profileId?: string;
  /** Agent-side session to resume, when the agent supports resuming one. */
  sessionId?: string;
  /** Model chosen for this presentation's agent, when it offers a choice. */
  modelId?: string;
  updatedAt: string;
}

const TRANSCRIPT_LIMIT = 100;

function sessionsRoot() { return join(studioDataRoot(), 'sessions'); }

/** Hashed so the filename stays valid for any path, on any platform. */
function sessionFile(documentPath: string) {
  return join(sessionsRoot(), `${createHash('sha256').update(resolve(documentPath)).digest('hex').slice(0, 32)}.json`);
}

function isTranscriptItem(value: unknown): value is AgentTranscriptItem {
  const item = value as Partial<AgentTranscriptItem> | null;
  return Boolean(item && typeof item.id === 'string' && typeof item.at === 'string' && typeof item.text === 'string'
    && ['user', 'agent', 'tool', 'permission', 'system'].includes(item.role as string));
}

export function readSession(documentPath: string): StoredSession | undefined {
  const path = sessionFile(documentPath);
  if (!existsSync(path)) return undefined;
  let parsed: unknown;
  try { parsed = JSON.parse(readFileSync(path, 'utf8')); } catch { return undefined; }
  const value = parsed as Partial<StoredSession> | null;
  if (!value || value.version !== 1) return undefined;
  return {
    version: 1,
    documentPath: resolve(documentPath),
    ...(typeof value.activeSlideId === 'string' ? { activeSlideId: value.activeSlideId } : {}),
    transcript: Array.isArray(value.transcript) ? value.transcript.filter(isTranscriptItem).slice(-TRANSCRIPT_LIMIT) : [],
    autoApproveSafe: value.autoApproveSafe !== false,
    ...(typeof value.profileId === 'string' && value.profileId ? { profileId: value.profileId } : {}),
    ...(typeof value.sessionId === 'string' && value.sessionId ? { sessionId: value.sessionId } : {}),
    ...(typeof value.modelId === 'string' && value.modelId ? { modelId: value.modelId } : {}),
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date().toISOString(),
  };
}

export function writeSession(session: Omit<StoredSession, 'version' | 'updatedAt'>): void {
  const path = sessionFile(session.documentPath);
  mkdirSync(sessionsRoot(), { recursive: true });
  const payload: StoredSession = {
    version: 1,
    documentPath: resolve(session.documentPath),
    ...(session.activeSlideId ? { activeSlideId: session.activeSlideId } : {}),
    transcript: session.transcript.slice(-TRANSCRIPT_LIMIT),
    autoApproveSafe: session.autoApproveSafe,
    ...(session.profileId ? { profileId: session.profileId } : {}),
    ...(session.sessionId ? { sessionId: session.sessionId } : {}),
    ...(session.modelId ? { modelId: session.modelId } : {}),
    updatedAt: new Date().toISOString(),
  };
  const temporary = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  renameSync(temporary, path);
}

export function clearSession(documentPath: string): void {
  rmSync(sessionFile(documentPath), { force: true });
}
