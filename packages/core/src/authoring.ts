import { useEffect, useRef, type RefObject } from 'react';

export const AUTHORING_PROTOCOL_VERSION = 1 as const;

export interface AuthoringBounds { x: number; y: number; width: number; height: number }
export interface AuthoringSelectionMessage {
  version: typeof AUTHORING_PROTOCOL_VERSION;
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
  bounds: AuthoringBounds;
}
export interface AuthoringNavigationMessage {
  version: typeof AUTHORING_PROTOCOL_VERSION;
  type: 'openpresent.navigation';
  slideId: string;
}
export interface AuthoringTextEditMessage {
  version: typeof AUTHORING_PROTOCOL_VERSION;
  type: 'openpresent.replace-text';
  slideId: string;
  text: string;
}
export type AuthoringOutboundMessage = AuthoringSelectionMessage | AuthoringNavigationMessage | AuthoringTextEditMessage;
export type AuthoringInboundMessage =
  | { version: typeof AUTHORING_PROTOCOL_VERSION; type: 'openpresent.navigate'; slideId: string }
  | { version: typeof AUTHORING_PROTOCOL_VERSION; type: 'openpresent.clear-selection' };

export interface AuthoringModeOptions { targetOrigin?: string }
export type AuthoringMode = boolean | AuthoringModeOptions;

export interface ResolvedAuthoring { enabled: boolean; targetOrigin?: string }

function isLoopbackOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && ['127.0.0.1', 'localhost', '::1'].includes(url.hostname);
  } catch { return false; }
}

export function resolveAuthoringMode(input?: AuthoringMode): ResolvedAuthoring {
  if (typeof window === 'undefined') return { enabled: Boolean(input) };
  const params = new URLSearchParams(window.location.search);
  const requested = input === true || typeof input === 'object' || params.get('openpresentAuthoring') === '1';
  const targetOrigin = typeof input === 'object' ? input.targetOrigin : params.get('openpresentStudioOrigin') ?? undefined;
  return { enabled: requested && Boolean(targetOrigin && isLoopbackOrigin(targetOrigin)), targetOrigin };
}

function compact(value: string, limit: number) { return value.replace(/\s+/g, ' ').trim().slice(0, limit); }

function breadcrumb(element: Element, slide: Element): string {
  const parts: string[] = [];
  let current: Element | null = element;
  while (current && current !== slide && parts.length < 5) {
    const id = current.id ? `#${current.id}` : '';
    const classes = [...current.classList].filter((name) => !name.startsWith('op-authoring-')).slice(0, 2).map((name) => `.${name}`).join('');
    parts.unshift(`${current.tagName.toLowerCase()}${id}${classes}`);
    current = current.parentElement;
  }
  return compact(parts.join(' > '), 420);
}

interface SelectableTarget {
  element: HTMLElement | SVGElement;
  owner?: HTMLElement | SVGElement;
}

function selectableElement(target: Element, root: HTMLElement): SelectableTarget | undefined {
  if (target.closest('[data-openpresent-runtime-control]')) return;
  const slide = target.closest<HTMLElement>('[data-openpresent-slide]');
  if (!slide || !root.contains(slide)) return;
  const primitive = target.closest<HTMLElement | SVGElement>('[data-openpresent-component]:not([data-openpresent-component="Slide"])');
  return {
    element: target as HTMLElement | SVGElement,
    owner: primitive && slide.contains(primitive) ? primitive : undefined,
  };
}

function selectionMessage(target: SelectableTarget, slideId: string): AuthoringSelectionMessage {
  const { element, owner } = target;
  const stage = element.closest<HTMLElement>('.op-stage');
  const slide = element.closest<HTMLElement>('[data-openpresent-slide]')!;
  const rect = element.getBoundingClientRect();
  const stageRect = stage?.getBoundingClientRect() ?? { left: 0, top: 0, width: 1600, height: 900 };
  const scaleX = stageRect.width / 1600 || 1;
  const scaleY = stageRect.height / 900 || 1;
  return {
    version: AUTHORING_PROTOCOL_VERSION,
    type: 'openpresent.selection',
    slideId,
    component: owner?.getAttribute('data-openpresent-component') || element.tagName.toLowerCase(),
    ownerComponent: owner?.getAttribute('data-openpresent-component') ?? undefined,
    ownerBreadcrumb: owner ? breadcrumb(owner, slide) : undefined,
    editable: element instanceof HTMLElement && element.children.length === 0 && Boolean(compact(element.textContent ?? '', 320)),
    tag: element.tagName.toLowerCase(),
    text: compact(element.textContent ?? '', 320),
    breadcrumb: breadcrumb(element, slide),
    snippet: compact(element.outerHTML, 700),
    bounds: {
      x: Math.round(((rect.left - stageRect.left) / scaleX) * 100) / 100,
      y: Math.round(((rect.top - stageRect.top) / scaleY) * 100) / 100,
      width: Math.round((rect.width / scaleX) * 100) / 100,
      height: Math.round((rect.height / scaleY) * 100) / 100,
    },
  };
}

export function postAuthoringMessage(config: ResolvedAuthoring, message: AuthoringOutboundMessage) {
  if (!config.enabled || !config.targetOrigin || window.parent === window) return;
  window.parent.postMessage(message, config.targetOrigin);
}

export function useAuthoringBridge(
  rootRef: RefObject<HTMLElement | null>,
  slideId: string,
  config: ResolvedAuthoring,
  navigate: (slideId: string) => void,
) {
  const hovered = useRef<Element | undefined>(undefined);
  const selected = useRef<Element | undefined>(undefined);
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !config.enabled || !config.targetOrigin) return;
    root.dataset.openpresentAuthoring = 'true';
    let selectedTabIndex: string | null | undefined;
    let editing: { element: HTMLElement; original: string } | undefined;
    const finishEditing = (commit: boolean) => {
      const current = editing;
      if (!current) return;
      editing = undefined;
      const next = compact(current.element.textContent ?? '', 320);
      if (!commit || !next) current.element.textContent = current.original;
      current.element.removeAttribute('contenteditable');
      current.element.classList.remove('op-authoring-editing');
      current.element.focus({ preventScroll: true });
      if (commit && next && next !== current.original) {
        postAuthoringMessage(config, { version: AUTHORING_PROTOCOL_VERSION, type: 'openpresent.replace-text', slideId, text: next });
      }
    };
    const beginEditing = (element: Element | undefined) => {
      if (!(element instanceof HTMLElement) || element.children.length > 0 || !compact(element.textContent ?? '', 320)) return;
      finishEditing(false);
      editing = { element, original: compact(element.textContent ?? '', 320) };
      element.setAttribute('contenteditable', 'plaintext-only');
      element.classList.add('op-authoring-editing');
      element.focus({ preventScroll: true });
      const selection = window.getSelection();
      selection?.selectAllChildren(element);
      selection?.collapseToEnd();
    };
    const clearHover = () => {
      hovered.current?.classList.remove('op-authoring-hover');
      hovered.current = undefined;
    };
    const clearSelection = () => {
      finishEditing(false);
      if (selected.current instanceof HTMLElement) {
        if (selectedTabIndex === null) selected.current.removeAttribute('tabindex');
        else if (selectedTabIndex !== undefined) selected.current.setAttribute('tabindex', selectedTabIndex);
      }
      selected.current?.classList.remove('op-authoring-selected');
      selected.current = undefined;
      selectedTabIndex = undefined;
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target instanceof Element ? selectableElement(event.target, root) : undefined;
      if (target?.element === hovered.current) return;
      clearHover();
      if (target) { hovered.current = target.element; target.element.classList.add('op-authoring-hover'); }
    };
    const onLeave = () => clearHover();
    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? selectableElement(event.target, root) : undefined;
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      clearSelection();
      selected.current = target.element;
      target.element.classList.add('op-authoring-selected');
      if (target.element instanceof HTMLElement) {
        selectedTabIndex = target.element.getAttribute('tabindex');
        target.element.tabIndex = 0;
        target.element.focus({ preventScroll: true });
      }
      postAuthoringMessage(config, selectionMessage(target, slideId));
    };
    const onDoubleClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? selectableElement(event.target, root) : undefined;
      if (!target || target.element !== selected.current) return;
      event.preventDefault(); event.stopPropagation(); beginEditing(target.element);
    };
    const onKey = (event: KeyboardEvent) => {
      if (editing) {
        if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); finishEditing(true); }
        else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finishEditing(false); }
        return;
      }
      if (event.key === 'Enter' && selected.current) { event.preventDefault(); event.stopPropagation(); beginEditing(selected.current); }
    };
    const onFocusOut = (event: FocusEvent) => {
      if (editing?.element === event.target) finishEditing(true);
    };
    const onMessage = (event: MessageEvent<AuthoringInboundMessage>) => {
      if (event.origin !== config.targetOrigin || event.source !== window.parent || event.data?.version !== AUTHORING_PROTOCOL_VERSION) return;
      if (event.data.type === 'openpresent.navigate') navigate(event.data.slideId);
      if (event.data.type === 'openpresent.clear-selection') clearSelection();
    };
    root.addEventListener('pointerover', onPointer);
    root.addEventListener('pointerleave', onLeave);
    root.addEventListener('click', onClick, true);
    root.addEventListener('dblclick', onDoubleClick, true);
    root.addEventListener('keydown', onKey, true);
    root.addEventListener('focusout', onFocusOut, true);
    window.addEventListener('message', onMessage);
    return () => {
      clearHover(); clearSelection(); delete root.dataset.openpresentAuthoring;
      root.removeEventListener('pointerover', onPointer);
      root.removeEventListener('pointerleave', onLeave);
      root.removeEventListener('click', onClick, true);
      root.removeEventListener('dblclick', onDoubleClick, true);
      root.removeEventListener('keydown', onKey, true);
      root.removeEventListener('focusout', onFocusOut, true);
      window.removeEventListener('message', onMessage);
    };
  }, [config, navigate, rootRef, slideId]);
}
