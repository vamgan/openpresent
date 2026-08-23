import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { extractModelFromSource, validateTarget, validateUrl, type Diagnostic, type ValidationResult } from '@openpresent/validator';
import ts from 'typescript';
import { CheckpointManager, sha256 } from './checkpoints';
import { AcpManager, type AcpMcpServer } from './acp';
import { discoverAgentProfiles, loadAgentProfiles } from './agents';
import { canonicalProjectRoot, resolveProjectPath } from './security';
import { clearSession, readSession, writeSession } from './session';
import {
  PRESENTATION_EXTENSIONS,
  narrowToSelected,
  slideRemoval,
  slug,
  substringCandidates,
  textCandidates,
  uniqueGuardedEdit,
  withInsertedSlide,
} from './deck-source';
import { listSlideTemplates, resolveSlideTemplate, type SlideTemplateRecipe } from './templates';
import {
  STUDIO_PROTOCOL_VERSION,
  normalizeSelection,
  type CaptureResult,
  type EditResult,
  type DeleteSlideResult,
  type GuardedEdit,
  type SemanticSelection,
  type SlideOutlineItem,
  type StudioOperations,
  type StudioState,
  type UndoResult,
  type PromptResult,
  type SelectedTextEditResult,
  type InsertSlideResult,
  type NewDeckResult,
  type PendingPermission,
} from './types';

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.css', '.json', '.html', '.svg']);
const SKIP_DIRECTORIES = new Set(['node_modules', 'dist', '.git', '.openpresent', 'test-results']);

/** Upper bound on any single capture step, so a stuck browser fails instead of hanging. */
const CAPTURE_TIMEOUT_MS = 20_000;

export interface StudioEngineOptions {
  projectRoot: string;
  entry?: string;
  studioUrl?: string;
  previewUrl?: string;
  openBrowser?: (url: string) => Promise<void>;
}

function resultFrom(diagnostics: Diagnostic[]): ValidationResult {
  const unique = [...new Map(diagnostics.map((item) => [
    [item.ruleId, item.severity, item.slideId, item.element, item.message].join('|'), item,
  ])).values()];
  const errorCount = unique.filter((item) => item.severity === 'error').length;
  const warningCount = unique.filter((item) => item.severity === 'warning').length;
  return { valid: errorCount === 0, diagnostics: unique, errorCount, warningCount };
}

function findEntry(projectRoot: string, entry?: string): string {
  if (entry) return resolveProjectPath(projectRoot, entry, { mustExist: true, editable: true });
  for (const candidate of ['src/deck.tsx', 'deck.tsx', 'src/deck.ts', 'deck.ts']) {
    const path = join(projectRoot, candidate);
    if (existsSync(path)) return resolveProjectPath(projectRoot, path, { mustExist: true, editable: true });
  }
  throw new Error(`No authoritative deck entry found in ${projectRoot}. Expected src/deck.tsx or deck.tsx.`);
}

function listSourceFiles(projectRoot: string): string[] {
  const files: string[] = [];
  const visit = (directory: string) => {
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      if (item.isSymbolicLink()) continue;
      const path = join(directory, item.name);
      if (item.isDirectory()) {
        if (!SKIP_DIRECTORIES.has(item.name)) visit(path);
      } else if (item.isFile() && SOURCE_EXTENSIONS.has(extname(item.name).toLowerCase())) {
        files.push(resolveProjectPath(projectRoot, path, { mustExist: true, editable: true }));
      }
    }
  };
  visit(projectRoot);
  return files;
}


export class StudioEngine implements StudioOperations {
  readonly projectRoot: string;
  readonly entryPath: string;
  readonly checkpoints: CheckpointManager;
  private state: StudioState;
  private readonly openBrowser?: (url: string) => Promise<void>;
  private readonly acp: AcpManager;
  private acpMcpServer?: AcpMcpServer;
  private pendingApproval?: { id: string; resolve: (optionId: string) => void };
  private persistTimer?: ReturnType<typeof setTimeout>;
  private readonly listeners = new Set<() => void>();

  constructor(options: StudioEngineOptions) {
    this.projectRoot = canonicalProjectRoot(options.projectRoot);
    this.entryPath = findEntry(this.projectRoot, options.entry);
    this.checkpoints = new CheckpointManager(this.projectRoot);
    this.openBrowser = options.openBrowser;
    const outline = this.readOutline();
    const agents = discoverAgentProfiles(loadAgentProfiles(this.projectRoot));
    this.state = {
      version: STUDIO_PROTOCOL_VERSION,
      revision: 1,
      projectRoot: this.projectRoot,
      entry: relative(this.projectRoot, this.entryPath),
      studioUrl: options.studioUrl ?? '',
      previewUrl: options.previewUrl ?? '',
      outline,
      activeSlideId: outline[0]?.id,
      validation: { lifecycle: 'idle', diagnostics: [], errorCount: 0, warningCount: 0 },
      changedFiles: [],
      persistence: {
        mode: 'autosave', lastSavedAt: new Date().toISOString(),
        sourceSha256: sha256(readFileSync(this.entryPath, 'utf8')),
      },
      undoAvailable: false,
      redoAvailable: false,
      history: [],
      agents,
      agent: { lifecycle: 'disconnected', transcript: [], autoApproveSafe: true },
    };
    this.acp = new AcpManager(this.projectRoot, {
      onLifecycle: (lifecycle, error) => this.setAgentState({ lifecycle, error }),
      onSession: (sessionId) => this.setAgentState({ sessionId }),
      onTranscript: (item) => this.addTranscript(item),
      writeFile: (path, content, expected) => this.checkpoints.writeFromAgent(path, content, expected),
      requestApproval: (request) => this.awaitApproval(request),
    });
    this.restoreSession();
  }

  /**
   * Resumes this presentation's own working state. The agent process never
   * survives a restart, so the transcript is restored as history while the
   * lifecycle stays disconnected.
   */
  private restoreSession() {
    const stored = readSession(this.projectRoot);
    if (!stored) return;
    if (stored.activeSlideId && this.state.outline.some((slide) => slide.id === stored.activeSlideId)) {
      this.state.activeSlideId = stored.activeSlideId;
    }
    this.state.agent = {
      ...this.state.agent,
      transcript: stored.transcript,
      autoApproveSafe: stored.autoApproveSafe,
      // The process never survives a restart, so the connector is restored as a
      // preference to reconnect with, while the lifecycle stays disconnected.
      ...(stored.profileId ? { profileId: stored.profileId } : {}),
      ...(stored.sessionId ? { resumeSessionId: stored.sessionId } : {}),
      ...(stored.modelId ? { modelId: stored.modelId } : {}),
    };
    this.acp.autoApproveSafe = stored.autoApproveSafe;
  }

  private persistSession() {
    try {
      writeSession({
        documentPath: this.projectRoot,
        ...(this.state.activeSlideId ? { activeSlideId: this.state.activeSlideId } : {}),
        transcript: this.state.agent.transcript,
        autoApproveSafe: this.state.agent.autoApproveSafe,
        ...(this.state.agent.profileId ? { profileId: this.state.agent.profileId } : {}),
        ...(this.state.agent.resumeSessionId ? { sessionId: this.state.agent.resumeSessionId } : {}),
        ...(this.state.agent.modelId ? { modelId: this.state.agent.modelId } : {}),
      });
    } catch { /* session memory is a convenience; never fail an edit over it */ }
  }

  /** Coalesces the writes that agent streaming would otherwise trigger per chunk. */
  private schedulePersist() {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = undefined;
      this.persistSession();
    }, 400);
    this.persistTimer.unref?.();
  }

  private flushSession() {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = undefined;
    }
    this.persistSession();
  }

  setUrls(studioUrl: string, previewUrl: string) {
    this.state.studioUrl = studioUrl;
    this.state.previewUrl = previewUrl;
    this.touch();
  }

  setAcpMcpServer(server: AcpMcpServer | undefined) { this.acpMcpServer = server; }

  async getState(): Promise<StudioState> { return structuredClone(this.state); }
  async getOutline(): Promise<SlideOutlineItem[]> { return structuredClone(this.state.outline); }
  async getSelection(): Promise<SemanticSelection | undefined> { return this.state.selection ? structuredClone(this.state.selection) : undefined; }

  async open(openBrowser = false) {
    if (openBrowser) {
      if (!this.openBrowser) throw new Error('Opening a browser is unavailable in this environment.');
      await this.openBrowser(this.state.studioUrl);
    }
    return { studioUrl: this.state.studioUrl, previewUrl: this.state.previewUrl };
  }

  async navigate(slideId: string): Promise<StudioState> {
    if (!this.state.outline.some((slide) => slide.id === slideId)) throw new Error(`Unknown slide ID "${slideId}".`);
    this.state.activeSlideId = slideId;
    if (this.state.selection?.slideId !== slideId) delete this.state.selection;
    this.touch();
    return this.getState();
  }

  async setSelection(input: unknown): Promise<StudioState> {
    const selection = normalizeSelection(input);
    if (!this.state.outline.some((slide) => slide.id === selection.slideId)) throw new Error(`Selection references unknown slide "${selection.slideId}".`);
    this.state.selection = selection;
    this.state.activeSlideId = selection.slideId;
    this.touch();
    return this.getState();
  }

  async clearSelection(): Promise<StudioState> {
    delete this.state.selection;
    this.touch();
    return this.getState();
  }

  async validate(options: { browser?: boolean } = {}): Promise<ValidationResult> {
    this.state.validation = { ...this.state.validation, lifecycle: 'validating', error: undefined };
    this.touch();
    try {
      const source = await validateTarget(this.entryPath);
      const browser = options.browser ? await validateUrl(this.previewForSlide(this.state.activeSlideId)) : undefined;
      const result = resultFrom([...source.diagnostics, ...(browser?.diagnostics ?? [])]);
      this.state.validation = {
        lifecycle: result.valid && result.warningCount === 0 ? 'clean' : 'issues',
        diagnostics: result.diagnostics,
        errorCount: result.errorCount,
        warningCount: result.warningCount,
        lastRunAt: new Date().toISOString(),
      };
      this.touch();
      return result;
    } catch (error) {
      this.state.validation = {
        ...this.state.validation,
        lifecycle: 'error',
        error: error instanceof Error ? error.message : String(error),
        lastRunAt: new Date().toISOString(),
      };
      this.touch();
      throw error;
    }
  }

  async capture(slideId = this.state.activeSlideId): Promise<CaptureResult> {
    if (!slideId || !this.state.outline.some((slide) => slide.id === slideId)) throw new Error(`Unknown slide ID "${slideId ?? ''}".`);
    let playwright: typeof import('playwright');
    try { playwright = await import('playwright'); }
    catch { throw new Error('Slide capture requires Playwright. Install Playwright and its Chromium browser.'); }
    // `--no-sandbox` keeps capture working inside the containers CI and many
    // dev setups run in, where the Chromium sandbox cannot be created.
    const browser = await playwright.chromium.launch({ headless: true, args: ['--no-sandbox'] });
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
      // Never wait for network idle: the preview holds an open HMR socket, so
      // idle may never arrive and the capture would hang an agent forever.
      // Every step is bounded for the same reason.
      page.setDefaultTimeout(CAPTURE_TIMEOUT_MS);
      await page.goto(this.previewForSlide(slideId), { waitUntil: 'load', timeout: CAPTURE_TIMEOUT_MS });
      await page.waitForFunction(
        (id) => document.querySelector<HTMLElement>('[data-openpresent-slide]')?.dataset.openpresentSlide === id,
        slideId,
        { timeout: CAPTURE_TIMEOUT_MS },
      );
      const stage = page.locator('.op-stage-shell');
      const box = await stage.boundingBox();
      const data = await stage.screenshot({ type: 'png', timeout: CAPTURE_TIMEOUT_MS });
      return { slideId, mimeType: 'image/png', data: data.toString('base64'), width: Math.round(box?.width ?? 0), height: Math.round(box?.height ?? 0) };
    } finally { await browser.close(); }
  }

  async applyEdits(edits: GuardedEdit[], label = 'Edit'): Promise<EditResult> {
    const result = this.checkpoints.applyGuarded(edits, label);
    this.state.changedFiles = result.changedFiles;
    this.syncHistory();
    this.refreshOutline();
    this.markSaved();
    this.touch();
    return result;
  }

  async replaceSelectedText(newText: string): Promise<SelectedTextEditResult> {
    const selection = this.state.selection;
    if (!selection) throw new Error('Select a visible text element before editing its text.');
    if (!selection.text) throw new Error('The selected element has no visible text to replace.');
    if (!newText.trim()) throw new Error('Replacement text cannot be empty.');
    // Whole-value matches first; only fall back to fragments when a primitive
    // split the string across elements and nothing matched outright.
    const collect = (find: typeof textCandidates) => {
      const inEntry = find(this.entryPath, readFileSync(this.entryPath, 'utf8'), selection.text);
      if (inEntry.length > 0) return inEntry;
      return listSourceFiles(this.projectRoot)
        .filter((path) => path !== this.entryPath && PRESENTATION_EXTENSIONS.has(extname(path).toLowerCase()))
        .flatMap((path) => find(path, readFileSync(path, 'utf8'), selection.text));
    };
    const exact = collect(textCandidates);
    const candidates = exact.length > 0 ? exact : collect(substringCandidates);
    const candidate = narrowToSelected(candidates, selection.slideId);
    if (!candidate) {
      throw new Error(`Selected text must resolve to exactly one serializable TSX text value; found ${candidates.length} matches for "${selection.text}".`);
    }
    const edit = await this.applyEdits([{
      path: relative(this.projectRoot, candidate.path),
      ...uniqueGuardedEdit(readFileSync(candidate.path, 'utf8'), candidate, newText),
    }], `Edit text on ${selection.slideId}`);
    this.state.selection = { ...selection, text: newText.trim() };
    const validation = await this.validate();
    return { ...edit, selection: structuredClone(this.state.selection), validation };
  }

  async deleteSlide(slideId: string): Promise<DeleteSlideResult> {
    const outline = this.state.outline;
    const index = outline.findIndex((slide) => slide.id === slideId);
    if (index < 0) throw new Error(`Unknown slide ID "${slideId}".`);
    if (outline.length <= 1) throw new Error('OpenPresent refuses to delete the final slide.');
    const source = readFileSync(this.entryPath, 'utf8');
    const removal = slideRemoval(source, this.entryPath, slideId);
    const nextSource = source.replace(removal.oldText, '');
    const nextModel = extractModelFromSource(nextSource, this.entryPath);
    const nextIds = (nextModel.slides ?? []).flatMap((slide) => slide.id ? [slide.id] : []);
    if (nextIds.includes(slideId) || nextIds.length !== outline.length - 1) {
      throw new Error(`Delete slide refused because the prospective TSX model did not remove exactly "${slideId}".`);
    }
    const nextActive = outline[index + 1]?.id ?? outline[index - 1]!.id;
    const edit = await this.applyEdits([{
      path: relative(this.projectRoot, this.entryPath),
      oldText: removal.oldText,
      newText: '',
    }], `Delete slide ${slideId}`);
    delete this.state.selection;
    if (!this.state.outline.some((slide) => slide.id === nextActive)) throw new Error('Delete slide produced an invalid active-slide target.');
    this.state.activeSlideId = nextActive;
    this.touch();
    const validation = await this.validate();
    return { ...edit, deletedSlideId: slideId, activeSlideId: nextActive, validation };
  }

  async listSlideTemplates(): Promise<readonly SlideTemplateRecipe[]> { return listSlideTemplates(); }

  async newDeck(templateId = 'blank'): Promise<NewDeckResult> {
    const template = resolveSlideTemplate(templateId);
    const source = readFileSync(this.entryPath, 'utf8');
    const metadataId = source.match(/metadata:\s*\{[^}]*?\bid:\s*['"]([^'"]+)['"]/)?.[1]?.trim() || 'openpresent-deck';
    const title = template.defaultTitle;
    const imports = [...new Set(['Slide', ...template.imports])];
    const nextSource = [
      "import { defineDeck } from '@openpresent/core';",
      `import { ${imports.join(', ')} } from '@openpresent/components';`,
      '',
      'export const deck = defineDeck({',
      `  metadata: { id: ${JSON.stringify(metadataId)}, title: ${JSON.stringify(title)} },`,
      '  // No theme set: the runtime default applies until one is chosen for this subject.',
      '  slides: [',
      `    <Slide id="opening" title=${JSON.stringify(title)} transition="fade">`,
      `      ${template.body}`,
      '    </Slide>,',
      '  ],',
      '});',
      '',
    ].join('\n');
    const nextModel = extractModelFromSource(nextSource, this.entryPath);
    const nextIds = (nextModel.slides ?? []).flatMap((slide) => slide.id ? [slide.id] : []);
    if (nextIds.length !== 1 || nextIds[0] !== 'opening') {
      throw new Error('New deck refused because the prospective TSX model did not contain exactly one "opening" slide.');
    }
    const edit = await this.applyEdits([{
      path: relative(this.projectRoot, this.entryPath), oldText: source, newText: nextSource,
    }], 'New presentation');
    this.state.activeSlideId = 'opening';
    delete this.state.selection;
    // A new deck starts a new conversation; carrying the old transcript over
    // would show activity that no longer refers to anything on screen.
    this.state.agent = { ...this.state.agent, transcript: [] };
    delete this.state.acceptanceImproved;
    clearSession(this.projectRoot);
    this.touch();
    const validation = await this.validate();
    return { ...edit, templateId: template.id, slideId: 'opening', validation };
  }

  async insertSlide(templateId: string): Promise<InsertSlideResult> {
    const template = resolveSlideTemplate(templateId);
    const ids = new Set(this.state.outline.map((slide) => slide.id));
    const base = slug(template.id === 'blank' ? template.defaultTitle : template.id);
    let slideId = base;
    let suffix = 2;
    while (ids.has(slideId)) slideId = `${base}-${suffix++}`;
    const source = readFileSync(this.entryPath, 'utf8');
    const nextSource = withInsertedSlide(source, this.entryPath, template, slideId);
    const model = extractModelFromSource(nextSource, this.entryPath);
    const nextIds = (model.slides ?? []).flatMap((slide) => slide.id ? [slide.id] : []);
    if (!nextIds.includes(slideId) || nextIds.length !== this.state.outline.length + 1) {
      throw new Error(`Insert slide refused because the prospective TSX model did not add exactly "${slideId}".`);
    }
    const edit = await this.applyEdits([{
      path: relative(this.projectRoot, this.entryPath), oldText: source, newText: nextSource,
    }], `Add ${template.label.toLowerCase()} slide`);
    this.state.activeSlideId = slideId;
    delete this.state.selection;
    this.touch();
    const validation = await this.validate();
    return { ...edit, templateId: template.id, slideId, validation };
  }

  async undo(): Promise<UndoResult> {
    return this.stepHistory(() => this.checkpoints.undo());
  }

  async redo(): Promise<UndoResult> {
    return this.stepHistory(() => this.checkpoints.redo());
  }

  private stepHistory(step: () => UndoResult): UndoResult {
    const result = step();
    this.state.changedFiles = [];
    delete this.state.acceptanceImproved;
    delete this.state.selection;
    this.syncHistory();
    this.refreshOutline();
    this.markSaved();
    this.touch();
    return result;
  }

  private syncHistory() {
    this.state.undoAvailable = this.checkpoints.available;
    this.state.redoAvailable = this.checkpoints.redoAvailable;
    this.state.history = this.checkpoints.history();
  }

  beginAgentCheckpoint(label = 'Agent edit'): string {
    return this.checkpoints.begin(listSourceFiles(this.projectRoot), label);
  }

  finishAgentCheckpoint() {
    this.state.changedFiles = this.checkpoints.discardIfUnchanged();
    if (this.state.changedFiles.length > 0) delete this.state.selection;
    this.syncHistory();
    this.refreshOutline();
    this.markSaved();
    this.touch();
  }

  setAgentState(update: Partial<StudioState['agent']>) {
    // Remember the session id past the process that owned it, so stopping the
    // agent does not erase what a later connection could resume.
    if (typeof update.sessionId === 'string' && update.sessionId) {
      this.state.agent = { ...this.state.agent, resumeSessionId: update.sessionId };
    }
    if (update.lifecycle === 'error' || update.lifecycle === 'disconnected') this.resolvePendingApproval();
    if (update.lifecycle === 'ready' && this.state.agent.lifecycle === 'running') {
      this.state.agent.transcript = this.state.agent.transcript.map((item) => item.status === 'pending' ? { ...item, status: 'complete' } : item);
    }
    if (update.lifecycle === 'error') {
      this.state.agent.transcript = this.state.agent.transcript.map((item) => item.status === 'pending' ? { ...item, status: 'error' } : item);
    }
    this.state.agent = { ...this.state.agent, ...update };
    this.touch();
  }

  addTranscript(item: StudioState['agent']['transcript'][number]) {
    const items = [...this.state.agent.transcript];
    const previous = items.at(-1);
    if (item.eventId && previous?.eventId === item.eventId && previous.role === item.role && (item.role === 'agent' || item.role === 'system')) {
      items[items.length - 1] = { ...previous, at: item.at, text: `${previous.text}${item.text}`, status: item.status };
    } else if (item.eventId?.startsWith('tool:')) {
      const index = items.findIndex((candidate) => candidate.eventId === item.eventId);
      if (index >= 0) items[index] = { ...items[index], ...item, id: items[index].id };
      else items.push(item);
    } else items.push(item);
    this.state.agent.transcript = items.slice(-100);
    this.touch();
  }

  async clearTranscript() {
    this.state.agent.transcript = [];
    this.touch();
    return this.getState();
  }

  /**
   * Confirms what is already on disk. Edits are written as they are applied, so
   * this verifies and reports rather than flushing anything.
   */
  async save() {
    const validation = await this.validate();
    this.state.persistence = {
      ...this.state.persistence,
      sourceSha256: sha256(readFileSync(this.entryPath, 'utf8')),
    };
    this.touch();
    return {
      path: this.state.entry,
      savedAt: this.state.persistence.lastSavedAt,
      sourceSha256: this.state.persistence.sourceSha256,
      validation,
    };
  }

  /** Steps back to the state just after `checkpointId`, one history entry at a time. */
  async revertTo(checkpointId: string): Promise<UndoResult[]> {
    if (!this.checkpoints.history().some((entry) => entry.id === checkpointId)) {
      throw new Error('That history entry is no longer available.');
    }
    const steps: UndoResult[] = [];
    while (this.checkpoints.history().at(-1)?.id !== checkpointId) {
      steps.push(this.stepHistory(() => this.checkpoints.undo()));
    }
    return steps;
  }

  setAcceptanceImproved(value: boolean) {
    this.state.acceptanceImproved = value;
    this.touch();
  }

  presentationSourceFiles() { return listSourceFiles(this.projectRoot); }

  async startAgent(profileId: string, modelId?: string) {
    const profile = this.state.agents.find((item) => item.id === profileId);
    if (!profile) throw new Error(`Unknown agent profile "${profileId}".`);
    if (profile.availability === 'missing') throw new Error(profile.detail);
    const chosen = modelId ?? (profile.id === this.state.agent.profileId ? this.state.agent.modelId : undefined);
    if (chosen && !profile.modelFlag) throw new Error(`Agent "${profile.label}" does not support choosing a model.`);
    const resumable = this.state.agent.profileId === profileId ? this.state.agent.resumeSessionId : undefined;
    this.setAgentState({ profileId, modelId: chosen, lifecycle: 'connecting', error: undefined });
    await this.acp.start(profile, this.acpMcpServer, chosen, resumable);
    return this.getState();
  }

  /**
   * Picks the model for the next turn. v1 applies it at process start, so an
   * already-running agent is restarted rather than left on the previous model.
   */
  async setModel(modelId: string | undefined, profileId?: string): Promise<StudioState> {
    // A model is normally chosen before connecting, so validate against the
    // profile the author has selected rather than only a running one.
    const target = profileId ?? this.state.agent.profileId;
    const profile = target ? this.state.agents.find((item) => item.id === target) : undefined;
    if (modelId && profile && !profile.modelFlag) {
      throw new Error(`Agent "${profile.label}" does not support choosing a model.`);
    }
    if (modelId && !profile) throw new Error('Choose an agent before choosing a model.');
    if (this.state.agent.modelId === modelId) return this.getState();
    this.setAgentState({ modelId });
    const running = this.state.agent.profileId === profile?.id
      && this.state.agent.lifecycle !== 'disconnected' && this.state.agent.lifecycle !== 'error';
    if (profile && running) {
      await this.acp.stop(false);
      await this.startAgent(profile.id, modelId);
    }
    return this.getState();
  }

  async promptAgent(profileId: string, prompt: string): Promise<PromptResult> {
    const userPrompt = prompt.trim();
    if (!userPrompt) throw new Error('Agent prompt cannot be empty.');
    const baseline = await this.validate();
    this.beginAgentCheckpoint(`Agent: ${userPrompt.slice(0, 60)}`);
    let response: Awaited<ReturnType<AcpManager['prompt']>> | undefined;
    let promptError: unknown;
    try {
      await this.startAgent(profileId, this.state.agent.modelId);
      response = await this.acp.prompt(this.buildPromptContext(userPrompt), userPrompt);
    } catch (error) { promptError = error; }
    this.finishAgentCheckpoint();
    const validation = await this.validate();
    const acceptanceImproved = validation.errorCount < baseline.errorCount
      || (validation.errorCount === baseline.errorCount && validation.warningCount < baseline.warningCount);
    this.setAcceptanceImproved(acceptanceImproved);
    if (promptError) throw promptError;
    return {
      stopReason: response?.stopReason ?? 'end_turn',
      changedFiles: [...this.state.changedFiles],
      validation,
      acceptanceImproved,
    };
  }

  async cancelAgent() {
    this.resolvePendingApproval();
    await this.acp.cancel();
    return this.getState();
  }

  async stopAgent() {
    this.resolvePendingApproval();
    await this.acp.stop();
    return this.getState();
  }

  async respondPermission(requestId: string, optionId: string): Promise<StudioState> {
    const pending = this.state.agent.pendingPermission;
    if (!this.pendingApproval || !pending || this.pendingApproval.id !== requestId) {
      throw new Error('There is no matching pending permission request.');
    }
    if (!pending.options.some((option) => option.optionId === optionId)) {
      throw new Error(`Unknown permission option "${optionId}".`);
    }
    this.resolvePendingApproval(optionId);
    return this.getState();
  }

  async setAutoApprove(value: boolean): Promise<StudioState> {
    this.acp.autoApproveSafe = value;
    this.state.agent = { ...this.state.agent, autoApproveSafe: value };
    this.touch();
    return this.getState();
  }

  async dispose() {
    this.resolvePendingApproval();
    await this.acp.stop(false);
    this.flushSession();
    this.checkpoints.dispose();
  }

  private awaitApproval(request: PendingPermission): Promise<string> {
    this.resolvePendingApproval();
    return new Promise((resolve) => {
      this.pendingApproval = { id: request.id, resolve };
      this.state.agent = { ...this.state.agent, pendingPermission: request };
      this.touch();
    });
  }

  /** Resolves the outstanding approval; with no optionId the request is rejected. */
  private resolvePendingApproval(optionId?: string) {
    const pending = this.pendingApproval;
    if (!pending) return;
    this.pendingApproval = undefined;
    const { pendingPermission: _cleared, ...agent } = this.state.agent;
    this.state.agent = agent;
    this.touch();
    pending.resolve(optionId ?? '');
  }

  private previewForSlide(slideId?: string) {
    if (!this.state.previewUrl) throw new Error('The preview server is not ready.');
    const url = new URL(this.state.previewUrl);
    if (slideId) url.hash = encodeURIComponent(slideId);
    return url.href;
  }

  private readOutline(): SlideOutlineItem[] {
    const model = extractModelFromSource(readFileSync(this.entryPath, 'utf8'), this.entryPath);
    return (model.slides ?? []).flatMap((slide, index) => slide.id ? [{
      id: slide.id,
      title: slide.title?.trim() || slide.label?.trim() || `Slide ${index + 1}`,
      label: slide.label,
      index,
    }] : []);
  }

  private refreshOutline() {
    this.state.outline = this.readOutline();
    if (!this.state.outline.some((slide) => slide.id === this.state.activeSlideId)) this.state.activeSlideId = this.state.outline[0]?.id;
  }

  private buildPromptContext(userPrompt: string): string {
    const diagnostics = this.state.validation.diagnostics.length
      ? this.state.validation.diagnostics.map((item) => `${item.severity} ${item.ruleId}${item.slideId ? ` [${item.slideId}]` : ''}: ${item.message} Fix: ${item.hint}`).join('\n')
      : 'No current validation diagnostics.';
    const selection = this.state.selection ? JSON.stringify(this.state.selection, null, 2) : 'No semantic element is selected.';
    return [
      'OpenPresent local authoring request',
      `Project root: ${this.projectRoot}`,
      `Authoritative deck entry: ${this.entryPath}`,
      `Active slide: ${this.state.activeSlideId ?? 'none'}`,
      `Semantic selection:\n${selection}`,
      `Current diagnostics:\n${diagnostics}`,
      'The starting deck carries no theme of its own, so it renders in the runtime default (near-black with a coral accent). Treat that as a placeholder rather than a design decision: choose a palette and type scale that suit this subject and set them through the deck theme.',
      'Deck Direction guidance: preserve evidence, establish a clear narrative beat, use one coherent accent and type scale, keep logical text at least 18px, choose semantic primitives when they aid validation and freeform TSX when the composition needs it, motivate reveals, honor reduced motion, and never invent metrics.',
      'Compose each slide from the content itself: slides take arbitrary React children, so write the markup and layout the material needs instead of leaving template placeholders in place. Templates are starting points to build on. Use the client-provided OpenPresent MCP tools when available. Keep edits inside the project root and make the smallest source change that satisfies the request. TSX remains authoritative.',
      `User request: ${userPrompt}`,
    ].join('\n\n');
  }

  /** Notifies subscribers so clients can be pushed to instead of polling. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private touch() {
    this.state.revision += 1;
    this.schedulePersist();
    for (const listener of this.listeners) listener();
  }
  /** Only real writes advance the timestamp, so "Saved" always names a write. */
  private markSaved() {
    this.state.persistence = {
      mode: 'autosave',
      lastSavedAt: new Date().toISOString(),
      sourceSha256: sha256(readFileSync(this.entryPath, 'utf8')),
    };
  }
}
