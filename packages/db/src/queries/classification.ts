import { PUBLISH_CONFIDENCE, REVIEW_CONFIDENCE } from '@maize-bites/shared';
import {
  and,
  asc,
  count,
  eq,
  exists,
  gt,
  gte,
  isNull,
  lt,
  ne,
  not,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { Database } from '../client.js';
import {
  classifications,
  events,
  reports,
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

export type ClassifierMode = 'llm' | 'rules';

/**
 * Whether the newest rules row for the outer event's current content was written in rules mode.
 * NULL when the content has no rules row at all.
 */
const newestRulesRowIsRulesMode = sql<boolean | null>`(
  select c.rules_mode from ${classifications} c
  where c.event_id = ${events.id} and c.content_hash = ${events.contentHash} and c.method = 'rules'
  order by c.created_at desc limit 1
)`;

/**
 * Live events whose current content the rules stage still has to judge in the given mode.
 *
 * - llm mode: no prefilter row yet, or a rules-mode verdict was written since. Writing the
 *   prefilter row again puts the event back on the LLM's path, so rules-mode rows never block it.
 * - rules mode: no rules-mode verdict yet, or a prefilter row was written since. Content the
 *   LLM has already judged is left alone: its verdict is the better one.
 */
export function listEventsNeedingRules(
  db: Database,
  now: Date,
  mode: ClassifierMode = 'llm',
): Promise<EventRow[]> {
  return db
    .select()
    .from(events)
    .where(
      and(
        liveEvent(now),
        mode === 'llm'
          ? sql`${newestRulesRowIsRulesMode} is distinct from false`
          : and(
              sql`${newestRulesRowIsRulesMode} is distinct from true`,
              not(hasClassificationForCurrentContent(db, eq(classifications.method, 'llm'))),
            ),
      ),
    )
    .orderBy(asc(events.startsAt), asc(events.id));
}

/**
 * Live events the llm-mode prefilter flagged as candidates for their current content that
 * still need an LLM verdict: no llm or manual row for this content, and not flagged for review.
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
          eq(classifications.rulesMode, false),
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

/**
 * Forgets every rules-mode verdict, so the next rules-mode pass judges all live events again.
 * For after editing the rules-mode vocabulary: verdicts are otherwise made once per content
 * version. LLM and manual verdicts are untouched. Returns how many rows were removed.
 */
export async function clearRulesModeVerdicts(db: Database): Promise<number> {
  const deleted = await db
    .delete(classifications)
    .where(and(eq(classifications.method, 'rules'), eq(classifications.rulesMode, true)))
    .returning({ id: classifications.id });
  return deleted.length;
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

/** Marks every open flag on an event as handled. Returns how many were open. */
export async function resolveReviewFlags(db: Database, eventId: string, at: Date): Promise<number> {
  const rows = await db
    .update(reviewFlags)
    .set({ resolvedAt: at })
    .where(and(eq(reviewFlags.eventId, eventId), isNull(reviewFlags.resolvedAt)))
    .returning({ id: reviewFlags.id });
  return rows.length;
}

export interface ReviewQueueItem {
  event: EventRow;
  /** The active classification, if any. */
  classification: ClassificationRow | null;
  /** Set when the classifier failed on this content. */
  flag: ReviewFlagRow | null;
  /** "Wrong audience" reports made after the active classification. */
  wrongAudienceReports: number;
}

/**
 * Live events a human should look at: an unresolved flag on the current content; an active
 * machine verdict of free food with REVIEW_CONFIDENCE <= confidence < PUBLISH_CONFIDENCE; or an
 * approved community tip the LLM thinks has no free food. A manual verdict settles an event.
 * Separately, any live event with "wrong audience" reports newer than its active verdict, manual
 * or not: a new manual verdict (an audience override) settles those.
 */
export async function listReviewQueue(db: Database, now: Date): Promise<ReviewQueueItem[]> {
  const active = activeClassificationLateral(db);
  const wrongAudience = db
    .select({ n: count().as('n') })
    .from(reports)
    .where(
      and(
        eq(reports.eventId, events.id),
        eq(reports.kind, 'wrong_audience'),
        sql`${reports.createdAt} > coalesce(${active.createdAt}, '-infinity'::timestamptz)`,
      ),
    )
    .as('wrong_audience');

  const rows = await db
    .select()
    .from(events)
    .leftJoinLateral(active, sql`true`)
    .leftJoinLateral(wrongAudience, sql`true`)
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
        or(
          gt(wrongAudience.n, 0),
          and(
            or(isNull(active.method), ne(active.method, 'manual')),
            or(
              sql`${reviewFlags.id} is not null`,
              and(
                ne(events.source, 'submission'),
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
        ),
      ),
    )
    .orderBy(asc(events.startsAt), asc(events.id));

  return rows.map((r) => ({
    event: r.events,
    classification: r.active,
    flag: r.review_flags,
    wrongAudienceReports: r.wrong_audience?.n ?? 0,
  }));
}

// ---------------------------------------------------------------------------
// Audience backfill
// ---------------------------------------------------------------------------

/** Active events that haven't ended, each with its active classification (null if none). */
export async function listLiveEventsWithActiveClassification(
  db: Database,
  now: Date,
): Promise<{ event: EventRow; classification: ClassificationRow | null }[]> {
  const active = activeClassificationLateral(db);
  const rows = await db
    .select()
    .from(events)
    .leftJoinLateral(active, sql`true`)
    .where(liveEvent(now))
    .orderBy(asc(events.startsAt), asc(events.id));
  return rows.map((r) => ({ event: r.events, classification: r.active }));
}

/**
 * Rewrites the audience of one machine classification in place. Manual rows are never touched:
 * the update matches only non-manual methods. Returns whether a row changed.
 */
export async function setMachineAudience(
  db: Database,
  classificationId: string,
  audience: {
    audience: NonNullable<ClassificationRow['audience']>;
    audienceEvidence: string | null;
  },
): Promise<boolean> {
  const rows = await db
    .update(classifications)
    .set(audience)
    .where(and(eq(classifications.id, classificationId), ne(classifications.method, 'manual')))
    .returning({ id: classifications.id });
  return rows.length > 0;
}
