import {
  FOOD_GONE_WINDOW_MS,
  PUBLISH_CONFIDENCE,
  type Bbox,
  type Campus,
  type DietaryTag,
  type MealType,
} from '@maize-bites/shared';
import {
  and,
  arrayContains,
  asc,
  between,
  count,
  eq,
  getTableColumns,
  gte,
  inArray,
  isNull,
  lte,
  ne,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { Database } from '../client.js';
import { computeContentHash } from '../content-hash.js';
import {
  activeCandidateOrder,
  activeClassificationLateral,
  effectiveEnd,
  isActiveCandidate,
  timestampParam,
} from './internal.js';
import {
  buildings,
  classifications,
  events,
  reports,
  type BuildingRow,
  type ClassificationRow,
  type EventRow,
  type NewEventRow,
} from '../schema.js';

// ---------------------------------------------------------------------------
// upsertEvent
// ---------------------------------------------------------------------------

export type UpsertEventInput = Omit<
  NewEventRow,
  'id' | 'contentHash' | 'firstSeenAt' | 'lastSeenAt'
>;
export type UpsertChange = 'created' | 'updated' | 'unchanged';

/** Columns replaced from the incoming row on conflict. Keys, id, and first_seen_at are kept. */
const upsertSet = Object.fromEntries(
  Object.entries(getTableColumns(events))
    .filter(
      ([key]) => !['id', 'source', 'sourceEventId', 'occurrenceId', 'firstSeenAt'].includes(key),
    )
    .map(([key, column]) => [key, sql.raw(`excluded."${column.name}"`)]),
);

/**
 * Idempotent insert-or-update keyed on (source, source_event_id, occurrence_id).
 * Computes content_hash, bumps last_seen_at, and replaces every other field, so omitted
 * optional fields are cleared and a previously removed event becomes active again.
 * `change` is 'unchanged' when the content hash matched, i.e. no re-classification needed.
 */
export function upsertEvent(
  db: Database,
  input: UpsertEventInput,
  seenAt: Date = new Date(),
): Promise<{ event: EventRow; change: UpsertChange }> {
  const contentHash = computeContentHash(input);

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ contentHash: events.contentHash })
      .from(events)
      .where(
        and(
          eq(events.source, input.source),
          eq(events.sourceEventId, input.sourceEventId),
          eq(events.occurrenceId, input.occurrenceId),
        ),
      )
      .for('update');

    const [event] = await tx
      .insert(events)
      // Omitted columns take their defaults in `excluded`, so the update clears them too.
      .values({
        ...input,
        contentHash,
        firstSeenAt: seenAt,
        lastSeenAt: seenAt,
      })
      .onConflictDoUpdate({
        target: [events.source, events.sourceEventId, events.occurrenceId],
        set: upsertSet,
      })
      .returning();
    if (!event) throw new Error('upsert returned no row');

    const change: UpsertChange =
      existing === undefined
        ? 'created'
        : existing.contentHash === contentHash
          ? 'unchanged'
          : 'updated';
    return { event, change };
  });
}

/** Any event by id, published or not. */
export async function getEvent(db: Database, id: string): Promise<EventRow | null> {
  const [row] = await db.select().from(events).where(eq(events.id, id));
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Active classification
// ---------------------------------------------------------------------------

export async function getActiveClassification(
  db: Database,
  eventId: string,
): Promise<ClassificationRow | null> {
  const [row] = await db
    .select(getTableColumns(classifications))
    .from(classifications)
    .innerJoin(events, eq(events.id, classifications.eventId))
    .where(and(eq(classifications.eventId, eventId), isActiveCandidate))
    .orderBy(...activeCandidateOrder)
    .limit(1);
  return row ?? null;
}

// ---------------------------------------------------------------------------
// listPublishedEvents
// ---------------------------------------------------------------------------

export interface EventCursor {
  startsAt: Date;
  id: string;
}

export interface PublishedEventFilters {
  /** Restrict to these event ids. */
  ids?: readonly string[] | undefined;
  /** Only events whose (effective) end is at or after this instant. */
  from?: Date | undefined;
  /** Only events starting at or before this instant. */
  to?: Date | undefined;
  /** Match the event's building campus. Events without a building are excluded. */
  campuses?: readonly Campus[] | undefined;
  /** Event must be tagged with every listed need. */
  dietary?: readonly DietaryTag[] | undefined;
  openOnly?: boolean | undefined;
  mealType?: MealType | undefined;
  /** Uses the event's own coordinates, falling back to its building's. */
  bbox?: Bbox | undefined;
  /** Keyset cursor: return events strictly after this (starts_at, id). */
  after?: EventCursor | undefined;
  /** Default 50. */
  limit?: number | undefined;
  /** Window start for `recentFoodGone`. Default: FOOD_GONE_WINDOW_MS before now. */
  reportsSince?: Date | undefined;
}

export interface PublishedEvent {
  event: EventRow;
  /** The active classification. Null for an approved tip the classifier hasn't read yet. */
  classification: ClassificationRow | null;
  building: BuildingRow | null;
  /** "Food's gone" reports since `reportsSince`. */
  recentFoodGone: number;
}

/**
 * The publish rule. An active event is published when:
 * - its active classification is a manual "free food" verdict (admins always win), or
 * - there's no manual verdict and it's an approved community tip (source = submission; the
 *   classifier only extracts details for these), or
 * - there's no manual verdict and the machine verdict is free food at >= PUBLISH_CONFIDENCE.
 * Ordered by (starts_at, id).
 */
export async function listPublishedEvents(
  db: Database,
  filters: PublishedEventFilters = {},
): Promise<{ items: PublishedEvent[]; nextCursor: EventCursor | null }> {
  const limit = filters.limit ?? 50;

  const active = activeClassificationLateral(db);

  const since = filters.reportsSince ?? new Date(Date.now() - FOOD_GONE_WINDOW_MS);
  const gone = db
    .select({ n: count().as('n') })
    .from(reports)
    .where(
      and(
        eq(reports.eventId, events.id),
        eq(reports.kind, 'food_gone'),
        gte(reports.createdAt, since),
      ),
    )
    .as('gone');

  const lat = sql`coalesce(${events.lat}, ${buildings.lat})`;
  const lng = sql`coalesce(${events.lng}, ${buildings.lng})`;
  const notManual = or(isNull(active.method), ne(active.method, 'manual'));

  const conditions: (SQL | undefined)[] = [
    eq(events.status, 'active'),
    or(
      and(eq(active.method, 'manual'), eq(active.hasFreeFood, true)),
      and(
        notManual,
        or(
          eq(events.source, 'submission'),
          and(eq(active.hasFreeFood, true), gte(active.confidence, PUBLISH_CONFIDENCE)),
        ),
      ),
    ),
    filters.ids && inArray(events.id, [...filters.ids]),
    filters.from && gte(effectiveEnd, timestampParam(filters.from)),
    filters.to && lte(events.startsAt, filters.to),
    filters.campuses?.length ? inArray(buildings.campus, [...filters.campuses]) : undefined,
    filters.dietary?.length ? arrayContains(active.dietary, [...filters.dietary]) : undefined,
    filters.openOnly ? eq(active.audience, 'open') : undefined,
    filters.mealType && eq(active.mealType, filters.mealType),
    filters.bbox && between(lat, filters.bbox.south, filters.bbox.north),
    filters.bbox && between(lng, filters.bbox.west, filters.bbox.east),
    filters.after &&
      sql`(${events.startsAt}, ${events.id}) > (${timestampParam(filters.after.startsAt)}, ${filters.after.id}::uuid)`,
  ];

  // Default selection (keyed by table/subquery alias): drizzle can't nest a subquery in a custom one.
  const rows = await db
    .select()
    .from(events)
    .leftJoinLateral(active, sql`true`)
    .leftJoinLateral(gone, sql`true`)
    .leftJoin(buildings, eq(buildings.id, events.buildingId))
    .where(and(...conditions))
    .orderBy(asc(events.startsAt), asc(events.id))
    .limit(limit + 1);

  const items = rows.slice(0, limit).map((r) => ({
    event: r.events,
    classification: r.active,
    building: r.buildings,
    recentFoodGone: r.gone?.n ?? 0,
  }));
  const last = items.at(-1);
  const nextCursor =
    rows.length > limit && last ? { startsAt: last.event.startsAt, id: last.event.id } : null;
  return { items, nextCursor };
}

/** One event if it is published (same rule as listPublishedEvents), regardless of time. */
export async function getPublishedEvent(
  db: Database,
  id: string,
  options: { reportsSince?: Date } = {},
): Promise<PublishedEvent | null> {
  const { items } = await listPublishedEvents(db, {
    ids: [id],
    limit: 1,
    reportsSince: options.reportsSince,
  });
  return items[0] ?? null;
}

// ---------------------------------------------------------------------------
// Retention
// ---------------------------------------------------------------------------

/**
 * Deletes events whose effective end is before `cutoff`, whatever their status. Their
 * classifications, reports, review flags, and notification log rows cascade; a submission keeps
 * its row with event_id set to null. The eval set (eval/labeled.json) embeds its own copy of each
 * event, so it doesn't depend on these rows. Returns the number of events deleted.
 */
export async function pruneEndedEvents(db: Database, cutoff: Date): Promise<number> {
  const deleted = await db
    .delete(events)
    .where(sql`${effectiveEnd} < ${timestampParam(cutoff)}`)
    .returning({ id: events.id });
  return deleted.length;
}
