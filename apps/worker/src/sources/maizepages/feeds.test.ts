import { describe, expect, it } from 'vitest';
import { maizepagesIcs, maizepagesRss } from '../../test/fixture.js';
import { readIcsFeed } from './read-ics.js';
import { descriptionFromHtml, readRssFeed } from './read-rss.js';
import { maizepagesItemSchema, type MaizepagesItem } from './schema.js';

const parseAll = (items: unknown[]): MaizepagesItem[] =>
  items.map((item) => maizepagesItemSchema.parse(item));

describe('readIcsFeed against the captured feed', () => {
  const items = parseAll(readIcsFeed(maizepagesIcs));

  it('reads all 27 events into valid items', () => {
    expect(items).toHaveLength(27);
    expect(new Set(items.map((i) => i.id)).size).toBe(27);
    expect(items.every((i) => i.format === 'ics')).toBe(true);
  });

  it('maps a known event field by field', () => {
    const { description, ...rest } = items[0] ?? {};
    expect(rest).toEqual({
      format: 'ics',
      id: '12659229',
      title: 'CoPhie - special event',
      startsAt: '2026-10-09T16:30:00.000Z',
      endsAt: '2026-10-09T17:30:00.000Z',
      location: 'Neal Lab',
      url: 'https://maizepages.umich.edu/event/12659229',
      categories: ['Cultural'],
      hosts: [],
      status: 'confirmed',
      geo: { lat: 42.27667, lng: -83.73637 },
    });
    // Unfolded across lines, with the escaped line breaks restored.
    expect(description).toMatch(
      /^Cophie \(University of Michigan Community of Physicists for Inclusion and Equity\) invites you/,
    );
    expect(description).toMatch(
      /\nWe meet biweekly on Fridays 12:30-1:30 at Neal Lab second floor fish bowl\.$/,
    );
  });

  it('strips the "Hosted by" and "Additional Information" lines Engage appends', () => {
    for (const item of items) {
      expect(item.description ?? '').not.toMatch(/Hosted by:/);
      expect(item.description ?? '').not.toMatch(/Additional Information can be found at/);
    }
  });

  it('collects hosts, repeated CATEGORIES lines, statuses, and coordinates', () => {
    const wilc = items.find((i) => i.id === '12768062');
    expect(wilc?.hosts).toEqual(['Organizer One Hundred Seven']);
    expect(items.some((i) => i.categories.length > 1)).toBe(true);
    expect(items.filter((i) => i.status === 'cancelled')).toHaveLength(4);
    expect(items.filter((i) => i.geo !== null)).toHaveLength(17);
  });

  it('passes an unreadable event through so validation can report it', () => {
    const [item] = readIcsFeed(
      'BEGIN:VCALENDAR\nBEGIN:VEVENT\nSUMMARY:No id\nDTSTART:tomorrow\nEND:VEVENT\nEND:VCALENDAR',
    );
    expect(item).toMatchObject({ id: null, startsAt: 'tomorrow', url: null });
    expect(maizepagesItemSchema.safeParse(item).success).toBe(false);
  });
});

describe('readRssFeed against the captured feed', () => {
  const feed = readRssFeed(maizepagesRss);
  const items = parseAll(feed.items);

  it('reads the ttl and all 27 events into valid items', () => {
    expect(feed.ttlMinutes).toBe(300);
    expect(items).toHaveLength(27);
    expect(items.every((i) => i.format === 'rss' && i.geo === null)).toBe(true);
  });

  it('maps a known event field by field', () => {
    const wilc = items.find((i) => i.id === '12768062');
    expect(wilc).toMatchObject({
      title: '34th Annual Women in Leadership Conference',
      startsAt: '2026-10-09T12:00:00.000Z',
      endsAt: '2026-10-09T21:00:00.000Z',
      location: 'Blau Colloquium',
      url: 'https://maizepages.umich.edu/event/12768062',
      categories: ['GroupBusiness'],
      hosts: ['Organizer One Hundred Seven'],
      status: 'confirmed',
    });
    expect(wilc?.description).toMatch(
      /^PURCHASE YOUR TICKETS HERE\nMichigan Business Women at Ross/,
    );
    expect(wilc?.description).toContain('This year’s theme, Answer the Call, challenges us');
    expect(wilc?.description).not.toMatch(/<|&nbsp;|&rsquo;/);
  });

  it('takes the host name from <host> and never the organizer email from <author>', () => {
    expect(maizepagesRss).toMatch(/<author>organizer@example\.edu \(/);
    for (const item of feed.items) expect(item).not.toHaveProperty('author');
    expect(items.flatMap((i) => i.hosts).join(' ')).not.toContain('@');
  });

  it('agrees with the ICS feed on ids, times, locations, and statuses', () => {
    const ics = parseAll(readIcsFeed(maizepagesIcs));
    const pick = (i: MaizepagesItem) => [i.id, i.startsAt, i.endsAt, i.location, i.status];
    expect(items.map(pick)).toEqual(ics.map(pick));
  });

  it('throws on something that is not RSS', () => {
    expect(() => readRssFeed('<html>Just a moment...</html>')).toThrow(/Not an RSS document/);
  });
});

describe('descriptionFromHtml', () => {
  it('turns paragraphs and breaks into lines and decodes entities', () => {
    expect(
      descriptionFromHtml(
        '<div class="h-event"><div class="p-description description"><p>Free&nbsp;pizza &amp; pop</p><p>Bring<br/>a friend</p></div>\n  <div><p>From …</p></div></div>',
      ),
    ).toBe('Free pizza & pop\nBring\na friend');
  });

  it('is null when there is no description block', () => {
    expect(descriptionFromHtml(null)).toBeNull();
    expect(descriptionFromHtml('<p>plain</p>')).toBeNull();
  });
});
