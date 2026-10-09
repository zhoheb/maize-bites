import { computeContentHash } from '@maize-bites/db';
import { describe, expect, it } from 'vitest';
import { maizepagesIcs, maizepagesRss } from '../../test/fixture.js';
import { normalizeMaizepagesItem } from './normalize.js';
import { readIcsFeed } from './read-ics.js';
import { readRssFeed } from './read-rss.js';
import { maizepagesItemSchema, type MaizepagesItem } from './schema.js';

const icsItems = readIcsFeed(maizepagesIcs).map((raw) => maizepagesItemSchema.parse(raw));
const byId = (id: string): MaizepagesItem => {
  const item = icsItems.find((i) => i.id === id);
  if (!item) throw new Error(`fixture has no event ${id}`);
  return item;
};

describe('normalizeMaizepagesItem', () => {
  it('maps a known event field by field', () => {
    const item = byId('12768062');
    const { event, locationCandidates } = normalizeMaizepagesItem(item);

    expect(event).toMatchObject({
      source: 'maizepages',
      sourceEventId: '12768062',
      occurrenceId: '0',
      title: '34th Annual Women in Leadership Conference',
      startsAt: new Date('2026-10-09T12:00:00.000Z'), // 8:00 AM EDT
      endsAt: new Date('2026-10-09T21:00:00.000Z'),
      locationName: 'Blau Colloquium',
      room: null,
      url: 'https://maizepages.umich.edu/event/12768062',
      sponsor: 'Organizer One Hundred Seven',
      tags: ['GroupBusiness'],
      status: 'active',
      maizepagesEventId: '12768062',
    });
    expect(event.description).toMatch(/^PURCHASE YOUR TICKETS/);
    expect(event.raw).toBe(item);
    expect(locationCandidates).toEqual(['Blau Colloquium']);
    expect(computeContentHash(event)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('normalizes every item from both feeds', () => {
    const rssItems = readRssFeed(maizepagesRss).items.map((raw) => maizepagesItemSchema.parse(raw));
    for (const item of [...icsItems, ...rssItems]) {
      const { event } = normalizeMaizepagesItem(item);
      expect(event.sourceEventId).toBe(item.id);
      const endsAt = event.endsAt ?? null;
      expect(endsAt === null || endsAt >= event.startsAt).toBe(true);
    }
  });

  it('keeps coordinates in Ann Arbor and drops them elsewhere', () => {
    const onCampus = normalizeMaizepagesItem(byId('12659229')).event;
    expect(onCampus).toMatchObject({ lat: 42.27667, lng: -83.73637 });

    // "15s Match @ Notre Dame" is geocoded to South Bend.
    const away = normalizeMaizepagesItem(byId('12458848')).event;
    expect(byId('12458848').geo).toMatchObject({ lat: 41.70555 });
    expect(away).toMatchObject({ lat: null, lng: null });
    expect(away.locationName).not.toBeNull();
  });

  it('marks cancelled events cancelled', () => {
    const cancelled = icsItems.filter((i) => i.status === 'cancelled');
    expect(cancelled).toHaveLength(4);
    for (const item of cancelled)
      expect(normalizeMaizepagesItem(item).event.status).toBe('cancelled');
  });

  it('handles edge cases: bad end, blank fields, a link as the location', () => {
    const base = byId('12659229');
    const { event, locationCandidates } = normalizeMaizepagesItem({
      ...base,
      title: '  ',
      description: ' ',
      endsAt: '2026-10-09T10:00:00.000Z',
      location: 'https://umich.zoom.us/j/123',
      hosts: ['Club A', 'Club B'],
      geo: null,
    });
    expect(event).toMatchObject({
      title: '(untitled event)',
      description: null,
      endsAt: null,
      locationName: 'https://umich.zoom.us/j/123',
      sponsor: 'Club A, Club B',
      lat: null,
      lng: null,
    });
    expect(locationCandidates).toEqual([]);
  });
});
