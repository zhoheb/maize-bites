import { useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { SHEET_SNAPS, SNAP_LABELS, nearestSnap, snapHeight, type SheetSnap } from './sheet-snaps';

/**
 * A draggable bottom sheet that stays on screen over the map, with three heights. It is a plain
 * region, not a dialog: the map and the controls behind it stay reachable by keyboard and
 * screen reader. Drag the header to resize; the handle is also a button that steps through the
 * heights, and Up/Down on it move one step. The list scrolls inside at every height.
 */
export function BottomSheet({
  label,
  snap,
  onSnapChange,
  available,
  header,
  children,
}: {
  label: string;
  snap: SheetSnap;
  onSnapChange: (snap: SheetSnap) => void;
  /** Height of the space the sheet lives in, in pixels. */
  available: number;
  /** Always visible, including at the smallest height. Dragging it resizes the sheet. */
  header: ReactNode;
  children: ReactNode;
}) {
  const target = snapHeight(snap, available);
  // While a finger is down the sheet follows it exactly; otherwise it eases to its snap height
  // (a CSS transition, which the global reduced-motion rule turns off).
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const drag = useRef<{
    y: number;
    height: number;
    lastY: number;
    lastT: number;
    v: number;
    /** The press began on the handle (once captured, later events no longer say so). */
    onHandle: boolean;
  } | null>(null);

  const index = SHEET_SNAPS.indexOf(snap);
  const step = (by: number) => {
    const next = SHEET_SNAPS[Math.min(SHEET_SNAPS.length - 1, Math.max(0, index + by))];
    if (next !== undefined) onSnapChange(next);
  };

  /** Up through the sizes, then back to the smallest. */
  const cycle = () => {
    if (index === SHEET_SNAPS.length - 1) onSnapChange('peek');
    else step(1);
  };

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    // Leave the controls inside the header alone: capturing the pointer would swallow their
    // clicks. The handle is the exception; it is both a button and the thing to drag.
    if (
      e.target instanceof Element &&
      e.target.closest('button, input, a, [role="radio"]') &&
      !e.target.closest('[data-sheet-handle]')
    )
      return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      y: e.clientY,
      height: target,
      lastY: e.clientY,
      lastT: e.timeStamp,
      v: 0,
      onHandle: e.target instanceof Element && e.target.closest('[data-sheet-handle]') !== null,
    };
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    const dt = e.timeStamp - d.lastT;
    if (dt > 0) d.v = ((d.lastY - e.clientY) / dt) * 1000;
    d.lastY = e.clientY;
    d.lastT = e.timeStamp;
    setDragHeight(
      Math.min(snapHeight('full', available), Math.max(72, d.height + (d.y - e.clientY))),
    );
  }
  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
    const released = dragHeight ?? target;
    setDragHeight(null);
    if (Math.abs(e.clientY - d.y) < 4) {
      // A tap, not a drag. Pointer capture sends the click to this wrapper instead of the
      // handle button, so a tap on the handle is acted on here.
      if (d.onHandle) cycle();
      return;
    }
    onSnapChange(nearestSnap(released, d.v, available));
  }

  return (
    <section
      aria-label={label}
      style={{ height: dragHeight ?? target }}
      className={`${dragHeight === null ? 'transition-[height] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ' : ''}absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-t-panel border border-b-0 border-line bg-(--list-bg) text-ink shadow-lift [--list-bg:var(--bg)] dark:[--list-bg:var(--panel)]`}
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="shrink-0 cursor-grab touch-none active:cursor-grabbing"
      >
        <button
          type="button"
          aria-label={`Resize ${label.toLowerCase()}. Now ${SNAP_LABELS[snap]}.`}
          data-sheet-handle
          // Pointer taps are handled above; this is for the keyboard (Enter and Space arrive as
          // a click with no pointer behind it, which browsers mark with detail 0).
          onClick={(e) => {
            if (e.detail === 0) cycle();
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              step(1);
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              step(-1);
            }
          }}
          className="mx-auto flex h-7 w-24 items-center justify-center rounded-full"
        >
          <span aria-hidden="true" className="h-1.5 w-10 rounded-full bg-line-strong" />
        </button>
        <div className="px-4 pb-3">{header}</div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
    </section>
  );
}
