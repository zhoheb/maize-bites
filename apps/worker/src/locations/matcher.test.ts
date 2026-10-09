import { BUILDINGS } from '@maize-bites/db';
import { describe, expect, it } from 'vitest';
import { normalizeHappeningItem } from '../sources/happening/normalize.js';
import { happeningItemSchema } from '../sources/happening/schema.js';
import { sampleFeed } from '../test/fixture.js';
import { createLocationMatcher, normalizeLocationName, resolveLocation } from './matcher.js';

const buildings = BUILDINGS.map((b) => ({ ...b, id: b.name }));
const match = createLocationMatcher(buildings);
const matchName = (name: string) => match(name)?.name ?? null;

describe('normalizeLocationName', () => {
  it.each([
    ['Art &amp; Architecture Bldg.', 'art and architecture bldg'],
    ['  The   Michigan  UNION ', 'michigan union'],
    ['G.G. Brown', 'g g brown'],
    ['Café Ástor', 'cafe astor'],
    ['', ''],
  ])('%j → %j', (input, expected) => {
    expect(normalizeLocationName(input)).toBe(expected);
  });
});

describe('createLocationMatcher (seeded buildings)', () => {
  it.each([
    // Real location_name / building_name values from the fixture:
    ['Taubman Health Sciences Library 2903', 'Taubman Health Sciences Library'],
    [
      'Art &amp; Architecture Building, 2000 Bonisteel Blvd, Ann Arbor MI 48109-2069',
      'Art & Architecture Building',
    ],
    ['North Campus Research Complex Building 18', 'North Campus Research Complex'],
    ['East Quadrangle', 'East Quad'],
    ['Hatcher Graduate Library', 'Hatcher Graduate Library'],
    ['Duderstadt Center', 'Duderstadt Center'],
    // Aliases, case and punctuation:
    ['the dude', 'Duderstadt Center'],
    ['BBB', 'Bob and Betty Beyster Building'],
    ['G. G. Brown Building', 'G.G. Brown Laboratory'],
    ['michigan union - pendleton room', 'Michigan Union'],
    // Segments (also real fixture values):
    ['Vandenberg Room, Michigan League', 'Michigan League'],
    ['Diag - Central Campus', 'The Diag'],
    ['Room 1180 (Duderstadt Center)', 'Duderstadt Center'],
    ['202 S. Thayer', '202 South Thayer Building'],
    ['Lurie Ann & Robert H. Tower', 'Lurie Tower'],
    ['2nd Floor | Pendleton Room', 'Michigan Union'],
    ['WISE Office, 3236 Undergraduate Science Building', 'Undergraduate Science Building'],
  ])('%j → %s', (input, expected) => {
    expect(matchName(input)).toBe(expected);
  });

  it.each([
    'Off Campus Location',
    '305 W Liberty',
    'LSA Building',
    'Union Street Cafe',
    'Dude Ranch',
    '',
  ])('does not match %j', (input) => {
    expect(matchName(input)).toBeNull();
  });

  it('prefers the longest matching prefix', () => {
    const m = createLocationMatcher([
      { id: 'a', name: 'North Campus', aliases: [] },
      { id: 'b', name: 'North Campus Research Complex', aliases: [] },
    ]);
    expect(m('North Campus Research Complex Building 18')?.id).toBe('b');
  });

  it('drops keys claimed by two buildings instead of guessing', () => {
    const m = createLocationMatcher([
      { id: 'a', name: 'Alpha Hall', aliases: ['Science Hall'] },
      { id: 'b', name: 'Beta Hall', aliases: ['Science Hall'] },
    ]);
    expect(m('Science Hall')).toBeNull();
    expect(m('Alpha Hall')?.id).toBe('a');
  });

  it('resolves a meaningful share of the captured feed', () => {
    const results = sampleFeed.map((raw) => {
      const { locationCandidates } = normalizeHappeningItem(happeningItemSchema.parse(raw));
      return resolveLocation(locationCandidates, match);
    });
    const matched = results.filter((r) => r.buildingId !== null).length;
    // Regression floor for seed + matcher on this fixture (measured: 70/200; 25 have no real location).
    expect(matched).toBeGreaterThanOrEqual(70);
  });
});

describe('resolveLocation', () => {
  it('uses the first candidate that matches', () => {
    expect(resolveLocation(['Off Campus Location', 'Michigan League'], match)).toEqual({
      buildingId: 'Michigan League',
      miss: null,
    });
  });

  it('reports the most specific real name as a miss', () => {
    expect(resolveLocation(['LSA Building', 'LSA Building 2001'], match)).toEqual({
      buildingId: null,
      miss: { normalizedName: 'lsa building 2001', locationName: 'LSA Building 2001' },
    });
  });

  it('does not report placeholders like "Off Campus Location" as misses', () => {
    expect(resolveLocation(['Off Campus Location', 'Ann Arbor'], match)).toEqual({
      buildingId: null,
      miss: null,
    });
    expect(resolveLocation([], match)).toEqual({ buildingId: null, miss: null });
  });
});
