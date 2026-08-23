import { useCallback, useRef } from 'react';

export interface ResizeHandleProps {
  /** Which edge the handle sits on, which decides the direction of a drag. */
  edge: 'left' | 'right';
  label: string;
  width: number;
  min: number;
  max: number;
  onResize(width: number): void;
}

const KEYBOARD_STEP = 16;

/**
 * A draggable column divider. Pointer capture keeps the drag alive when the
 * cursor outruns the handle, and the same width is reachable from the keyboard
 * so resizing is not mouse-only.
 */
export function ResizeHandle({ edge, label, width, min, max, onResize }: ResizeHandleProps) {
  const origin = useRef<{ pointer: number; width: number } | undefined>(undefined);

  const clamp = useCallback((value: number) => Math.min(max, Math.max(min, value)), [max, min]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    origin.current = { pointer: event.clientX, width };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = origin.current;
    if (!start) return;
    const travel = event.clientX - start.pointer;
    onResize(clamp(start.width + (edge === 'left' ? travel : -travel)));
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    origin.current = undefined;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const direction = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
    if (!direction) return;
    event.preventDefault();
    onResize(clamp(width + direction * KEYBOARD_STEP * (edge === 'left' ? 1 : -1)));
  };

  return (
    <div
      className={`resize-handle is-${edge}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={Math.round(width)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
    />
  );
}
