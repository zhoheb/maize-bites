import { describe, expect, it } from 'vitest';
import { makeEvent } from '../test/fixtures';
import {
  countdown,
  directionsUrl,
  formatDuration,
  formatLocation,
  formatRelative,
  formatTimeRange,
} from './format';

describe('formatLocation', () => {
  it('uses the resolved building and room', () => {
    expect(formatLocation(makeEvent())).toBe('Duderstadt Center · 1180');
  });

  it('omits a missing room', () => {
    expect(formatLocation(makeEvent({ room: null }))).toBe('Duderstadt Center');
  });

  it('falls back to the raw location name when no building matched', () => {
    expect(formatLocation(makeEvent({ building: null, locationName: 'The Arb' }))).toBe('The Arb');
  });
});

// Intl may use U+202F (narrow no-break space) before AM/PM.
const normalize = (s: string) => s.replace(/\u202f/g, ' ');

describe('formatTimeRange', () => {
  it('formats a same-day range in Ann Arbor time', () => {
    const text = formatTimeRange({
      startsAt: '2026-10-01T16:00:00.000Z',
      endsAt: '2026-10-01T17:30:00.000Z',
    });
    expect(normalize(text)).toBe('Thu, Oct 1 · 12:00 PM – 1:30 PM');
  });

  it('omits the end when there is none', () => {
    const text = formatTimeRange({ startsAt: '2026-10-01T16:00:00.000Z', endsAt: null });
    expect(normalize(text)).toBe('Thu, Oct 1 · 12:00 PM');
  });

  it('includes both days when the range spans midnight', () => {
    const text = formatTimeRange({
      startsAt: '2026-10-02T03:00:00.000Z',
      endsAt: '2026-10-02T05:00:00.000Z',
    });
    expect(normalize(text)).toBe('Thu, Oct 1 11:00 PM – Fri, Oct 2 1:00 AM');
  });
});

const NOW = new Date('2026-10-01T16:00:00Z');
const min = (m: number) => new Date(NOW.getTime() + m * 60_000).toISOString();

describe('formatDuration', () => {
  it.each([
    [30_000, '1 min'],
    [25 * 60_000, '25 min'],
    [60 * 60_000, '1 hr'],
    [125 * 60_000, '2 hr 5 min'],
    [24 * 3_600_000, '1 day'],
    [3.5 * 24 * 3_600_000, '3 days'],
  ])('%d ms → %s', (ms, text) => {
    expect(formatDuration(ms)).toBe(text);
  });
});

describe('countdown', () => {
  it.each([
    [{ startsAt: min(25), endsAt: min(85) }, 'upcoming', 'Starts in 25 min'],
    [{ startsAt: min(0.5), endsAt: min(60) }, 'upcoming', 'Starting now'],
    [{ startsAt: min(-10), endsAt: min(65) }, 'live', 'Ends in 1 hr 5 min'],
    [{ startsAt: min(-10), endsAt: min(0.5) }, 'live', 'Ending now'],
    [{ startsAt: min(-30), endsAt: null }, 'live', 'Ends in 30 min'], // default 1h duration
    [{ startsAt: min(-120), endsAt: min(-60) }, 'ended', 'Ended'],
    [{ startsAt: min(3 * 24 * 60), endsAt: null }, 'upcoming', 'Starts in 3 days'],
  ])('%j', (event, status, text) => {
    expect(countdown(event, NOW)).toEqual({ status, text });
  });
});

describe('formatRelative', () => {
  it.each([
    [NOW, 'just now'],
    [new Date(NOW.getTime() - 12 * 60_000), '12 min ago'],
    [new Date(NOW.getTime() - 3 * 3_600_000), '3 hr ago'],
  ])('%s → %s', (date, text) => {
    expect(formatRelative(date, NOW)).toBe(text);
  });
});

describe('directionsUrl', () => {
  it('prefers coordinates', () => {
    expect(directionsUrl(makeEvent())).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=42.29118%2C-83.71577&travelmode=walking',
    );
  });

  it('falls back to the place name', () => {
    expect(
      directionsUrl(makeEvent({ lat: null, lng: null, building: null, locationName: 'The Arb' })),
    ).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=The%20Arb%2C%20Ann%20Arbor%2C%20MI&travelmode=walking',
    );
  });

  it('returns null with nothing to go on', () => {
    expect(
      directionsUrl(makeEvent({ lat: null, lng: null, building: null, locationName: null })),
    ).toBeNull();
  });
});
