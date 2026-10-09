import { decodeHtmlEntities } from '../html.js';
import { eventIdFromUrl } from './schema.js';

// Reads the one RSS document Maize Pages serves at /events.rss. This is not a general XML
// parser: it knows the handful of flat elements Engage puts in each <item> and nothing else.

function element(xml: string, name: string): string | null {
  const match = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`).exec(xml);
  if (!match?.[1]) return null;
  const cdata = /^\s*<!\[CDATA\[([\s\S]*)\]\]>\s*$/.exec(match[1]);
  const value = cdata?.[1] ?? decodeHtmlEntities(match[1]);
  return value.trim() === '' ? null : value.trim();
}

function elements(xml: string, name: string): string[] {
  return [...xml.matchAll(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'g'))]
    .map((m) => decodeHtmlEntities(m[1] ?? '').trim())
    .filter((v) => v !== '');
}

/** The listing text from Engage's h-event markup, as plain text with paragraph breaks. */
export function descriptionFromHtml(html: string | null): string | null {
  if (html === null) return null;
  const body = /<div class="p-description description">([\s\S]*?)<\/div>\s*<div>/.exec(html)?.[1];
  if (body === undefined) return null;
  const plain = decodeHtmlEntities(
    body
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/[ \t\u200b]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
  return plain === '' ? null : plain;
}

function instant(value: string | null): string | null {
  if (value === null) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? value : new Date(ms).toISOString();
}

export interface RssFeed {
  /** The channel's <ttl> in minutes: how long the feed asks readers to wait between fetches. */
  ttlMinutes: number | null;
  /** Raw items in the shape maizepagesItemSchema validates. */
  items: unknown[];
}

/** Throws if the text isn't an RSS document. */
export function readRssFeed(body: string): RssFeed {
  if (!/<rss[\s>]/.test(body) || !body.includes('<channel>'))
    throw new Error('Not an RSS document (no <rss><channel>)');
  const [channelHead = '', ...rawItems] = body.split('<item>');
  const ttl = Number(element(channelHead, 'ttl'));

  const items = rawItems.map((raw) => {
    const xml = raw.split('</item>')[0] ?? raw;
    const url = element(xml, 'link') ?? element(xml, 'guid');
    const host = element(xml, 'host');
    return {
      format: 'rss',
      id: eventIdFromUrl(url) ?? eventIdFromUrl(element(xml, 'guid')),
      title: element(xml, 'title'),
      description: descriptionFromHtml(element(xml, 'description')),
      startsAt: instant(element(xml, 'start')),
      endsAt: instant(element(xml, 'end')),
      location: element(xml, 'location'),
      url,
      categories: elements(xml, 'category'),
      // <author> also carries the organizer's email address; we deliberately don't read it.
      hosts: host === null ? [] : [host],
      status: element(xml, 'status')?.toLowerCase() ?? null,
      geo: null,
    };
  });
  return { ttlMinutes: Number.isInteger(ttl) && ttl > 0 ? ttl : null, items };
}
