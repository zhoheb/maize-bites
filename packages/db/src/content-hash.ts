import { createHash } from 'node:crypto';
import type { NewEventRow } from './schema.js';

export type ContentFields = Pick<
  NewEventRow,
  'title' | 'description' | 'startsAt' | 'endsAt' | 'locationName' | 'room'
>;

/**
 * Hash of the fields the classifier reads. A new hash means the event changed in a way
 * that needs re-classification; metadata like tags or last_seen_at does not count.
 */
export function computeContentHash(fields: ContentFields): string {
  const canonical = JSON.stringify([
    fields.title.trim(),
    fields.description?.trim() ?? null,
    fields.startsAt.toISOString(),
    fields.endsAt?.toISOString() ?? null,
    fields.locationName?.trim() ?? null,
    fields.room?.trim() ?? null,
  ]);
  return createHash('sha256').update(canonical).digest('hex');
}
