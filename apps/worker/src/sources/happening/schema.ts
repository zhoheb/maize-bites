import { z } from 'zod';

// Shape of one item in https://events.umich.edu/list/json?v=2, derived from
// fixtures/happening-sample.json (captured 2026-09-30). Loose: unknown fields pass through
// (and are kept in events.raw); only fields the normalizer reads are declared.
// Note: the feed has no coordinates. The closest thing is campus_maps_link, a map URL.

/** Local wall-clock time in `time_zone`, e.g. 20260923T100000. */
export const FEED_DATETIME = /^\d{8}T\d{6}$/;

const text = z.string().nullish();

export const happeningItemSchema = z.looseObject({
  /** "<eventId>-<occurrenceId>" */
  id: z.string().regex(/^\d+-\d+$/),
  datetime_start: z.string().regex(FEED_DATETIME),
  /** Empty string when has_end_time is 0. */
  datetime_end: z.union([z.string().regex(FEED_DATETIME), z.literal('')]),
  has_end_time: z.number().int(),
  time_zone: z.string().min(1),
  event_title: z.string(),
  combined_title: text,
  description: text,
  occurrence_notes: text,
  permalink: text,
  website: text,
  building_name: text,
  location_name: text,
  room: text,
  tags: z.array(z.string()).default([]),
  sponsors: z.array(z.looseObject({ group_name: text })).default([]),
  /** Present when Happening imported the event from Maize Pages. */
  maizepages_import: z
    .looseObject({
      maizepages_group_name: text,
      maizepages_event_id: z.union([z.number().int(), z.string()]).nullish(),
    })
    .optional(),
  /** Extra links; only read to spot a Maize Pages event URL. Any other shape is ignored. */
  links: z.array(z.unknown()).optional().catch(undefined),
});
export type HappeningItem = z.infer<typeof happeningItemSchema>;

/** A page is an array; items are validated one at a time so one bad item doesn't sink the run. */
export const happeningPageSchema = z.array(z.unknown());
