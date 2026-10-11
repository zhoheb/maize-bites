/** Sheet heights: a strip at the bottom, half the space, nearly all of it. */
export const SHEET_SNAPS = ['peek', 'half', 'full'] as const;
export type SheetSnap = (typeof SHEET_SNAPS)[number];

export const SNAP_LABELS: Record<SheetSnap, string> = {
  peek: 'small',
  half: 'half height',
  full: 'full height',
};

/** Enough for the handle, the headline, the time control and the first card. */
export const PEEK_HEIGHT = 336;

/** The sheet's height in pixels at a snap point, inside a container `available` pixels tall. */
export function snapHeight(snap: SheetSnap, available: number): number {
  if (snap === 'peek') return Math.min(PEEK_HEIGHT, available);
  if (snap === 'half') return Math.round(available * 0.62);
  return Math.max(PEEK_HEIGHT, available - 8);
}

/** The snap point nearest a height, nudged in the direction of a flick (`velocity` in px/s, up positive). */
export function nearestSnap(height: number, velocity: number, available: number): SheetSnap {
  const projected = height + velocity * 0.18;
  let best: SheetSnap = 'peek';
  for (const snap of SHEET_SNAPS) {
    if (
      Math.abs(snapHeight(snap, available) - projected) <
      Math.abs(snapHeight(best, available) - projected)
    )
      best = snap;
  }
  return best;
}
