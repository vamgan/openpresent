import {
  cloneElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { SlideErrorBoundary } from './ErrorBoundary';
import { ThemeProvider, mergeTheme } from './theme';
import { postAuthoringMessage, resolveAuthoringMode, useAuthoringBridge, type AuthoringMode } from './authoring';
import type { DefinedDeck, Theme, ThemeInput, TransitionName, TransitionSpec } from './types';

const LOGICAL_WIDTH = 1600;
const LOGICAL_HEIGHT = 900;

const easing = {
  linear: 'linear',
  easeIn: [0.42, 0, 1, 1],
  easeOut: [0, 0, 0.2, 1],
  easeInOut: [0.4, 0, 0.2, 1],
} as const;

export interface ResolvedTransition {
  type: TransitionName;
  initial: Record<string, number> | false;
  animate: Record<string, number>;
  exit: Record<string, number>;
  duration: number;
  ease: NonNullable<TransitionSpec['ease']>;
}

export function resolveTransition(
  requested: TransitionName | TransitionSpec | undefined,
  fallback: TransitionSpec,
  reducedMotion: boolean,
): ResolvedTransition {
  const spec = typeof requested === 'string' ? { ...fallback, type: requested } : { ...fallback, ...requested };
  if (reducedMotion || spec.type === 'none') {
    return { type: spec.type, initial: false, animate: { opacity: 1 }, exit: { opacity: 1 }, duration: 0, ease: spec.ease ?? 'easeOut' };
  }
  const states = {
    fade: { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } },
    slide: { initial: { opacity: 0, x: 72 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -48 } },
    scale: { initial: { opacity: 0, scale: 0.965 }, animate: { opacity: 1, scale: 1 }, exit: { opacity: 0, scale: 1.018 } },
    none: { initial: false as const, animate: { opacity: 1 }, exit: { opacity: 1 } },
  };
  return {
    type: spec.type,
    ...states[spec.type],
    duration: spec.duration ?? fallback.duration ?? 0.45,
    ease: spec.ease ?? fallback.ease ?? 'easeOut',
  };
}

function readHashValue(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const raw = window.location.hash.slice(1);
  if (!raw) return undefined;
  try { return decodeURIComponent(raw); } catch { return undefined; }
}

function readHashIndex(deck: DefinedDeck): number {
  const value = readHashValue();
  if (value === undefined) return 0;
  const index = deck.slideIds.indexOf(value);
  return index < 0 ? 0 : index;
}

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(
    target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]'),
  );
}

function initialScale(edgeToEdge = false) {
  if (typeof window === 'undefined') return 1;
  const inset = edgeToEdge ? 0 : 32;
  return Math.max(0.01, Math.min((window.innerWidth - inset) / LOGICAL_WIDTH, (window.innerHeight - inset) / LOGICAL_HEIGHT));
}

function isThumbnailMode() {
  return typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('openpresentThumbnail') === '1';
}

function isPrintMode() {
  return typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('openpresentPrint') === '1';
}

export interface PresentationProps {
  deck: DefinedDeck;
  theme?: ThemeInput;
  className?: string;
  autoHideControls?: boolean;
  onSlideChange?: (slideId: string, index: number) => void;
  authoring?: AuthoringMode;
}

export function Presentation({ deck, theme, className, autoHideControls = true, onSlideChange, authoring }: PresentationProps) {
  const resolvedTheme = useMemo(() => mergeTheme(deck.theme, theme), [deck.theme, theme]);
  return (
    <ThemeProvider theme={resolvedTheme} className={className}>
      <PresentationRuntime deck={deck} resolvedTheme={resolvedTheme} autoHideControls={autoHideControls} onSlideChange={onSlideChange} authoring={authoring} />
    </ThemeProvider>
  );
}

interface PresentationRuntimeProps extends Omit<PresentationProps, 'theme' | 'className'> {
  resolvedTheme: Theme;
}

function PresentationRuntime({ deck, resolvedTheme, autoHideControls, onSlideChange, authoring }: PresentationRuntimeProps) {
  const thumbnailMode = useMemo(isThumbnailMode, []);
  const printMode = useMemo(isPrintMode, []);
  const [index, setIndex] = useState(() => readHashIndex(deck));
  // The slide the URL asked for, which the deck may not contain yet.
  const requestedSlide = useRef<string | undefined>(readHashValue());
  const [scale, setScale] = useState(() => initialScale(thumbnailMode || printMode));
  const [fullscreen, setFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const shellRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const reducedMotion = Boolean(useReducedMotion());
  const activeSlide = deck.slides[index] ?? deck.slides[0];
  const slideId = activeSlide.props.id;
  const authoringConfig = useMemo(() => resolveAuthoringMode(authoring), [authoring]);

  const goTo = useCallback((next: number) => {
    const target = Math.max(0, Math.min(deck.slides.length - 1, next));
    requestedSlide.current = deck.slideIds[target];
    setIndex(target);
  }, [deck.slideIds, deck.slides.length]);
  const goToId = useCallback((id: string) => {
    const next = deck.slideIds.indexOf(id);
    if (next >= 0) goTo(next);
  }, [deck.slideIds, goTo]);

  useAuthoringBridge(viewportRef, slideId, authoringConfig, goToId);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (fullscreen && autoHideControls) {
      hideTimer.current = setTimeout(() => setControlsVisible(false), 2200);
    }
  }, [autoHideControls, fullscreen]);

  const requestFullscreen = useCallback(async () => {
    const element = viewportRef.current;
    if (!element?.requestFullscreen) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else {
        await element.requestFullscreen();
        element.focus({ preventScroll: true });
      }
    } catch (error) {
      console.warn('[OpenPresent] Fullscreen request was declined by the browser.', error);
    }
  }, []);

  const handleKey = useCallback((event: KeyboardEvent | ReactKeyboardEvent) => {
    showControls();
    if (isEditableTarget(event.target)) return;
    const key = event.key;
    if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(key)) {
      event.preventDefault();
      goTo(index + 1);
    } else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(key)) {
      event.preventDefault();
      goTo(index - 1);
    } else if (key === 'Home') {
      event.preventDefault();
      goTo(0);
    } else if (key === 'End') {
      event.preventDefault();
      goTo(deck.slides.length - 1);
    } else if (key.toLowerCase() === 'f') {
      event.preventDefault();
      void requestFullscreen();
    }
  }, [deck.slides.length, goTo, index, requestFullscreen, showControls]);

  useLayoutEffect(() => {
    const element = shellRef.current;
    if (!element) return;
    const resize = () => {
      const edgeToEdge = thumbnailMode || printMode;
      const availableWidth = Math.max(edgeToEdge ? 1 : 240, window.innerWidth - (edgeToEdge ? 0 : 32));
      const availableHeight = Math.max(edgeToEdge ? 1 : 135, window.innerHeight - (edgeToEdge ? 0 : 32));
      setScale(Math.min(availableWidth / LOGICAL_WIDTH, availableHeight / LOGICAL_HEIGHT));
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    window.addEventListener('resize', resize);
    return () => { observer.disconnect(); window.removeEventListener('resize', resize); };
  }, [printMode, thumbnailMode]);

  useEffect(() => {
    const onHashChange = () => {
      requestedSlide.current = readHashValue();
      setIndex(readHashIndex(deck));
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [deck]);

  // A deck can gain the requested slide after mount: a rail thumbnail opens at
  // #new-slide while the module it loaded predates the insert. Resolve the
  // request once the slide exists instead of stranding the view on slide one.
  useEffect(() => {
    const requested = requestedSlide.current;
    if (!requested) return;
    const target = deck.slideIds.indexOf(requested);
    if (target >= 0 && target !== index) setIndex(target);
  }, [deck, index]);

  useEffect(() => {
    const expected = `#${encodeURIComponent(slideId)}`;
    const pending = requestedSlide.current !== undefined && !deck.slideIds.includes(requestedSlide.current);
    // Never overwrite a request the deck cannot satisfy yet, or it is lost.
    if (!pending && window.location.hash !== expected) window.history.replaceState(null, '', expected);
    document.title = `${activeSlide.props.title ?? activeSlide.props.label ?? slideId} | ${deck.metadata.title}`;
    onSlideChange?.(slideId, index);
    postAuthoringMessage(authoringConfig, { version: 1, type: 'openpresent.navigation', slideId });
  }, [activeSlide.props.label, activeSlide.props.title, authoringConfig, deck.metadata.title, index, onSlideChange, slideId]);

  useEffect(() => {
    const onFullscreen = () => {
      setFullscreen(Boolean(document.fullscreenElement));
      setControlsVisible(true);
    };
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => document.removeEventListener('fullscreenchange', onFullscreen);
  }, []);

  useEffect(() => {
    if (fullscreen) showControls();
  }, [fullscreen, showControls]);

  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  useEffect(() => () => { if (hideTimer.current) clearTimeout(hideTimer.current); }, []);

  const fallback: TransitionSpec = {
    type: resolvedTheme.motion.defaultTransition,
    duration: resolvedTheme.motion.duration,
    ease: resolvedTheme.motion.ease,
  };
  const transition = resolveTransition(activeSlide.props.transition, fallback, reducedMotion || thumbnailMode || printMode);
  const fullscreenSupported = typeof document !== 'undefined' && 'fullscreenEnabled' in document
    ? document.fullscreenEnabled
    : Boolean(viewportRef.current?.requestFullscreen);

  return (
    <div
      ref={viewportRef}
      className="op-viewport"
      data-testid="presentation"
      data-slide-id={slideId}
      data-openpresent-slide-count={deck.slideIds.length}
      data-openpresent-slide-ids={JSON.stringify(deck.slideIds)}
      data-reduced-motion={reducedMotion || undefined}
      data-openpresent-authoring={authoringConfig.enabled || undefined}
      data-openpresent-thumbnail={thumbnailMode || undefined}
      data-openpresent-print={printMode || undefined}
      tabIndex={-1}
      onMouseMove={showControls}
      onPointerDown={showControls}
    >
      <div
        ref={shellRef}
        className="op-stage-shell"
        data-logical-width={LOGICAL_WIDTH}
        data-logical-height={LOGICAL_HEIGHT}
        style={{ width: LOGICAL_WIDTH * scale, height: LOGICAL_HEIGHT * scale }}
      >
        <main
          className="op-stage"
          aria-live="polite"
          style={{ width: LOGICAL_WIDTH, height: LOGICAL_HEIGHT, transform: `scale(${scale})` }}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={slideId}
              className="op-transition-layer"
              data-transition-type={transition.type}
              data-transition-duration={transition.duration}
              initial={transition.initial}
              animate={transition.animate}
              exit={transition.exit}
              transition={{ duration: transition.duration, ease: easing[transition.ease] }}
            >
              <SlideErrorBoundary slideId={slideId}>
                {cloneElement(activeSlide, { key: slideId })}
              </SlideErrorBoundary>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <nav
        className={`op-controls${controlsVisible ? ' is-visible' : ''}`}
        aria-label="Presentation controls"
        data-testid="presentation-controls"
        data-openpresent-runtime-control="controls"
      >
        <button type="button" onClick={() => goTo(index - 1)} disabled={index === 0} aria-label="Previous slide">←</button>
        <span className="op-counter" aria-label={`Slide ${index + 1} of ${deck.slides.length}`}>{index + 1} / {deck.slides.length}</span>
        <button type="button" onClick={() => goTo(index + 1)} disabled={index === deck.slides.length - 1} aria-label="Next slide">→</button>
        <button
          type="button"
          onClick={() => void requestFullscreen()}
          disabled={!fullscreenSupported}
          aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          aria-pressed={fullscreen}
          title={fullscreenSupported ? 'Fullscreen (F)' : 'Fullscreen is unavailable in this browser'}
        >
          {fullscreen ? '↙' : '↗'}
        </button>
      </nav>
      <div className="op-progress" data-openpresent-runtime-control="progress" aria-hidden="true"><span style={{ width: `${((index + 1) / deck.slides.length) * 100}%` }} /></div>
    </div>
  );
}
