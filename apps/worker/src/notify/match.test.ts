import type { FoodEvent } from '@maize-bites/shared';
import { describe, expect, it } from 'vitest';
import { isNewForSubscriber, isQuietTime, matchesFilters, type AlertFilters } from './match.js';

type E = Pick<FoodEvent, 'building' | 'dietary' | 'audience'>;
const north = { id: 'b', name: 'BBB', campus: 'north' as const };
const event = (over: Partial<E> = {}): E => ({
  building: north,
  dietary: ['vegan', 'vegetarian'],
  audience: 'open',
  ...over,
});
const any: AlertFilters = { campuses: [], dietary: [], openOnly: false };

describe('matchesFilters', () => {
  it('matches everything with no filters', () => {
    expect(matchesFilters(event(), any)).toBe(true);
    expect(matchesFilters(event({ building: null, audience: 'unknown', dietary: [] }), any)).toBe(
      true,
    );
  });

  it.each([
    [{ campuses: ['north'] }, event(), true],
    [{ campuses: ['central', 'north'] }, event(), true],
    [{ campuses: ['central'] }, event(), false],
    [{ campuses: ['north'] }, event({ building: null }), false], // unknown location can't be on a campus
    [{ dietary: ['vegan'] }, event(), true],
    [{ dietary: ['vegan', 'vegetarian'] }, event(), true],
    [{ dietary: ['vegan', 'halal'] }, event(), false], // every need must be listed
    [{ dietary: ['vegan'] }, event({ dietary: [] }), false],
    [{ openOnly: true }, event(), true],
    [{ openOnly: true }, event({ audience: 'members' }), false],
    [{ openOnly: true }, event({ audience: 'rsvp' }), false],
    [{ openOnly: true }, event({ audience: 'unknown' }), false],
    [{ campuses: ['north'], dietary: ['vegan'], openOnly: true }, event(), true],
    [
      { campuses: ['north'], dietary: ['vegan'], openOnly: true },
      event({ audience: 'members' }),
      false,
    ],
  ])('%j vs event → %s', (filters, e, expected) => {
    expect(matchesFilters(e, { ...any, ...filters })).toBe(expected);
  });
});

describe('isQuietTime (America/Detroit)', () => {
  // EDT (UTC-4) in October.
  const at = (hhmm: string) => new Date(`2026-10-01T${hhmm}:00-04:00`);

  it('is never quiet without a window or with start === end', () => {
    expect(isQuietTime(at('03:00'), null, null)).toBe(false);
    expect(isQuietTime(at('03:00'), '22:00', null)).toBe(false);
    expect(isQuietTime(at('03:00'), '08:00', '08:00')).toBe(false);
  });

  it.each([
    ['12:59', false],
    ['13:00', true], // start inclusive
    ['14:30', true],
    ['14:59', true],
    ['15:00', false], // end exclusive
  ])('same-day window 13:00–15:00 at %s → %s', (time, expected) => {
    expect(isQuietTime(at(time), '13:00', '15:00')).toBe(expected);
  });

  it.each([
    ['21:59', false],
    ['22:00', true],
    ['23:59', true],
    ['00:00', true],
    ['06:59', true],
    ['07:00', false],
    ['12:00', false],
  ])('overnight window 22:00–07:00 at %s → %s', (time, expected) => {
    expect(isQuietTime(at(time), '22:00', '07:00')).toBe(expected);
  });

  it('accepts Postgres time strings with seconds', () => {
    expect(isQuietTime(at('23:00'), '22:00:00', '07:00:00')).toBe(true);
  });

  it('uses Ann Arbor wall-clock time, not UTC, and follows DST', () => {
    // Window 13:00–15:00 local. 17:30Z is 13:30 in October (EDT) but 12:30 in December (EST).
    expect(isQuietTime(new Date('2026-10-01T17:30:00Z'), '13:00', '15:00')).toBe(true); // 13:30 EDT
    expect(isQuietTime(new Date('2026-12-01T17:30:00Z'), '13:00', '15:00')).toBe(false); // 12:30 EST
    expect(isQuietTime(new Date('2026-12-01T18:30:00Z'), '13:00', '15:00')).toBe(true); // 13:30 EST
  });
});

describe('isNewForSubscriber', () => {
  it('only counts events published at or after subscribing', () => {
    const subscribed = new Date('2026-10-01T12:00:00Z');
    expect(isNewForSubscriber(new Date('2026-10-01T11:59:59Z'), subscribed)).toBe(false);
    expect(isNewForSubscriber(subscribed, subscribed)).toBe(true);
    expect(isNewForSubscriber(new Date('2026-10-01T13:00:00Z'), subscribed)).toBe(true);
  });
});
