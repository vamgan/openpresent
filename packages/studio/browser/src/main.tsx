import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { AuthoringMessage, StudioState } from '../../src/types';
import type { SlideTemplateRecipe } from '../../src/templates';
import '@fontsource-variable/ibm-plex-sans';
import '@fontsource-variable/jetbrains-mono';
import { AgentPicker } from './AgentPicker';
import { ChatThread, type PromptSeed } from './ChatThread';
import { ResizeHandle } from './ResizeHandle';
import { StartScreen } from './StartScreen';
import { TemplatePreview, relativeTime, type LibraryEntry } from './studio-shared';
import './studio.css';

interface BootConfig { version: 1; token: string; studioUrl: string; previewUrl: string }
declare global { interface Window { __OPENPRESENT_BOOT__?: BootConfig } }

function readBoot(): BootConfig {
  const value = window.__OPENPRESENT_BOOT__;
  if (!value) throw new Error('OpenPresent Studio boot configuration is missing.');
  return value;
}

const boot = readBoot();

/** Remembered panel sizes, clamped so a stale value can never strand a column. */
function readLayout(key: 'rail' | 'panel', fallback: number): number {
  const stored = Number(localStorage.getItem(`openpresent.layout.${key}`));
  if (!Number.isFinite(stored) || stored <= 0) return fallback;
  return key === 'rail' ? Math.min(420, Math.max(168, stored)) : Math.min(720, Math.max(300, stored));
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...(init?.method && init.method !== 'GET' ? { authorization: `Bearer ${boot.token}` } : {}),
      ...init?.headers,
    },
  });
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? `Studio request failed with HTTP ${response.status}.`);
  return data;
}

function post<T>(path: string, body: unknown = {}) { return api<T>(path, { method: 'POST', body: JSON.stringify(body) }); }

/** A dropped connection means Studio is restarting, not that the action was wrong. */
function isOffline(reason: unknown): boolean {
  return reason instanceof TypeError || (reason instanceof Error && /failed to fetch|networkerror|load failed/i.test(reason.message));
}

function validationLabel(state: StudioState) {
  if (state.validation.lifecycle === 'validating') return 'Validating';
  if (state.validation.lifecycle === 'clean') return 'Clean';
  if (state.validation.lifecycle === 'issues') return `${state.validation.errorCount} errors, ${state.validation.warningCount} warnings`;
  if (state.validation.lifecycle === 'error') return 'Validation failed';
  return 'Not validated';
}

function agentLabel(state: StudioState) {
  if (state.agent.lifecycle === 'connecting') return 'Connecting';
  if (state.agent.lifecycle === 'running') return 'Working';
  if (state.agent.lifecycle === 'cancelling') return 'Stopping';
  if (state.agent.lifecycle === 'ready') return 'Ready';
  if (state.agent.lifecycle === 'error') return 'Needs attention';
  return 'Not connected';
}

/**
 * Reads the preview origin from live state, not boot config: switching
 * presentations stands up a new preview server on a new port.
 */
function previewUrlFor(base: string, slideId: string, thumbnail = false, print = false) {
  const url = new URL(base || boot.previewUrl);
  if (thumbnail) url.searchParams.set('openpresentThumbnail', '1');
  if (print) url.searchParams.set('openpresentPrint', '1');
  url.hash = encodeURIComponent(slideId);
  return url.href;
}

function App() {
  const [state, setState] = useState<StudioState>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [promptSeed, setPromptSeed] = useState<PromptSeed>();
  const [selectedAgent, setSelectedAgent] = useState('');
  const [startPrompt, setStartPrompt] = useState('');
  const [newName, setNewName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string>();
  const [busy, setBusy] = useState<string>();
  // Survive a reload so refreshing mid-edit returns to the workspace.
  const [entered, setEntered] = useState(() => sessionStorage.getItem('openpresent.entered') === '1');
  const [copied, setCopied] = useState<string>();
  const [templates, setTemplates] = useState<readonly SlideTemplateRecipe[]>([]);
  const [library, setLibrary] = useState<LibraryEntry[]>([]);
  const [openPath, setOpenPath] = useState('');
  const [documentsRoot, setDocumentsRoot] = useState('');
  const [showTemplates, setShowTemplates] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [offline, setOffline] = useState(false);
  const [railWidth, setRailWidth] = useState(() => readLayout('rail', 224));
  const [panelWidth, setPanelWidth] = useState(() => readLayout('panel', 356));
  const [railHidden, setRailHidden] = useState(() => localStorage.getItem('openpresent.railHidden') === '1');
  const frame = useRef<HTMLIFrameElement>(null);
  const desiredSlide = useRef<string | undefined>(undefined);
  const previewBase = state?.previewUrl || boot.previewUrl;
  const previewOrigin = useMemo(() => new URL(previewBase).origin, [previewBase]);
  const authoringUrl = useMemo(() => {
    const url = new URL(previewBase);
    url.searchParams.set('openpresentAuthoring', '1');
    url.searchParams.set('openpresentStudioOrigin', boot.studioUrl);
    return url.href;
  }, [previewBase]);

  const refresh = useCallback(async (quiet = false) => {
    try {
      setState(await api<StudioState>('/api/state'));
      setOffline(false);
    } catch (reason) {
      if (isOffline(reason)) setOffline(true);
      else if (!quiet) setError(reason instanceof Error ? reason.message : String(reason));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void refresh();
    const source = new EventSource('/api/events');
    source.onmessage = (event) => {
      setState(JSON.parse(event.data) as StudioState);
      setLoading(false);
      setOffline(false);
    };
    // EventSource reconnects on its own; surface it as a state, not a failure.
    source.onerror = () => setOffline(true);
    source.onopen = () => setOffline(false);
    // Covers a stream that stays up but stops delivering, and drives recovery
    // while the server is restarting.
    const safetyNet = window.setInterval(() => void refresh(true), 4_000);
    return () => { source.close(); window.clearInterval(safetyNet); };
  }, [refresh]);

  useEffect(() => { sessionStorage.setItem('openpresent.entered', entered ? '1' : '0'); }, [entered]);
  useEffect(() => { localStorage.setItem('openpresent.layout.rail', String(railWidth)); }, [railWidth]);
  useEffect(() => { localStorage.setItem('openpresent.layout.panel', String(panelWidth)); }, [panelWidth]);
  useEffect(() => { localStorage.setItem('openpresent.railHidden', railHidden ? '1' : '0'); }, [railHidden]);

  // Prefer the connector this presentation was last using; only fall back to
  // whatever is installed when it has never been opened with one.
  useEffect(() => {
    if (!state || selectedAgent) return;
    const remembered = state.agent.profileId
      ? state.agents.find((agent) => agent.id === state.agent.profileId && agent.availability !== 'missing')
      : undefined;
    const available = remembered
      ?? state.agents.find((agent) => agent.availability === 'ready')
      ?? state.agents.find((agent) => agent.availability !== 'missing');
    if (available) setSelectedAgent(available.id);
  }, [selectedAgent, state]);

  // Switching presentations swaps in that document's remembered connector.
  const openedPath = state?.projectRoot;
  const lastDocument = useRef(openedPath);
  useEffect(() => {
    if (!state || openedPath === lastDocument.current) return;
    lastDocument.current = openedPath;
    connectAttempt.current = undefined;
    setSelectedAgent(state.agent.profileId ?? '');
  }, [openedPath, state]);

  // Connect as soon as a profile is chosen so the first prompt is not the thing
  // that pays for process startup. Only profiles that are actually installed are
  // worth starting, and a failure here is reported through the agent status
  // rather than the error banner — nobody asked for this connection, so it must
  // not interrupt the workspace on open.
  const connectAttempt = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!entered || !selectedAgent || !state) return;
    if (state.agent.lifecycle !== 'disconnected' || connectAttempt.current === selectedAgent) return;
    if (state.agents.find((agent) => agent.id === selectedAgent)?.availability !== 'ready') return;
    connectAttempt.current = selectedAgent;
    void post('/api/agent/start', { profileId: selectedAgent })
      .catch(() => undefined)
      .then(() => refresh(true));
  }, [entered, refresh, selectedAgent, state]);

  useEffect(() => {
    let cancelled = false;
    api<readonly SlideTemplateRecipe[]>('/api/templates')
      .then((value) => { if (!cancelled) setTemplates(value); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const refreshLibrary = useCallback(async () => {
    try {
      const value = await api<{ entries: LibraryEntry[]; openPath: string; documentsRoot: string }>('/api/library');
      setLibrary(value.entries);
      setOpenPath(value.openPath);
      setDocumentsRoot(value.documentsRoot);
    } catch { /* the library is a convenience; a failure must not block authoring */ }
  }, []);

  useEffect(() => { if (!entered) void refreshLibrary(); }, [entered, refreshLibrary]);

  useEffect(() => {
    const onMessage = (event: MessageEvent<AuthoringMessage>) => {
      if (event.origin !== previewOrigin || event.source !== frame.current?.contentWindow || !event.data || event.data.version !== 1) return;
      if (event.data.type === 'openpresent.selection') void post('/api/selection', { selection: event.data }).then(() => refresh(true));
      if (event.data.type === 'openpresent.navigation') {
        if (desiredSlide.current && desiredSlide.current !== event.data.slideId) {
          frame.current?.contentWindow?.postMessage({ version: 1, type: 'openpresent.navigate', slideId: desiredSlide.current }, previewOrigin);
          return;
        }
        if (desiredSlide.current === event.data.slideId) desiredSlide.current = undefined;
        void post('/api/navigate', { slideId: event.data.slideId }).then(() => refresh(true));
      }
      if (event.data.type === 'openpresent.replace-text') {
        void post('/api/selection/replace', { text: event.data.text }).then(() => refresh(true)).catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)));
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [previewOrigin, refresh]);

  useEffect(() => {
    if (state?.activeSlideId) frame.current?.contentWindow?.postMessage({ version: 1, type: 'openpresent.navigate', slideId: state.activeSlideId }, previewOrigin);
  }, [previewOrigin, state?.activeSlideId]);

  useEffect(() => {
    if (state && !state.selection) frame.current?.contentWindow?.postMessage({ version: 1, type: 'openpresent.clear-selection' }, previewOrigin);
  }, [previewOrigin, state?.selection]);

  const mutate = useCallback(async (label: string, operation: () => Promise<unknown>) => {
    setError(undefined); setNotice(undefined); setBusy(label);
    try { await operation(); await refresh(); }
    catch (reason) {
      if (isOffline(reason)) setOffline(true);
      else setError(reason instanceof Error ? reason.message : String(reason));
    }
    finally { setBusy(undefined); }
  }, [refresh]);

  const navigateTo = async (slideId: string) => {
    desiredSlide.current = slideId;
    await post('/api/navigate', { slideId });
    frame.current?.contentWindow?.postMessage({ version: 1, type: 'openpresent.navigate', slideId }, previewOrigin);
  };

  const sendAgentPrompt = useCallback(async (prompt: string) => {
    if (!selectedAgent) return;
    await mutate('Sending prompt', () => post('/api/agent/prompt', { profileId: selectedAgent, prompt }));
  }, [mutate, selectedAgent]);

  const cancelAgentPrompt = useCallback(async () => {
    await mutate('Stopping', () => post('/api/agent/cancel'));
  }, [mutate]);

  const clearAgentTranscript = useCallback(async () => {
    await mutate('Clearing activity', () => post('/api/agent/transcript/clear'));
  }, [mutate]);

  const copyCommand = async (label: string, command: string) => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(label);
      window.setTimeout(() => setCopied((current) => current === label ? undefined : current), 1800);
    } catch { setError('The command could not be copied. Select the command text and copy it manually.'); }
  };

  const openTemplateLibrary = async () => {
    setError(undefined);
    try {
      if (templates.length === 0) setTemplates(await api<readonly SlideTemplateRecipe[]>('/api/templates'));
      setShowTemplates(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  };

  const openPresentation = async (entry: LibraryEntry) => {
    await mutate('Opening presentation', async () => {
      await post('/api/library/open', { id: entry.id });
      connectAttempt.current = undefined;
      await refresh();
      setEntered(true);
    });
  };

  const forgetPresentation = async (id: string) => {
    await mutate('Removing from list', async () => {
      const result = await post<{ entries: LibraryEntry[] }>('/api/library/forget', { id });
      setLibrary(result.entries);
    });
  };

  const startFromTemplate = async (templateId: string) => {
    await mutate('Creating presentation', async () => {
      await post('/api/library/create', { name: newName.trim() || 'Presentation', templateId });
      connectAttempt.current = undefined;
      await refresh();
      await refreshLibrary();
      setEntered(true);
    });
  };

  const startFromPrompt = async () => {
    const value = startPrompt.trim();
    if (!value || !state) return;
    let created = false;
    await mutate('Creating presentation', async () => {
      await post('/api/library/create', { name: newName.trim() || value.slice(0, 40) });
      connectAttempt.current = undefined;
      await refresh();
      await refreshLibrary();
      created = true;
      setEntered(true);
    });
    if (!created) return;
    const profile = state.agents.find((agent) => agent.id === selectedAgent && agent.availability !== 'missing');
    if (profile) {
      setSelectedAgent(profile.id);
      await mutate('Sending prompt', () => post('/api/agent/prompt', {
        profileId: profile.id,
        prompt: `Create this presentation from scratch in the current deck: ${value}`,
      }));
    } else {
      setPromptSeed({ id: Date.now(), value });
      setNotice('Choose an installed agent to build the deck. Your brief is waiting in the chat panel.');
    }
  };

  const respondPermission = useCallback(async (requestId: string, optionId: string) => {
    await mutate('Responding', () => post('/api/agent/permission', { requestId, optionId }));
  }, [mutate]);

  const selectModel = useCallback(async (modelId: string) => {
    await mutate('Switching model', () => post('/api/agent/model', { modelId, profileId: selectedAgent }));
  }, [mutate, selectedAgent]);

  const setAutoApprove = useCallback(async (value: boolean) => {
    await mutate('Updating approvals', () => post('/api/agent/approvals', { autoApproveSafe: value }));
  }, [mutate]);

  const stopLaunch = useCallback(async () => {
    await mutate('Stopping launch', () => post('/api/agent/stop'));
  }, [mutate]);

  /** Builds one self-contained file and lets the author choose where it lands. */
  const saveHtmlExport = () => mutate('Building HTML', async () => {
    const built = await post<{ html: string; filename: string }>('/api/export/html');
    const blob = new Blob([built.html], { type: 'text/html;charset=utf-8' });
    const picker = (window as unknown as {
      showSaveFilePicker?: (options: unknown) => Promise<{ createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }> }>;
    }).showSaveFilePicker;
    if (picker) {
      let handle;
      try {
        handle = await picker({
          suggestedName: built.filename,
          types: [{ description: 'HTML presentation', accept: { 'text/html': ['.html'] } }],
        });
      } catch { return; } // the author dismissed the picker
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      setNotice(`Saved ${built.filename}`);
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = built.filename;
    link.click();
    URL.revokeObjectURL(url);
    setNotice(`Downloaded ${built.filename}`);
  });

  const undoDocument = () => void mutate('Undoing', async () => {
    const result = await post<{ label?: string }>('/api/undo');
    setNotice(result.label ? `Undid ${result.label.toLowerCase()}` : 'Undid the last change');
  });
  const redoDocument = () => void mutate('Redoing', async () => {
    const result = await post<{ label?: string }>('/api/redo');
    setNotice(result.label ? `Redid ${result.label.toLowerCase()}` : 'Redid the last change');
  });
  const revertToEntry = (checkpointId: string, label: string) => mutate('Reverting', async () => {
    const steps = await post<unknown[]>('/api/history/revert', { checkpointId });
    setNotice(steps.length === 0 ? `Already at ${label.toLowerCase()}` : `Went back to ${label.toLowerCase()}`);
  });
  const validateDocument = () => void mutate('Validating', () => post('/api/validate', { browser: false }));

  if (loading) return <main className="studio-center-state" aria-live="polite"><span className="pulse" />Opening Studio</main>;
  if (!state) return <main className="studio-center-state is-error" role="alert">{error ?? 'Studio is unavailable.'}</main>;

  const connecting = state.agent.lifecycle === 'connecting';
  const working = state.agent.lifecycle === 'running' || state.agent.lifecycle === 'cancelling';
  const activeSlide = state.outline.find((slide) => slide.id === state.activeSlideId);
  const selectionComponent = state.selection?.ownerComponent ?? state.selection?.component;
  const lastChange = state.history.at(-1)?.label;

  if (!entered) return (
    <StartScreen
      state={state}
      library={library}
      openPath={openPath}
      documentsRoot={documentsRoot}
      templates={templates}
      agents={state.agents}
      selectedAgent={selectedAgent}
      onSelectAgent={setSelectedAgent}
      newName={newName}
      onNewName={setNewName}
      startPrompt={startPrompt}
      onStartPrompt={setStartPrompt}
      busy={busy}
      copied={copied}
      onContinue={() => setEntered(true)}
      onOpen={(entry) => void openPresentation(entry)}
      onForget={(id) => void forgetPresentation(id)}
      onCreateWithPrompt={() => void startFromPrompt()}
      onCreateFromTemplate={(templateId) => void startFromTemplate(templateId)}
      onCopyCommand={(label, command) => void copyCommand(label, command)}
    />
  );

  return (
    <div
      className={`studio-shell${railHidden ? ' is-rail-hidden' : ''}`}
      style={{ '--rail-width': `${railWidth}px`, '--panel-width': `${panelWidth}px` } as React.CSSProperties}
    >
      <header className="studio-topbar">
        <button
          type="button"
          className="brand"
          onClick={() => { setEntered(false); void refreshLibrary(); }}
          title="Close this presentation and show all presentations"
        ><i aria-hidden="true" />OpenPresent <span>Studio</span></button>
        <button
          type="button"
          className="rail-toggle"
          aria-pressed={!railHidden}
          onClick={() => setRailHidden((hidden) => !hidden)}
          title={railHidden ? 'Show slides' : 'Hide slides'}
        ><i aria-hidden="true" /><span>{railHidden ? 'Show slides' : 'Hide slides'}</span></button>
        <div className="topbar-context"><span>{state.entry}</span><span>{String(state.outline.length).padStart(2, '0')} slides</span></div>
        <div className="topbar-actions">
          <span className={`validation-status is-${state.validation.lifecycle}`} aria-live="polite"><i />{validationLabel(state)}</span>
          <span className="persistence-status" title={`Written to ${state.entry} at ${new Date(state.persistence.lastSavedAt).toLocaleString()}`}>Saved {relativeTime(state.persistence.lastSavedAt)}</span>
          <button type="button" className="button quiet" disabled={!state.undoAvailable || Boolean(busy)} onClick={undoDocument} title={lastChange ? `Undo ${lastChange}` : 'Undo'}>Undo</button>
          <button type="button" className="button quiet" disabled={!state.redoAvailable || Boolean(busy)} onClick={redoDocument}>Redo</button>
          <details className="history-menu" name="studio-topbar-menu">
            <summary className="button quiet">History</summary>
            <div>
              {state.history.length === 0 && <small>No changes yet in this session.</small>}
              {[...state.history].reverse().map((entry) => (
                <button key={entry.id} type="button" disabled={Boolean(busy)} onClick={() => void revertToEntry(entry.id, entry.label)}>
                  <span>{entry.label}</span><small>{relativeTime(entry.createdAt)}</small>
                </button>
              ))}
              {state.history.length > 0 && <small>Choose a change to return the deck to that point.</small>}
            </div>
          </details>
          <button type="button" className="button quiet" disabled={Boolean(busy)} onClick={validateDocument}>Validate</button>
          <details className="compact-actions" name="studio-topbar-menu">
            <summary className="button" role="button" aria-label="Document actions" aria-haspopup="true">Actions</summary>
            <div className="compact-actions-menu" role="group" aria-label="Compact document actions">
              <div className="compact-document-status" role="status" aria-label="Document status">
                <span className={`validation-status is-${state.validation.lifecycle}`}><i />{validationLabel(state)}</span>
                <span className="persistence-status">Saved {relativeTime(state.persistence.lastSavedAt)}</span>
              </div>
              <button type="button" disabled={!state.undoAvailable || Boolean(busy)} onClick={undoDocument}>Undo</button>
              <button type="button" disabled={!state.redoAvailable || Boolean(busy)} onClick={redoDocument}>Redo</button>
              <button type="button" disabled={Boolean(busy)} onClick={validateDocument}>Validate</button>
            </div>
          </details>
          <details className="export-menu" name="studio-topbar-menu">
            <summary className="button">Export</summary>
            <div>
              <button type="button" disabled={Boolean(busy)} onClick={() => void saveHtmlExport()}>Save as HTML…</button>
              <a href={previewUrlFor(previewBase, state.activeSlideId ?? '', false, true)} target="_blank" rel="noreferrer">Open print view</a>
              <small>HTML export is a single self-contained file.</small>
            </div>
          </details>
          <button type="button" className="button primary" onClick={() => window.open(previewUrlFor(previewBase, state.activeSlideId ?? ''), '_blank', 'noopener')}>Present</button>
        </div>
      </header>

      <aside className="slide-rail" aria-label="Slides">
        <div className="rail-heading"><span>Slides</span><small>{String(state.outline.length).padStart(2, '0')}</small></div>
        <ol>
          {state.outline.map((slide) => (
            <li key={slide.id}>
              <button
                type="button"
                className={slide.id === state.activeSlideId ? 'is-active' : undefined}
                aria-current={slide.id === state.activeSlideId ? 'page' : undefined}
                onClick={() => void mutate('Navigating', () => navigateTo(slide.id))}
              >
                <span className="thumbnail"><iframe src={previewUrlFor(previewBase, slide.id, true)} title={`${slide.title} slide preview`} loading="lazy" tabIndex={-1} aria-hidden="true" /><span className="thumbnail-hit" aria-hidden="true" /></span>
                <span className="slide-caption"><span className="slide-number">{String(slide.index + 1).padStart(2, '0')}</span><span className="slide-title">{slide.title}</span></span>
              </button>
            </li>
          ))}
        </ol>
        <button type="button" className="new-slide" onClick={() => void openTemplateLibrary()}>+ New slide</button>
      </aside>

      {!railHidden && (
        <ResizeHandle
          edge="left"
          label="Resize the slide list"
          width={railWidth}
          min={168}
          max={420}
          onResize={setRailWidth}
        />
      )}
      <ResizeHandle
        edge="right"
        label="Resize the agent panel"
        width={panelWidth}
        min={300}
        max={720}
        onResize={setPanelWidth}
      />

      <main className="canvas-region">
        <div className="canvas-toolbar">
          <span><b>{activeSlide?.title ?? 'No active slide'}</b>{state.activeSlideId ? ` / ${state.activeSlideId}` : ''}</span>
          <span className="canvas-hint">Double-click text to edit</span>
          {confirmDelete === state.activeSlideId ? (
            <span className="delete-confirm" role="group" aria-label="Confirm slide deletion">
              Delete this slide?
              <button type="button" onClick={() => setConfirmDelete(undefined)}>Keep</button>
              <button type="button" className="danger" onClick={() => void mutate('Deleting slide', async () => { await post('/api/slide/delete', { slideId: state.activeSlideId }); setConfirmDelete(undefined); })}>Delete</button>
            </span>
          ) : <button type="button" className="text-action" disabled={state.outline.length <= 1} onClick={() => setConfirmDelete(state.activeSlideId)}>Delete slide</button>}
        </div>
        <div className="stage-well">
          <iframe ref={frame} title="Live OpenPresent deck" src={authoringUrl} allow="fullscreen" />
        </div>
        <footer className="selection-strip" aria-live="polite">
          {state.selection ? <>
            <span className="selection-type">{state.selection.ownerComponent ?? state.selection.component}</span>
            <span className="selection-copy">{state.selection.text || state.selection.breadcrumb}</span>
            <span className="selection-bounds">{Math.round(state.selection.bounds.width)} × {Math.round(state.selection.bounds.height)}</span>
            <button type="button" onClick={() => void mutate('Clearing selection', () => post('/api/selection/clear'))} aria-label="Clear selection">Clear</button>
          </> : <><span className="selection-type is-empty">No selection</span><span className="selection-copy">Click a text element or freeform element in the slide.</span></>}
        </footer>
      </main>

      <aside className="agent-panel" aria-label="AI authoring panel">
        <ChatThread
          agent={state.agent}
          agents={state.agents}
          selectedAgent={selectedAgent}
          onSelectAgent={setSelectedAgent}
          busy={busy}
          connecting={connecting}
          working={working}
          statusLabel={agentLabel(state)}
          activeSlideId={state.activeSlideId}
          selectionComponent={selectionComponent}
          selectionTag={state.selection?.tag}
          promptSeed={promptSeed}
          onSend={sendAgentPrompt}
          onCancel={cancelAgentPrompt}
          onClear={clearAgentTranscript}
          onStopLaunch={stopLaunch}
          onSelectModel={selectModel}
          onPermission={respondPermission}
          onAutoApprove={setAutoApprove}
        />
        {error && <div className="error-banner" role="alert"><strong>Action failed</strong><span>{error}</span><button type="button" onClick={() => setError(undefined)}>Dismiss</button></div>}
      </aside>
      {offline && <div className="reconnect-notice" role="status"><span className="pulse" />Reconnecting to Studio</div>}
      {notice && <div className="operation-notice" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice(undefined)}>Dismiss</button></div>}
      {showTemplates && <div className="template-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowTemplates(false); }}>
        <section className="template-library" role="dialog" aria-modal="true" aria-labelledby="template-title">
          <header><div><h2 id="template-title">New slide</h2><p>Recipes are concrete TSX starting points. Deck skills remain separate design direction.</p></div><button type="button" onClick={() => setShowTemplates(false)} aria-label="Close template library">Close</button></header>
          <div>{templates.map((template) => <button type="button" key={template.id} onClick={() => void mutate('Adding slide', async () => { const result = await post<{ slideId: string }>('/api/slide/insert', { templateId: template.id }); await navigateTo(result.slideId); setShowTemplates(false); })}><TemplatePreview template={template} /><span>{template.label}</span><small>{template.description}</small></button>)}</div>
        </section>
      </div>}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
