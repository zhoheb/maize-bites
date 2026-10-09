import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../test/api-mock';
import { matchBuildings } from './buildings';
import { fromCampusInput, toCampusInput } from './campus-time';

const names = (query: string) =>
  matchBuildings(BUILDINGS.buildings as never, query).map((b) => b.name);

describe('matchBuildings', () => {
  it('matches on name or alias, every word, case-insensitively', () => {
    expect(names('dude')).toEqual(['Duderstadt Center']);
    expect(names('MEDIA union')).toEqual(['Duderstadt Center']);
    expect(names('michigan')).toEqual(['Michigan League', 'Michigan Union']);
    expect(names('michigan un')).toEqual(['Michigan Union']);
  });

  it('ranks a name or alias that starts with the query above a passing mention', () => {
    // "Union" is the Michigan Union's alias; the Duderstadt only has it inside "Media Union".
    expect(names('union')).toEqual(['Michigan Union', 'Duderstadt Center']);
    expect(names('mich')).toEqual(['Michigan League', 'Michigan Union']);
    expect(names('league')).toEqual(['Michigan League']);
  });

  it('returns nothing for an empty query or no match', () => {
    expect(names('')).toEqual([]);
    expect(names('   ')).toEqual([]);
    expect(names('stadium')).toEqual([]);
  });
});

describe('campus time inputs', () => {
  it('formats an instant as an Ann Arbor datetime-local value', () => {
    expect(toCampusInput(new Date('2026-10-01T16:05:00Z'))).toBe('2026-10-01T12:05'); // EDT
    expect(toCampusInput(new Date('2027-01-15T04:30:00Z'))).toBe('2027-01-14T23:30'); // EST
  });

  it('reads a datetime-local value as Ann Arbor time', () => {
    expect(fromCampusInput('2026-10-01T12:05')).toBe('2026-10-01T16:05:00.000Z');
    expect(fromCampusInput('2027-01-14T23:30')).toBe('2027-01-15T04:30:00.000Z');
    expect(fromCampusInput('')).toBeNull();
    expect(fromCampusInput('tomorrow')).toBeNull();
  });
});
