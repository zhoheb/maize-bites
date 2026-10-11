import { describe, expect, it } from 'vitest';
import { distanceMeters, formatWalk } from './geo';

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
