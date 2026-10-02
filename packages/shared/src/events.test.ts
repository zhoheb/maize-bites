import { describe, expect, it } from 'vitest';
import {
  effectiveEnd,
  foodEventSchema,
  isHappeningNow,
  listEventsQuerySchema,
  type FoodEvent,
} from './events.js';

const event: FoodEvent = {
  id: '6f1c1b7e-8d8a-4f3e-9d61-2b3c6f0e9a11',
  source: 'happening',
  title: 'Pizza at the Dude',
  description: null,
  startsAt: '2026-10-01T16:00:00.000Z',
  endsAt: '2026-10-01T17:30:00.000Z',
  locationName: 'Duderstadt Center',
  room: '1180',
  building: {
    id: '0b0e8f3a-2c1d-4e5f-8a9b-1c2d3e4f5a6b',
    name: 'Duderstadt Center',
    campus: 'north',
  },
  lat: 42.2911,
  lng: -83.7161,
  url: 'https://events.umich.edu/event/1',
  sponsor: null,
  foodItems: ['pizza'],
  mealType: 'lunch',
  dietary: ['vegetarian'],
  audience: 'open',
  likelyGone: false,
};

describe('foodEventSchema', () => {
  it('accepts a valid event', () => {
    expect(foodEventSchema.parse(event)).toEqual(event);
  });

  it('rejects an empty title', () => {
    expect(foodEventSchema.safeParse({ ...event, title: '' }).success).toBe(false);
  });

  it('rejects non-ISO timestamps', () => {
    expect(foodEventSchema.safeParse({ ...event, startsAt: 'tomorrow' }).success).toBe(false);
  });

  it('rejects unknown dietary tags', () => {
    expect(foodEventSchema.safeParse({ ...event, dietary: ['paleo'] }).success).toBe(false);
  });
});

describe('listEventsQuerySchema', () => {
  it('defaults limit to 50', () => {
    expect(listEventsQuerySchema.parse({})).toEqual({ limit: 50 });
  });

  it('coerces limit from a query string', () => {
    expect(listEventsQuerySchema.parse({ limit: '10' }).limit).toBe(10);
  });

  it.each(['0', '101', 'abc', '2.5'])('rejects limit=%s', (limit) => {
    expect(listEventsQuerySchema.safeParse({ limit }).success).toBe(false);
  });

  it('accepts comma-separated and repeated list params', () => {
    expect(listEventsQuerySchema.parse({ campus: 'central,north' }).campus).toEqual([
      'central',
      'north',
    ]);
    expect(listEventsQuerySchema.parse({ dietary: ['vegan', 'halal'] }).dietary).toEqual([
      'vegan',
      'halal',
    ]);
  });

  it('rejects unknown campuses', () => {
    expect(listEventsQuerySchema.safeParse({ campus: 'central,dearborn' }).success).toBe(false);
  });

  it('parses open_only as a boolean', () => {
    expect(listEventsQuerySchema.parse({ open_only: 'true' }).open_only).toBe(true);
    expect(listEventsQuerySchema.parse({ open_only: 'false' }).open_only).toBe(false);
    expect(listEventsQuerySchema.safeParse({ open_only: 'maybe' }).success).toBe(false);
    expect(listEventsQuerySchema.safeParse({ open_only: 'yes' }).success).toBe(false);
  });

  it('parses bbox into named edges', () => {
    expect(listEventsQuerySchema.parse({ bbox: '-83.75,42.27,-83.73,42.28' }).bbox).toEqual({
      west: -83.75,
      south: 42.27,
      east: -83.73,
      north: 42.28,
    });
  });

  it.each(['-83.73,42.27,-83.75,42.28', '1,2,3', 'a,b,c,d', '-200,0,0,0'])(
    'rejects bbox=%s',
    (bbox) => {
      expect(listEventsQuerySchema.safeParse({ bbox }).success).toBe(false);
    },
  );
});

describe('effectiveEnd', () => {
  it('uses endsAt when present', () => {
    expect(effectiveEnd(event).toISOString()).toBe('2026-10-01T17:30:00.000Z');
  });

  it('falls back to one hour after start', () => {
    expect(effectiveEnd({ ...event, endsAt: null }).toISOString()).toBe('2026-10-01T17:00:00.000Z');
  });
});

describe('isHappeningNow', () => {
  it('is false before the event starts', () => {
    expect(isHappeningNow(event, new Date('2026-10-01T15:59:59Z'))).toBe(false);
  });

  it('is true from start (inclusive) to end (exclusive)', () => {
    expect(isHappeningNow(event, new Date('2026-10-01T16:00:00Z'))).toBe(true);
    expect(isHappeningNow(event, new Date('2026-10-01T17:29:59Z'))).toBe(true);
    expect(isHappeningNow(event, new Date('2026-10-01T17:30:00Z'))).toBe(false);
  });
});
