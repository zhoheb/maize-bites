import { describe, expect, it } from 'vitest';
import { distanceMeters, formatWalk, inBbox } from './geo';

const DIAG = { lat: 42.2771, lng: -83.7382 };
const DUDE = { lat: 42.29118, lng: -83.71577 };

describe('distanceMeters', () => {
  it('measures the Diag to the Duderstadt Center at about 2.4 km', () => {
    const d = distanceMeters(DIAG, DUDE);
    expect(d).toBeGreaterThan(2_300);
    expect(d).toBeLessThan(2_500);
    expect(distanceMeters(DIAG, DIAG)).toBe(0);
  });
});

describe('formatWalk', () => {
  it('gives walking minutes for short trips and miles for long ones', () => {
    expect(formatWalk(10)).toBe('1 min walk');
    expect(formatWalk(400)).toBe('6 min walk');
    expect(formatWalk(1_900)).toBe('30 min walk');
    expect(formatWalk(2_400)).toBe('1.5 mi');
  });
});

describe('inBbox', () => {
  const campus = { west: -83.75, south: 42.27, east: -83.7, north: 42.3 };

  it('is true inside and on the edge, false outside', () => {
    expect(inBbox(DIAG, campus)).toBe(true);
    expect(inBbox({ lat: 42.3, lng: -83.7 }, campus)).toBe(true);
    expect(inBbox({ lat: 42.31, lng: -83.72 }, campus)).toBe(false);
    expect(inBbox({ lat: 42.28, lng: -83.69 }, campus)).toBe(false);
  });
});
