import { assertLoopbackUrl } from './security';
import type { CaptureResult, DeleteSlideResult, EditResult, GuardedEdit, InsertSlideResult, NewDeckResult, SaveResult, SelectedTextEditResult, SemanticSelection, SlideOutlineItem, StudioOperations, StudioState, UndoResult } from './types';
import type { SlideTemplateRecipe } from './templates';
import type { ValidationResult } from '@openpresent/validator';

export interface StudioClientOptions { url: string; token: string }

export function connectStudio(options: StudioClientOptions): StudioOperations {
  const base = assertLoopbackUrl(options.url);
  const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const response = await fetch(new URL(path, base), {
      ...init,
      headers: {
        ...(init?.body ? { 'content-type': 'application/json' } : {}),
        ...(init?.method && init.method !== 'GET' ? { authorization: `Bearer ${options.token}` } : {}),
        ...init?.headers,
      },
    });
    const payload = await response.json() as { error?: string } & T;
    if (!response.ok) throw new Error(payload.error ?? `Studio request failed with HTTP ${response.status}.`);
    return payload;
  };
  const post = <T>(path: string, body: unknown = {}) => request<T>(path, { method: 'POST', body: JSON.stringify(body) });
  return {
    getState: () => request<StudioState>('/api/state'),
    getOutline: () => request<SlideOutlineItem[]>('/api/outline'),
    getSelection: async () => (await request<SemanticSelection | null>('/api/selection')) ?? undefined,
    listSlideTemplates: () => request<readonly SlideTemplateRecipe[]>('/api/templates'),
    open: (openBrowser = false) => post('/api/open', { openBrowser }),
    navigate: (slideId) => post<StudioState>('/api/navigate', { slideId }),
    validate: (validationOptions = {}) => post<ValidationResult>('/api/validate', validationOptions),
    capture: (slideId) => post<CaptureResult>('/api/capture', { slideId }),
    applyEdits: (edits: GuardedEdit[]) => post<EditResult>('/api/edit', { edits }),
    replaceSelectedText: (text: string) => post<SelectedTextEditResult>('/api/selection/replace', { text }),
    deleteSlide: (slideId: string) => post<DeleteSlideResult>('/api/slide/delete', { slideId }),
    insertSlide: (templateId: string) => post<InsertSlideResult>('/api/slide/insert', { templateId }),
    newDeck: (templateId?: string) => post<NewDeckResult>('/api/deck/new', templateId ? { templateId } : {}),
    save: () => post<SaveResult>('/api/save'),
    undo: () => post<UndoResult>('/api/undo'),
    redo: () => post<UndoResult>('/api/redo'),
    revertTo: (checkpointId: string) => post<UndoResult[]>('/api/history/revert', { checkpointId }),
  };
}
