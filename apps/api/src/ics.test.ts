import type { FoodEvent } from '@maize-bites/shared';
import { describe, expect, it } from 'vitest';
import { buildIcs, escapeText, foldLine } from './ics.js';

const event: FoodEvent = {
  id: '6f1c1b7e-8d8a-4f3e-9d61-2b3c6f0e9a11',
  source: 'happening',
  title: 'Tacos; salsa, and more',
  description: 'Line 1\nLine 2',
  startsAt: '2026-10-01T16:00:00.000Z',
  endsAt: null,
  locationName: 'The Arb',
  room: null,
  building: null,
  lat: null,
  lng: null,
  url: null,
  sponsor: null,
  foodItems: [],
  mealType: null,
  dietary: [],
  audience: 'members',
  audienceEvidence: 'members only',
  likelyGone: false,
};

describe('escapeText', () => {
  it('escapes backslashes, semicolons, commas, and newlines', () => {
    expect(escapeText('a\\b;c,d\ne\r\nf')).toBe('a\\\\b\\;c\\,d\\ne\\nf');
  });
});

describe('foldLine', () => {
  it('leaves short lines alone', () => {
    expect(foldLine('SUMMARY:short')).toBe('SUMMARY:short');
  });

  it('folds at 75 octets without splitting multi-byte characters', () => {
    const folded = foldLine(`DESCRIPTION:${'🍕'.repeat(40)}`);
    const lines = folded.split('\r\n');
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
    expect(lines.slice(1).every((l) => l.startsWith(' '))).toBe(true);
    expect(folded.replace(/\r\n /g, '')).toBe(`DESCRIPTION:${'🍕'.repeat(40)}`);
  });
});

describe('buildIcs', () => {
  const ics = buildIcs(event, { now: new Date('2026-09-30T12:00:00Z') });
  const unfolded = ics.replace(/\r\n /g, '');

  it('defaults the end to one hour after the start', () => {
    expect(unfolded).toContain('DTSTART:20261001T160000Z\r\n');
    expect(unfolded).toContain('DTEND:20261001T170000Z\r\n');
  });

  it('escapes text and omits empty optional properties', () => {
    expect(unfolded).toContain('SUMMARY:Tacos\\; salsa\\, and more\r\n');
    expect(unfolded).toContain('LOCATION:The Arb\r\n');
    expect(unfolded).not.toContain('GEO:');
    expect(unfolded).not.toContain('URL:');
  });

  it('notes audience restrictions and the disclaimer', () => {
    expect(unfolded).toContain(
      'DESCRIPTION:Members only.\\n\\nLine 1\\nLine 2\\n\\nVia Maize Bites.',
    );
  });
});
