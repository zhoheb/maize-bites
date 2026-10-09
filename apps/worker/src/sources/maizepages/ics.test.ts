import { describe, expect, it } from 'vitest';
import { parseIcs, parseIcsDateTime, unescapeIcsText } from './ics.js';

const calendar = (...lines: string[]) =>
  ['BEGIN:VCALENDAR', 'VERSION:2.0', ...lines, 'END:VCALENDAR', ''].join('\r\n');

describe('parseIcs', () => {
  it('returns the properties of each VEVENT', () => {
    const events = parseIcs(
      calendar(
        'BEGIN:VEVENT',
        'SUMMARY:First',
        'UID:1',
        'END:VEVENT',
        'BEGIN:VEVENT',
        'SUMMARY:Second',
        'END:VEVENT',
      ),
    );
    expect(events).toEqual([
      [
        { name: 'SUMMARY', params: {}, value: 'First' },
        { name: 'UID', params: {}, value: '1' },
      ],
      [{ name: 'SUMMARY', params: {}, value: 'Second' }],
    ]);
  });

  it('unfolds continuation lines (space or tab, CRLF or LF)', () => {
    const [event] = parseIcs(
      'BEGIN:VCALENDAR\nBEGIN:VEVENT\nDESCRIPTION:Community of Physicists for Inc\n lusion and\n\t Equity\nEND:VEVENT\nEND:VCALENDAR\n',
    );
    expect(event?.[0]?.value).toBe('Community of Physicists for Inclusion and Equity');
  });

  it('reads parameters, quoted or bare, and keeps colons in the value', () => {
    const [event] = parseIcs(
      calendar(
        'BEGIN:VEVENT',
        'DTSTART;TZID=America/Detroit:20261009T123000',
        'ATTENDEE;CN="Doe, Jane";ROLE=CHAIR:mailto:organizer@example.edu',
        'URL:https://maizepages.umich.edu/event/1',
        'END:VEVENT',
      ),
    );
    expect(event).toEqual([
      { name: 'DTSTART', params: { TZID: 'America/Detroit' }, value: '20261009T123000' },
      {
        name: 'ATTENDEE',
        params: { CN: 'Doe, Jane', ROLE: 'CHAIR' },
        value: 'mailto:organizer@example.edu',
      },
      { name: 'URL', params: {}, value: 'https://maizepages.umich.edu/event/1' },
    ]);
  });

  it('ignores components nested in an event and properties outside one', () => {
    const [event, ...rest] = parseIcs(
      calendar(
        'X-WR-CALNAME:Outside',
        'BEGIN:VEVENT',
        'SUMMARY:Kept',
        'BEGIN:VALARM',
        'DESCRIPTION:Reminder',
        'END:VALARM',
        'END:VEVENT',
      ),
    );
    expect(event).toEqual([{ name: 'SUMMARY', params: {}, value: 'Kept' }]);
    expect(rest).toEqual([]);
  });

  it('returns no events for an empty calendar and throws on something else', () => {
    expect(parseIcs(calendar())).toEqual([]);
    expect(() => parseIcs('<html>Just a moment...</html>')).toThrow(/Not an iCalendar document/);
  });
});

describe('unescapeIcsText', () => {
  it('undoes TEXT escapes', () => {
    expect(unescapeIcsText('Pizza\\, salad\\; drinks\\nBring a friend \\\\o/')).toBe(
      'Pizza, salad; drinks\nBring a friend \\o/',
    );
  });
});

describe('parseIcsDateTime', () => {
  const at = (value: string, params: Record<string, string> = {}) =>
    parseIcsDateTime({ value, params }).toISOString();

  it('reads UTC, zoned, floating, and date-only values', () => {
    expect(at('20261009T163000Z')).toBe('2026-10-09T16:30:00.000Z');
    expect(at('20261009T123000', { TZID: 'America/Chicago' })).toBe('2026-10-09T17:30:00.000Z');
    // No zone: campus time (EDT in October, EST in January).
    expect(at('20261009T123000')).toBe('2026-10-09T16:30:00.000Z');
    expect(at('20270115T123000')).toBe('2027-01-15T17:30:00.000Z');
    expect(at('20261009')).toBe('2026-10-09T04:00:00.000Z');
  });

  it('throws on a malformed value or an unknown zone', () => {
    expect(() => at('2026-10-09T16:30:00Z')).toThrow(/Malformed iCalendar date/);
    expect(() => at('20261009T123000', { TZID: 'Mars/Olympus' })).toThrow(RangeError);
  });
});
