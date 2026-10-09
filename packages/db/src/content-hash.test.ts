import { describe, expect, it } from 'vitest';
import { computeContentHash, type ContentFields } from './content-hash.js';

const BASE: ContentFields = {
  title: 'Lunch & Learn',
  description: 'Pizza provided.',
  startsAt: new Date('2026-10-01T16:00:00Z'),
  endsAt: new Date('2026-10-01T17:00:00Z'),
  locationName: 'Michigan Union',
  room: '2105A',
};

describe('computeContentHash', () => {
  it('is a stable SHA-256 hex digest', () => {
    expect(computeContentHash(BASE)).toMatch(/^[0-9a-f]{64}$/);
    expect(computeContentHash({ ...BASE })).toBe(computeContentHash(BASE));
  });

  it('changes when any field the classifier reads changes', () => {
    const changes: Partial<ContentFields>[] = [
      { title: 'Lunch and Learn' },
      { description: 'Pizza provided while it lasts.' },
      { startsAt: new Date('2026-10-01T16:30:00Z') },
      { endsAt: new Date('2026-10-01T18:00:00Z') },
      { locationName: 'Michigan League' },
      { room: '2105B' },
    ];
    const hashes = changes.map((change) => computeContentHash({ ...BASE, ...change }));
    expect(new Set([computeContentHash(BASE), ...hashes]).size).toBe(changes.length + 1);
  });

  it('ignores surrounding whitespace', () => {
    expect(
      computeContentHash({
        ...BASE,
        title: `  ${BASE.title}\n`,
        description: ' Pizza provided. ',
        locationName: 'Michigan Union ',
        room: ' 2105A',
      }),
    ).toBe(computeContentHash(BASE));
  });

  it('treats null and undefined optional fields alike', () => {
    const nulls = { ...BASE, description: null, endsAt: null, locationName: null, room: null };
    const { title, startsAt } = BASE;
    expect(computeContentHash({ title, startsAt })).toBe(computeContentHash(nulls));
    expect(computeContentHash(nulls)).not.toBe(computeContentHash(BASE));
  });

  it('does not confuse a value moving between adjacent fields', () => {
    expect(computeContentHash({ ...BASE, locationName: 'A', room: null })).not.toBe(
      computeContentHash({ ...BASE, locationName: null, room: 'A' }),
    );
  });
});
