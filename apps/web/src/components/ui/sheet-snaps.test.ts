import { describe, expect, it } from 'vitest';
import { nearestSnap, snapHeight } from './sheet-snaps';

const AVAILABLE = 788; // a 844px phone minus the 56px header

describe('sheet snap points', () => {
  it('has three heights: enough for the first card, a bit over half, nearly all', () => {
    expect(snapHeight('peek', AVAILABLE)).toBe(336);
    expect(snapHeight('half', AVAILABLE)).toBe(489);
    expect(snapHeight('full', AVAILABLE)).toBe(780);
  });

  it('settles on the nearest height when released', () => {
    expect(nearestSnap(380, 0, AVAILABLE)).toBe('peek');
    expect(nearestSnap(460, 0, AVAILABLE)).toBe('half');
    expect(nearestSnap(700, 0, AVAILABLE)).toBe('full');
  });

  it('lets a flick carry it to the next height', () => {
    expect(nearestSnap(360, 600, AVAILABLE)).toBe('half'); // flicked up
    expect(nearestSnap(470, -800, AVAILABLE)).toBe('peek'); // flicked down
  });
});
