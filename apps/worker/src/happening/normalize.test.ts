import { computeContentHash } from '@maize-bites/db';
import { describe, expect, it } from 'vitest';
import { sampleFeed, sampleItem, sampleItemWhere } from '../test/fixture.js';
import { normalizeHappeningItem } from './normalize.js';
import { happeningItemSchema } from './schema.js';

describe('happeningItemSchema against the captured feed', () => {
  it('accepts every item in the fixture', () => {
    const failures = sampleFeed
      .map((raw) => happeningItemSchema.safeParse(raw))
      .filter((r) => !r.success);
    expect(failures).toEqual([]);
    expect(sampleFeed.length).toBe(200);
  });

  it('keeps unknown fields (for events.raw)', () => {
    const item = sampleItem('150244-21908461');
    expect(item).toHaveProperty('qr_code_url');
    expect(item).toHaveProperty('styled_images');
  });
});

describe('normalizeHappeningItem', () => {
  it('normalizes every fixture item', () => {
    for (const raw of sampleFeed) {
      expect(() => normalizeHappeningItem(happeningItemSchema.parse(raw))).not.toThrow();
    }
  });

  it('maps a known item field by field', () => {
    const item = sampleItem('150244-21908461');
    const { event, contentHash, locationCandidates } = normalizeHappeningItem(item);

    expect(event).toMatchObject({
      source: 'happening',
      sourceEventId: '150244',
      occurrenceId: '21908461',
      title: 'OGPS Academic Careers Series - Fall 2026: Writing Your Academic Research Statement',
      startsAt: new Date('2026-09-23T14:00:00.000Z'), // 10:00 EDT
      endsAt: new Date('2026-09-30T15:00:00.000Z'), // 11:00 EDT a week later, as the feed says
      locationName: 'Taubman Health Sciences Library 2903',
      room: null,
      lat: null,
      lng: null,
      url: 'https://events.umich.edu/event/150244',
      sponsor: 'Organizer One Hundred Forty-Five',
      tags: ['Sessions'],
      status: 'active',
    });
    expect(event.description).toMatch(/^This workshop series supports graduate students/);
    expect(event.raw).toBe(item);
    expect(locationCandidates).toEqual(['Taubman Health Sciences Library 2903']);
    expect(contentHash).toBe(computeContentHash(event));
    expect(contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('leaves endsAt null when the feed has no end time', () => {
    const item = sampleItemWhere((i) => i.has_end_time === 0);
    expect(item.datetime_end).toBe('');
    expect(normalizeHappeningItem(item).event.endsAt).toBeNull();
  });

  it('decodes HTML entities in location names', () => {
    const item = sampleItemWhere((i) => (i.location_name ?? '').includes('&amp;'));
    const { event } = normalizeHappeningItem(item);
    expect(event.locationName).toBe(
      'Art & Architecture Building, 2000 Bonisteel Blvd, Ann Arbor MI 48109-2069',
    );
  });

  it('offers building_name before location_name as location candidates', () => {
    const item = sampleItemWhere(
      (i) => !!i.building_name && !!i.location_name && i.building_name !== i.location_name,
    );
    expect(normalizeHappeningItem(item).locationCandidates).toEqual([
      'Off Campus Location',
      'Art & Architecture Building, 2000 Bonisteel Blvd, Ann Arbor MI 48109-2069',
    ]);
  });

  it('appends occurrence notes to the description', () => {
    const item = sampleItemWhere((i) => !!i.occurrence_notes?.trim());
    const { event } = normalizeHappeningItem(item);
    expect(event.description).toContain(item.occurrence_notes?.trim());
  });

  it('drops an end time earlier than the start', () => {
    const item = { ...sampleItem('150244-21908461'), datetime_end: '20260901T090000' };
    expect(normalizeHappeningItem(item).event.endsAt).toBeNull();
  });

  describe('content hash', () => {
    const base = sampleItem('150244-21908461');
    const hash = (overrides: object) =>
      normalizeHappeningItem({ ...base, ...overrides }).contentHash;

    it('ignores fields the classifier does not read', () => {
      expect(hash({ tags: ['Food', 'Free'], website: 'https://example.com', sponsors: [] })).toBe(
        hash({}),
      );
    });

    it.each([
      ['title', { combined_title: 'Now with pizza' }],
      ['description', { description: 'Lunch provided' }],
      ['start', { datetime_start: '20260923T110000' }],
      ['end', { datetime_end: '20260930T120000' }],
      ['location', { location_name: 'Michigan Union' }],
    ])('changes when %s changes', (_field, overrides) => {
      expect(hash(overrides)).not.toBe(hash({}));
    });
  });

  it('produces unique (source_event_id, occurrence_id) keys across the fixture', () => {
    const keys = sampleFeed.map((raw) => {
      const { event } = normalizeHappeningItem(happeningItemSchema.parse(raw));
      return `${event.sourceEventId}/${event.occurrenceId}`;
    });
    expect(new Set(keys).size).toBe(keys.length);
  });
});
