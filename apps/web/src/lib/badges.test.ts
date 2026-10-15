import { describe, expect, it } from 'vitest';
import { exceptionBadges } from './badges';

describe('exceptionBadges', () => {
  it('gives no badge to the default: open to all, or no stated audience', () => {
    expect(exceptionBadges({ audience: 'open', likelyGone: false })).toEqual([]);
    expect(exceptionBadges({ audience: 'unknown', likelyGone: false })).toEqual([]);
  });

  it('badges only what is exceptional', () => {
    expect(exceptionBadges({ audience: 'members', likelyGone: false })).toEqual(['members']);
    expect(exceptionBadges({ audience: 'rsvp', likelyGone: false })).toEqual(['rsvp']);
    expect(exceptionBadges({ audience: 'open', likelyGone: true })).toEqual(['gone']);
  });

  it('puts likely over first when both apply', () => {
    expect(exceptionBadges({ audience: 'rsvp', likelyGone: true })).toEqual(['gone', 'rsvp']);
  });
});
