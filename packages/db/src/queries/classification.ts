import { PUBLISH_CONFIDENCE, REVIEW_CONFIDENCE } from '@maize-bites/shared';
import { and, asc, eq, exists, gte, isNull, lt, ne, not, or, sql, type SQL } from 'drizzle-orm';
import type { Database } from '../client.js';
import {
  classifications,
  events,
  reviewFlags,
  type ClassificationRow,
  type EventRow,
  type NewClassificationRow,
  type ReviewFlagRow,
} from '../schema.js';
import { activeClassificationLateral, effectiveEnd, timestampParam } from './internal.js';

/** Correlated EXISTS: a classification of the outer event's current content matching `conditions`. */
const hasClassificationForCurrentContent = (db: Database, ...conditions: SQL[]) =>
  exists(
    db
      .select({ one: sql`1` })
      .from(classifications)
      .where(
        and(
          eq(classifications.eventId, events.id),
          eq(classifications.contentHash, events.contentHash),
          ...conditions,
        ),
      ),
  );

/** Active events that haven't ended by `now`. Past events aren't worth classifying. */
const liveEvent = (now: Date) =>
  and(eq(events.status, 'active'), gte(effectiveEnd, timestampParam(now)));

/** Live events whose current content has no rules verdict yet. */
export function listEventsNeedingRules(db: Database, now: Date): Promise<EventRow[]> {
  return db
    .select()
    .from(events)
    .where(
      and(
        liveEvent(now),
        not(hasClassificationForCurrentContent(db, eq(classifications.method, 'rules'))),
      ),
    )
    .orderBy(asc(events.startsAt), asc(events.id));
}

/**
 * Live events the rules flagged as candidates for their current content that still need an
 * LLM verdict: no llm or manual row for this content, and not flagged for review.
 * Soonest first, so a per-run cap spends calls on the most time-sensitive events.
 */
export function listLlmCandidates(db: Database, now: Date): Promise<EventRow[]> {
  return db
    .select()
    .from(events)
    .where(
      and(
        liveEvent(now),
        hasClassificationForCurrentContent(
          db,
          eq(classifications.method, 'rules'),
          eq(classifications.hasFreeFood, true),
        ),
        not(hasClassificationForCurrentContent(db, ne(classifications.method, 'rules'))),
        not(
          exists(
            db
              .select({ one: sql`1` })
              .from(reviewFlags)
              .where(
                and(
                  eq(reviewFlags.eventId, events.id),
                  eq(reviewFlags.contentHash, events.contentHash),
                ),
              ),
          ),
        ),
      ),
    )
    .orderBy(asc(events.startsAt), asc(events.id));
}

export async function recordClassification(
  db: Database,
  row: NewClassificationRow,
): Promise<ClassificationRow> {
  const [inserted] = await db.insert(classifications).values(row).returning();
  if (!inserted) throw new Error('insert returned no row');
  return inserted;
}

/** Flags an event version for a human. Re-flagging the same version updates the reason. */
export async function flagForReview(
  db: Database,
  flag: { eventId: string; contentHash: string; reason: string; detail?: string | null },
): Promise<void> {
  await db
    .insert(reviewFlags)
    .values({ ...flag, detail: flag.detail ?? null })
    .onConflictDoUpdate({
      target: [reviewFlags.eventId, reviewFlags.contentHash],
      set: { reason: flag.reason, detail: flag.detail ?? null, resolvedAt: null },
    });
}

export interface ReviewQueueItem {
  event: EventRow;
  /** The active classification, if any. */
  classification: ClassificationRow | null;
  /** Set when the classifier failed on this content. */
  flag: ReviewFlagRow | null;
}

/**
 * Live events a human should look at: an unresolved flag on the current content; an active
 * machine verdict of free food with REVIEW_CONFIDENCE <= confidence < PUBLISH_CONFIDENCE; or an
 * approved community tip the LLM thinks has no free food. A manual verdict settles an event.
 */
export async function listReviewQueue(db: Database, now: Date): Promise<ReviewQueueItem[]> {
  const active = activeClassificationLateral(db);

  const rows = await db
    .select()
    .from(events)
    .leftJoinLateral(active, sql`true`)
    .leftJoin(
      reviewFlags,
      and(
        eq(reviewFlags.eventId, events.id),
        eq(reviewFlags.contentHash, events.contentHash),
        isNull(reviewFlags.resolvedAt),
      ),
    )
    .where(
      and(
        liveEvent(now),
        or(isNull(active.method), ne(active.method, 'manual')),
        or(
          sql`${reviewFlags.id} is not null`,
          and(
            eq(events.source, 'happening'),
            eq(active.hasFreeFood, true),
            gte(active.confidence, REVIEW_CONFIDENCE),
            lt(active.confidence, PUBLISH_CONFIDENCE),
          ),
          and(
            eq(events.source, 'submission'),
            eq(active.method, 'llm'),
            eq(active.hasFreeFood, false),
          ),
        ),
      ),
    )
    .orderBy(asc(events.startsAt), asc(events.id));

  return rows.map((r) => ({ event: r.events, classification: r.active, flag: r.review_flags }));
}
