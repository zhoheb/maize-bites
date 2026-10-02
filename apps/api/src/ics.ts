import { effectiveEnd, type FoodEvent } from '@maize-bites/shared';

// Minimal RFC 5545 calendar with one VEVENT, for "add to calendar".

const CRLF = '\r\n';

/** 20261001T160000Z */
function formatUtc(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

/** TEXT value escaping (RFC 5545 §3.3.11). */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/** Folds a content line to at most 75 octets per physical line (RFC 5545 §3.1), never splitting a character. */
export function foldLine(line: string): string {
  const out: string[] = [];
  let current = '';
  let bytes = 0;
  for (const char of line) {
    const size = Buffer.byteLength(char);
    // Continuation lines start with a space, which counts toward their 75.
    const limit = out.length === 0 ? 75 : 74;
    if (bytes + size > limit) {
      out.push(current);
      current = '';
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  out.push(current);
  return out.join(`${CRLF} `);
}

function location(event: FoodEvent): string | null {
  const place = event.building?.name ?? event.locationName;
  if (!place) return null;
  return event.room && event.building ? `${place}, ${event.room}` : place;
}

function description(event: FoodEvent): string {
  const parts: string[] = [];
  if (event.foodItems.length > 0) parts.push(`Free food: ${event.foodItems.join(', ')}`);
  if (event.audience === 'members') parts.push('Members only.');
  if (event.audience === 'rsvp') parts.push('RSVP required.');
  if (event.description) parts.push(event.description);
  if (event.url) parts.push(`Details: ${event.url}`);
  parts.push('Via Maize Bites. Food availability is not guaranteed.');
  return parts.join('\n\n');
}

export function buildIcs(event: FoodEvent, { now }: { now: Date }): string {
  const where = location(event);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Maize Bites//Free food at UMich//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.id}@maizebites`,
    `DTSTAMP:${formatUtc(now)}`,
    `DTSTART:${formatUtc(new Date(event.startsAt))}`,
    `DTEND:${formatUtc(effectiveEnd(event))}`,
    `SUMMARY:${escapeText(event.title)}`,
    ...(where ? [`LOCATION:${escapeText(where)}`] : []),
    ...(event.lat !== null && event.lng !== null ? [`GEO:${event.lat};${event.lng}`] : []),
    `DESCRIPTION:${escapeText(description(event))}`,
    ...(event.url ? [`URL:${event.url}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(foldLine).join(CRLF) + CRLF;
}
