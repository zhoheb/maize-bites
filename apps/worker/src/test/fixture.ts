import { readFileSync } from 'node:fs';
import { happeningItemSchema, type HappeningItem } from '../happening/schema.js';

/** The raw captured response from events.umich.edu/list/json?v=2 (2026-09-30). */
export const sampleFeed: unknown[] = JSON.parse(
  readFileSync(new URL('../../fixtures/happening-sample.json', import.meta.url), 'utf8'),
) as unknown[];

export function sampleItem(id: string): HappeningItem {
  const raw = sampleFeed.find((item) => (item as { id?: unknown }).id === id);
  if (raw === undefined) throw new Error(`fixture has no item ${id}`);
  return happeningItemSchema.parse(raw);
}

/** First fixture item whose field matches. */
export function sampleItemWhere(predicate: (item: HappeningItem) => boolean): HappeningItem {
  for (const raw of sampleFeed) {
    const parsed = happeningItemSchema.safeParse(raw);
    if (parsed.success && predicate(parsed.data)) return parsed.data;
  }
  throw new Error('no fixture item matches');
}
