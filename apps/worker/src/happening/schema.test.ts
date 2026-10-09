import { describe, expect, it } from 'vitest';
import { happeningItemSchema, happeningPageSchema } from './schema.js';

// The captured feed is checked in normalize.test.ts; these cover what the schema rejects.
const MINIMAL = {
  id: '150244-21908461',
  datetime_start: '20260923T100000',
  datetime_end: '',
  has_end_time: 0,
  time_zone: 'America/Detroit',
  event_title: 'Coffee Hour',
};

const rejects = (override: Record<string, unknown>) =>
  !happeningItemSchema.safeParse({ ...MINIMAL, ...override }).success;

describe('happeningItemSchema', () => {
  it('accepts the minimal item and defaults tags and sponsors to empty', () => {
    const item = happeningItemSchema.parse(MINIMAL);
    expect(item.tags).toEqual([]);
    expect(item.sponsors).toEqual([]);
  });

  it('accepts null for optional text fields', () => {
    const item = happeningItemSchema.parse({ ...MINIMAL, description: null, room: null });
    expect(item.description).toBeNull();
  });

  it('requires an "<eventId>-<occurrenceId>" id', () => {
    for (const id of ['150244', '150244-', '-21908461', 'abc-1', '1-2-3', 150244]) {
      expect(rejects({ id })).toBe(true);
    }
  });

  it('requires feed-format datetimes, allowing an empty end', () => {
    expect(rejects({ datetime_start: '2026-09-23T10:00:00' })).toBe(true);
    expect(rejects({ datetime_start: '' })).toBe(true);
    expect(rejects({ datetime_end: '2026-09-23' })).toBe(true);
    expect(rejects({ datetime_end: '20260923T110000' })).toBe(false);
  });

  it('rejects items missing a required field', () => {
    for (const key of Object.keys(MINIMAL)) {
      const { [key]: _omitted, ...rest } = MINIMAL as Record<string, unknown>;
      expect(happeningItemSchema.safeParse(rest).success, key).toBe(false);
    }
  });

  it('rejects wrongly typed tags and sponsors', () => {
    expect(rejects({ tags: 'Food' })).toBe(true);
    expect(rejects({ tags: [1] })).toBe(true);
    expect(rejects({ sponsors: [{ group_name: 7 }] })).toBe(true);
  });
});

describe('happeningPageSchema', () => {
  it('accepts any array and leaves item validation to the caller', () => {
    expect(happeningPageSchema.parse([MINIMAL, 'junk', null])).toHaveLength(3);
  });

  it('rejects a non-array body, such as an error object or HTML', () => {
    expect(happeningPageSchema.safeParse({ error: 'nope' }).success).toBe(false);
    expect(happeningPageSchema.safeParse('<html>').success).toBe(false);
  });
});
