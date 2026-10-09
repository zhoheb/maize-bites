import { parseIcs, parseIcsDateTime, unescapeIcsText, type IcsProperty } from './ics.js';
import { eventIdFromUrl } from './schema.js';

/** Engage appends these two lines to every description; they are not part of the listing. */
const HOSTED_BY = /\n*Hosted by:[^\n]*/;
const MORE_INFO = /\n*Additional Information can be found at:\s*\S*\s*$/;

function first(properties: readonly IcsProperty[], name: string): IcsProperty | undefined {
  return properties.find((p) => p.name === name);
}

function text(properties: readonly IcsProperty[], name: string): string | null {
  const value = first(properties, name)?.value;
  const cleaned = value === undefined ? '' : unescapeIcsText(value).trim();
  return cleaned === '' ? null : cleaned;
}

/** Comma-separated TEXT values across every occurrence of a property. */
function list(properties: readonly IcsProperty[], name: string): string[] {
  return properties
    .filter((p) => p.name === name)
    .flatMap((p) => p.value.split(/(?<!\\),/))
    .map((v) => unescapeIcsText(v).trim())
    .filter((v) => v !== '');
}

function geo(properties: readonly IcsProperty[]): { lat: number; lng: number } | null {
  const [lat, lng] = (first(properties, 'GEO')?.value ?? '').split(';').map(Number);
  return lat !== undefined && lng !== undefined && Number.isFinite(lat) && Number.isFinite(lng)
    ? { lat, lng }
    : null;
}

/**
 * Raw items from /events.ics, one per VEVENT, in the shape maizepagesItemSchema validates.
 * An event that can't be read at all (no id, bad dates) is passed through as far as it got, so
 * the normalizer reports it instead of it silently vanishing.
 */
export function readIcsFeed(body: string): unknown[] {
  return parseIcs(body).map((properties) => {
    const url = text(properties, 'URL') ?? text(properties, 'UID');
    const instant = (name: string): string | null => {
      const property = first(properties, name);
      if (!property) return null;
      try {
        return parseIcsDateTime(property).toISOString();
      } catch {
        return property.value;
      }
    };
    const description = text(properties, 'DESCRIPTION')
      ?.replace(MORE_INFO, '')
      .replace(HOSTED_BY, '')
      .trim();
    return {
      format: 'ics',
      id: eventIdFromUrl(url) ?? eventIdFromUrl(text(properties, 'UID')),
      title: text(properties, 'SUMMARY'),
      description: description === undefined || description === '' ? null : description,
      startsAt: instant('DTSTART'),
      endsAt: instant('DTEND'),
      location: text(properties, 'LOCATION'),
      url,
      categories: list(properties, 'CATEGORIES'),
      hosts: list(properties, 'X-HOSTS'),
      status: text(properties, 'STATUS')?.toLowerCase() ?? null,
      geo: geo(properties),
    };
  });
}
