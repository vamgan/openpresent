import type { Diagnostic, ValidationResult } from '@openpresent/validator';
import type { SlideTemplateRecipe } from './templates';

export const STUDIO_PROTOCOL_VERSION = 1 as const;

export interface LogicalBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SemanticSelection {
  version: typeof STUDIO_PROTOCOL_VERSION;
  type: 'openpresent.selection';
  slideId: string;
  component: string;
  ownerComponent?: string;
  ownerBreadcrumb?: string;
  editable?: boolean;
  tag: string;
  text: string;
  breadcrumb: string;
  snippet: string;
  bounds: LogicalBounds;
}

export interface NavigationMessage {
  version: typeof STUDIO_PROTOCOL_VERSION;
  type: 'openpresent.navigation';
  slideId: string;
}

export interface TextEditMessage {
  version: typeof STUDIO_PROTOCOL_VERSION;
  type: 'openpresent.replace-text';
  slideId: string;
  text: string;
}

export type AuthoringMessage = SemanticSelection | NavigationMessage | TextEditMessage;

export interface SlideOutlineItem {
  id: string;
  title: string;
  label?: string;
  index: number;
}

export type AgentAvailability = 'ready' | 'adapter-available' | 'missing';
export type AgentLifecycle = 'disconnected' | 'connecting' | 'ready' | 'running' | 'cancelling' | 'error';

export interface AgentModel {
  /** Passed verbatim to the agent CLI, so it must be a value that CLI accepts. */
  id: string;
  label: string;
}

export interface AgentProfile {
  id: string;
  label: string;
  command: string;
  args: string[];
  source: 'built-in' | 'custom';
  adapter?: boolean;
  /**
   * Models this agent can run. Stable ACP v1 has no model negotiation (that is a
   * v2 addition), so the choice is applied by passing `modelFlag` to the CLI when
   * the process starts. Changing it therefore restarts the session.
   */
  models?: AgentModel[];
  modelFlag?: string;
}

export interface DiscoveredAgentProfile extends AgentProfile {
  availability: AgentAvailability;
  detail: string;
}

export interface AgentTranscriptItem {
  id: string;
  eventId?: string;
  at: string;
  role: 'user' | 'agent' | 'tool' | 'permission' | 'system';
  text: string;
  status?: 'pending' | 'complete' | 'denied' | 'error';
}

export interface PermissionChoice {
  optionId: string;
  kind: string;
  name: string;
}

export interface PendingPermission {
  id: string;
  title: string;
  toolKind?: string;
  risk: 'safe' | 'destructive';
  options: PermissionChoice[];
  requestedAt: string;
}

export interface AgentState {
  profileId?: string;
  /** Chosen model for the selected profile, if that profile offers a choice. */
  modelId?: string;
  lifecycle: AgentLifecycle;
  error?: string;
  /** The live agent session, absent whenever no process is running. */
  sessionId?: string;
  /**
   * The last session this presentation had, kept after the process exits so a
   * later connection can ask the agent to continue it rather than start over.
   */
  resumeSessionId?: string;
  transcript: AgentTranscriptItem[];
  /** Non-destructive in-root tool calls are approved without asking when true. */
  autoApproveSafe: boolean;
  pendingPermission?: PendingPermission;
}

export type ValidationLifecycle = 'idle' | 'validating' | 'clean' | 'issues' | 'error';

export interface StudioState {
  version: typeof STUDIO_PROTOCOL_VERSION;
  revision: number;
  projectRoot: string;
  entry: string;
  studioUrl: string;
  previewUrl: string;
  outline: SlideOutlineItem[];
  activeSlideId?: string;
  selection?: SemanticSelection;
  validation: {
    lifecycle: ValidationLifecycle;
    diagnostics: Diagnostic[];
    errorCount: number;
    warningCount: number;
    lastRunAt?: string;
    error?: string;
  };
  changedFiles: string[];
  persistence: {
    /**
     * There is no unsaved state to hold: every guarded edit is written to the
     * author's file atomically as it is applied, so `lastSavedAt` is the time of
     * the last real write rather than the last time anything was inspected.
     */
    mode: 'autosave';
    lastSavedAt: string;
    sourceSha256: string;
  };
  acceptanceImproved?: boolean;
  undoAvailable: boolean;
  redoAvailable: boolean;
  /** Most recent Studio-owned edits, oldest first. */
  history: HistoryEntry[];
  agents: DiscoveredAgentProfile[];
  agent: AgentState;
}

export interface GuardedEdit {
  path: string;
  oldText: string;
  newText: string;
  expectedSha256?: string;
}

export interface EditResult {
  checkpointId: string;
  changedFiles: string[];
}

export interface SelectedTextEditResult extends EditResult {
  selection: SemanticSelection;
  validation: ValidationResult;
}

export interface DeleteSlideResult extends EditResult {
  deletedSlideId: string;
  activeSlideId: string;
  validation: ValidationResult;
}

export interface InsertSlideResult extends EditResult {
  templateId: SlideTemplateRecipe['id'];
  slideId: string;
  validation: ValidationResult;
}

export type NewDeckResult = InsertSlideResult;

export interface UndoResult {
  checkpointId: string;
  restoredFiles: string[];
  label?: string;
}

export interface HistoryEntry {
  id: string;
  /** What the step did, so history reads as actions rather than checkpoints. */
  label: string;
  createdAt: string;
  changedFiles: string[];
}

export interface SaveResult {
  path: string;
  savedAt: string;
  sourceSha256: string;
  validation: ValidationResult;
}

export interface CaptureResult {
  slideId: string;
  mimeType: 'image/png';
  data: string;
  width: number;
  height: number;
}

export interface PromptResult {
  stopReason: string;
  changedFiles: string[];
  validation: ValidationResult;
  acceptanceImproved: boolean;
}

/** The deck source exactly as it is on disk, with the hash guarded edits check. */
export interface DeckSource {
  /** Project-relative path, ready to pass straight back to apply_edit. */
  path: string;
  source: string;
  sha256: string;
}

export interface StudioOperations {
  getState(): Promise<StudioState>;
  readDeck(): Promise<DeckSource>;
  getOutline(): Promise<SlideOutlineItem[]>;
  getSelection(): Promise<SemanticSelection | undefined>;
  open(openBrowser?: boolean): Promise<{ studioUrl: string; previewUrl: string }>;
  navigate(slideId: string): Promise<StudioState>;
  validate(options?: { browser?: boolean }): Promise<ValidationResult>;
  capture(slideId?: string): Promise<CaptureResult>;
  applyEdits(edits: GuardedEdit[]): Promise<EditResult>;
  replaceSelectedText(newText: string): Promise<SelectedTextEditResult>;
  deleteSlide(slideId: string): Promise<DeleteSlideResult>;
  listSlideTemplates(): Promise<readonly SlideTemplateRecipe[]>;
  insertSlide(templateId: string): Promise<InsertSlideResult>;
  newDeck(templateId?: string): Promise<NewDeckResult>;
  save(): Promise<SaveResult>;
  undo(): Promise<UndoResult>;
  redo(): Promise<UndoResult>;
  /** Steps the document back to the state just after the named history entry. */
  revertTo(checkpointId: string): Promise<UndoResult[]>;
}

function compact(value: string, limit: number): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, limit);
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function normalizeSelection(input: unknown): SemanticSelection {
  if (!input || typeof input !== 'object') throw new Error('Selection must be an object.');
  const value = input as Record<string, unknown>;
  if (value.version !== STUDIO_PROTOCOL_VERSION || value.type !== 'openpresent.selection') {
    throw new Error(`Unsupported selection message. Expected OpenPresent authoring protocol v${STUDIO_PROTOCOL_VERSION}.`);
  }
  const required = ['slideId', 'component', 'tag', 'text', 'breadcrumb', 'snippet'] as const;
  for (const key of required) if (typeof value[key] !== 'string') throw new Error(`Selection ${key} must be a string.`);
  const bounds = value.bounds as Record<string, unknown> | undefined;
  if (!bounds || !finiteNumber(bounds.x) || !finiteNumber(bounds.y) || !finiteNumber(bounds.width) || !finiteNumber(bounds.height)) {
    throw new Error('Selection bounds must contain finite x, y, width, and height values.');
  }
  const slideId = compact(value.slideId as string, 120);
  if (!slideId) throw new Error('Selection slideId cannot be empty.');
  return {
    version: STUDIO_PROTOCOL_VERSION,
    type: 'openpresent.selection',
    slideId,
    component: compact(value.component as string, 120) || 'HTML',
    ...(typeof value.ownerComponent === 'string' ? { ownerComponent: compact(value.ownerComponent, 120) || undefined } : {}),
    ...(typeof value.ownerBreadcrumb === 'string' ? { ownerBreadcrumb: compact(value.ownerBreadcrumb, 420) || undefined } : {}),
    ...(typeof value.editable === 'boolean' ? { editable: value.editable } : {}),
    tag: compact(value.tag as string, 60).toLowerCase() || 'div',
    text: compact(value.text as string, 320),
    breadcrumb: compact(value.breadcrumb as string, 420),
    snippet: compact(value.snippet as string, 700),
    bounds: {
      x: Math.round(bounds.x * 100) / 100,
      y: Math.round(bounds.y * 100) / 100,
      width: Math.max(0, Math.round(bounds.width * 100) / 100),
      height: Math.max(0, Math.round(bounds.height * 100) / 100),
    },
  };
}
