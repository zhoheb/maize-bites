import { z } from 'zod';

// One Maize Pages event as read from either feed. Both readers (ics.ts, rss.ts) produce this
// shape, and the normalizer validates it before anything is stored. Derived from the feeds as
// captured 2026-10-09 (fixtures/maizepages-sample.ics and .rss).

const isoInstant = z.iso.datetime({ offset: true });

export const maizepagesItemSchema = z.object({
  /** Which feed it came from. */
  format: z.enum(['ics', 'rss']),
  /** The number in https://maizepages.umich.edu/event/<id>. */
  id: z.string().regex(/^\d+$/),
  title: z.string(),
  description: z.string().nullable(),
  startsAt: isoInstant,
  endsAt: isoInstant.nullable(),
  location: z.string().nullable(),
  url: z.url(),
  /** Engage categories, e.g. "Social", "ThoughtfulLearning". */
  categories: z.array(z.string()),
  /** Host organization names. */
  hosts: z.array(z.string()),
  /** "confirmed", "cancelled", ... lowercased; null when the feed gave none. */
  status: z.string().nullable(),
  geo: z.object({ lat: z.number(), lng: z.number() }).nullable(),
});
export type MaizepagesItem = z.infer<typeof maizepagesItemSchema>;

const EVENT_URL = /maizepages\.umich\.edu\/event\/(\d+)/i;

/** The event number in a Maize Pages event URL, or null. */
export function eventIdFromUrl(url: string | null | undefined): string | null {
  return (url ? EVENT_URL.exec(url)?.[1] : null) ?? null;
}
