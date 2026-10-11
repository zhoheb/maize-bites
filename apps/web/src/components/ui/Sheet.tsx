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
  } | null>(null);

  const index = SHEET_SNAPS.indexOf(snap);
  const step = (by: number) => {
    const next = SHEET_SNAPS[Math.min(SHEET_SNAPS.length - 1, Math.max(0, index + by))];
    if (next !== undefined) onSnapChange(next);
  };

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    // Leave taps on controls inside the header (the search box) alone.
    if (e.target instanceof HTMLElement && e.target.closest('input, a, [data-no-drag]')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      y: e.clientY,
      height: target,
      lastY: e.clientY,
      lastT: e.timeStamp,
      v: 0,
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
    if (Math.abs(e.clientY - d.y) < 4) return; // a tap, not a drag: the handle's click handles it
    onSnapChange(nearestSnap(released, d.v, available));
  }

  return (
    <section
      aria-label={label}
      style={{ height: dragHeight ?? target }}
      className={`${dragHeight === null ? 'transition-[height] duration-300 ease-out ' : ''}absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-t-3xl border border-b-0 border-line bg-surface text-ink shadow-lift`}
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
          onClick={() => {
            // Up through the sizes, then back to the smallest.
            if (index === SHEET_SNAPS.length - 1) onSnapChange('peek');
            else step(1);
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
