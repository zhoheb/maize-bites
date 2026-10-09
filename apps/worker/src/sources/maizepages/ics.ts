import { CAMPUS_TIME_ZONE, wallTimeToUtc } from '@maize-bites/shared';

// A minimal iCalendar (RFC 5545) reader: enough for a feed of plain VEVENTs. It unfolds lines,
// splits out each VEVENT's properties, and leaves recurrence rules, alarms, and timezone
// definitions alone. Maize Pages lists every occurrence as its own event with UTC times.

export interface IcsProperty {
  /** Uppercased, e.g. DTSTART. */
  name: string;
  /** Parameter names uppercased, e.g. { TZID: 'America/Detroit' }. */
  params: Record<string, string>;
  /** As written: still escaped. See unescapeIcsText. */
  value: string;
}

const PROPERTY = /^([A-Za-z0-9-]+)((?:;[^=;:]+=(?:"[^"]*"|[^;:]*))*):(.*)$/s;
const PARAM = /;([^=;:]+)=(?:"([^"]*)"|([^;:]*))/g;

function parseLine(line: string): IcsProperty | null {
  const match = PROPERTY.exec(line);
  if (!match) return null;
  const [, name = '', rawParams = '', value = ''] = match;
  const params: Record<string, string> = {};
  for (const [, key = '', quoted, bare] of rawParams.matchAll(PARAM))
    params[key.toUpperCase()] = quoted ?? bare ?? '';
  return { name: name.toUpperCase(), params, value };
}

/** The properties of each VEVENT, in file order. Throws if the text isn't a calendar. */
export function parseIcs(text: string): IcsProperty[][] {
  // A line break followed by a space or tab continues the previous line.
  const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  if (!lines.some((line) => line.trim().toUpperCase() === 'BEGIN:VCALENDAR'))
    throw new Error('Not an iCalendar document (no BEGIN:VCALENDAR)');

  const events: IcsProperty[][] = [];
  let current: IcsProperty[] | null = null;
  let nested = 0;
  for (const line of lines) {
    const upper = line.trim().toUpperCase();
    if (upper === 'BEGIN:VEVENT') {
      current = [];
    } else if (upper === 'END:VEVENT') {
      if (current) events.push(current);
      current = null;
      nested = 0;
    } else if (current) {
      // Skip components inside an event (VALARM and the like).
      if (upper.startsWith('BEGIN:')) nested += 1;
      else if (upper.startsWith('END:')) nested = Math.max(0, nested - 1);
      else if (nested === 0) {
        const property = parseLine(line);
        if (property) current.push(property);
      }
    }
  }
  return events;
}

/** Undoes TEXT escaping: `\n` → newline, `\,` `\;` `\\` → the bare character. */
export function unescapeIcsText(value: string): string {
  return value.replace(/\\([nN,;\\])/g, (_match, char: string) =>
    char === 'n' || char === 'N' ? '\n' : char,
  );
}

const DATE_TIME = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/;

/**
 * A DTSTART/DTEND value as an instant. `...Z` is UTC; otherwise the time is local to the TZID
 * parameter, or to campus when there is none. A bare date means local midnight.
 */
export function parseIcsDateTime(property: Pick<IcsProperty, 'value' | 'params'>): Date {
  const match = DATE_TIME.exec(property.value.trim());
  if (!match) throw new Error(`Malformed iCalendar date: ${JSON.stringify(property.value)}`);
  const part = (index: number) => Number(match[index] ?? 0);
  const wall = {
    year: part(1),
    month: part(2),
    day: part(3),
    hour: part(4),
    minute: part(5),
    second: part(6),
  };
  if (match[7] === 'Z') {
    return new Date(
      Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second),
    );
  }
  return wallTimeToUtc(wall, property.params['TZID'] ?? CAMPUS_TIME_ZONE);
}
