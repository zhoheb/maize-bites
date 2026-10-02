import { wallTimeOf, wallTimeToUtc } from '@maize-bites/shared';
import { FEED_DATETIME } from './schema.js';

/**
 * Converts a feed wall-clock time (`20260923T100000`) in an IANA zone to a UTC Date.
 * Throws on malformed input or an unknown zone.
 */
export function parseFeedDateTime(value: string, timeZone: string): Date {
  if (!FEED_DATETIME.test(value)) {
    throw new Error(`Malformed feed datetime: ${JSON.stringify(value)}`);
  }
  const n = (from: number, to: number) => Number(value.slice(from, to));
  return wallTimeToUtc(
    {
      year: n(0, 4),
      month: n(4, 6),
      day: n(6, 8),
      hour: n(9, 11),
      minute: n(11, 13),
      second: n(13, 15),
    },
    timeZone,
  );
}

/** `YYYY-MM-DD` for `date` as seen in `timeZone`. */
export function localDate(date: Date, timeZone: string): string {
  const { year, month, day } = wallTimeOf(date, timeZone);
  const pad = (v: number) => String(v).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}`;
}
