// Time-zone math with Intl only (works in Node and browsers, no tz database dependency).

/** Campus events and the UI use Ann Arbor time. */
export const CAMPUS_TIME_ZONE = 'America/Detroit';

export interface WallTime {
  year: number;
  /** 1-12 */
  month: number;
  day: number;
  hour?: number;
  minute?: number;
  second?: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

type Field = 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second';

/** Wall-clock fields of `date` as seen in `timeZone`. */
export function wallTimeOf(date: Date | number, timeZone: string): Required<WallTime> {
  const parts = formatterFor(timeZone).formatToParts(date);
  const read = (type: Field) => Number(parts.find((p) => p.type === type)?.value);
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    second: read('second'),
  };
}

function offsetMs(utcMs: number, timeZone: string): number {
  const w = wallTimeOf(utcMs, timeZone);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** The instant a wall-clock time occurs in `timeZone`. Throws RangeError for an unknown zone. */
export function wallTimeToUtc(wall: WallTime, timeZone: string): Date {
  const { year, month, day, hour = 0, minute = 0, second = 0 } = wall;
  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  // Two passes settle the offset, including on DST transition days.
  let utc = wallAsUtc - offsetMs(wallAsUtc, timeZone);
  utc = wallAsUtc - offsetMs(utc, timeZone);
  return new Date(utc);
}

/** Local midnight at the start of the day after `date`'s local day. */
export function startOfNextLocalDay(date: Date, timeZone: string = CAMPUS_TIME_ZONE): Date {
  const { year, month, day } = wallTimeOf(date, timeZone);
  // Date.UTC normalizes day overflow (Oct 32 → Nov 1).
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return wallTimeToUtc(
    { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() },
    timeZone,
  );
}
