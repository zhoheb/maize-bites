import { CAMPUS_TIME_ZONE, wallTimeOf, wallTimeToUtc } from '@maize-bites/shared';

const pad = (n: number) => String(n).padStart(2, '0');

/** `YYYY-MM-DDTHH:MM` in Ann Arbor time, the value format of a datetime-local input. */
export function toCampusInput(date: Date): string {
  const w = wallTimeOf(date, CAMPUS_TIME_ZONE);
  return `${w.year}-${pad(w.month)}-${pad(w.day)}T${pad(w.hour)}:${pad(w.minute)}`;
}

/** The instant a datetime-local value names in Ann Arbor time, wherever the browser is. */
export function fromCampusInput(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  const [year = 0, month = 1, day = 1, hour = 0, minute = 0] = match.slice(1).map(Number);
  return wallTimeToUtc({ year, month, day, hour, minute }, CAMPUS_TIME_ZONE).toISOString();
}
