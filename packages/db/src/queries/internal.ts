// Query fragments shared across queries/*. Not exported from the package.
import { DEFAULT_EVENT_DURATION_MS } from '@maize-bites/shared';
import { and, desc, eq, or, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import { classifications, events } from '../schema.js';

/** SQL mirror of `effectiveEnd` in @maize-bites/shared. */
export const effectiveEnd = sql`coalesce(${events.endsAt}, ${events.startsAt} + make_interval(secs => ${DEFAULT_EVENT_DURATION_MS / 1000}))`;

// Comparing a raw sql expression to a Date binds the Date unencoded, which postgres-js
// rejects (PGlite accepts it). Encode through a timestamp column instead.
export const timestampParam = (value: Date) => sql.param(value, events.startsAt);

/**
 * A classification is a candidate if it is manual (manual always wins, whatever content it
 * was made against) or was made against the event's current content_hash.
 */
export const isActiveCandidate = or(
  eq(classifications.method, 'manual'),
  eq(classifications.contentHash, events.contentHash),
);

/** Manual first, then newest; same-instant ties go to the stronger method (llm over rules). */
export const activeCandidateOrder = [
  desc(sql`${classifications.method} = 'manual'`),
  desc(classifications.createdAt),
  desc(sql`${classifications.method} = 'llm'`),
];

/** Lateral subquery yielding the active classification of the outer `events` row. */
export function activeClassificationLateral(db: Database) {
  return db
    .select()
    .from(classifications)
    .where(and(eq(classifications.eventId, events.id), isActiveCandidate))
    .orderBy(...activeCandidateOrder)
    .limit(1)
    .as('active');
}
