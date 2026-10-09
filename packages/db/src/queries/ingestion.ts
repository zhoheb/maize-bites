import type { EventSource } from '@maize-bites/shared';
import { and, desc, eq, gte, isNotNull, lt, lte, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import {
  buildings,
  events,
  httpCache,
  ingestionRuns,
  locationMisses,
  notificationLog,
  type BuildingRow,
  type IngestionRunRow,
} from '../schema.js';
import { effectiveEnd, timestampParam } from './internal.js';

export function listBuildingsForMatching(
  db: Database,
): Promise<Pick<BuildingRow, 'id' | 'name' | 'aliases'>[]> {
  return db
    .select({ id: buildings.id, name: buildings.name, aliases: buildings.aliases })
    .from(buildings);
}

/**
 * Marks active events as removed when the feed hasn't listed them since `seenBefore`.
 * Only events the feed should still be listing are eligible: not yet ended at `now`, and
 * starting within the fetched window. Past events drop out of the feed naturally and stay active.
 * Call only after a complete fetch. Returns the number of events marked.
 */
export async function markUnseenEventsRemoved(
  db: Database,
  options: { source: EventSource; seenBefore: Date; now: Date; windowEnd: Date },
): Promise<number> {
  const rows = await db
    .update(events)
    .set({ status: 'removed' })
    .where(
      and(
        eq(events.source, options.source),
        eq(events.status, 'active'),
        lt(events.lastSeenAt, options.seenBefore),
        gte(effectiveEnd, timestampParam(options.now)),
        lte(events.startsAt, options.windowEnd),
      ),
    )
    .returning({ id: events.id });
  return rows.length;
}

export interface LocationMiss {
  normalizedName: string;
  locationName: string;
  /** Sightings in this run. */
  count: number;
}

export async function recordLocationMisses(
  db: Database,
  misses: readonly LocationMiss[],
  seenAt: Date,
): Promise<void> {
  if (misses.length === 0) return;
  await db
    .insert(locationMisses)
    .values(
      misses.map((m) => ({
        normalizedName: m.normalizedName,
        locationName: m.locationName,
        seenCount: m.count,
        firstSeenAt: seenAt,
        lastSeenAt: seenAt,
      })),
    )
    .onConflictDoUpdate({
      target: locationMisses.normalizedName,
      set: {
        locationName: sql`excluded.location_name`,
        seenCount: sql`${locationMisses.seenCount} + excluded.seen_count`,
        lastSeenAt: sql`excluded.last_seen_at`,
      },
    });
}

export async function startIngestionRun(
  db: Database,
  source: EventSource,
  startedAt: Date,
): Promise<string> {
  const [row] = await db
    .insert(ingestionRuns)
    .values({ source, startedAt })
    .returning({ id: ingestionRuns.id });
  if (!row) throw new Error('insert returned no row');
  return row.id;
}

export type IngestionRunStats = Pick<
  IngestionRunRow,
  | 'fetched'
  | 'created'
  | 'updated'
  | 'classified'
  | 'removed'
  | 'complete'
  | 'errors'
  | 'errorMessages'
> &
  Partial<Pick<IngestionRunRow, 'notModified' | 'skippedDuplicates' | 'ttlMinutes'>>;

export async function finishIngestionRun(
  db: Database,
  id: string,
  finishedAt: Date,
  stats: IngestionRunStats,
): Promise<void> {
  await db
    .update(ingestionRuns)
    .set({ ...stats, finishedAt })
    .where(eq(ingestionRuns.id, id));
}

/** A source's most recent run, finished or not. Used to keep each source at most hourly. */
export async function getLastIngestionRun(
  db: Database,
  source: EventSource,
): Promise<{ startedAt: Date; ttlMinutes: number | null } | null> {
  const [row] = await db
    .select({ startedAt: ingestionRuns.startedAt, ttlMinutes: ingestionRuns.ttlMinutes })
    .from(ingestionRuns)
    .where(eq(ingestionRuns.source, source))
    .orderBy(desc(ingestionRuns.startedAt))
    .limit(1);
  return row ?? null;
}

/** Finish time of the newest complete run, for one source or across all of them. */
export async function getLastSuccessfulIngestion(
  db: Database,
  source?: EventSource,
): Promise<Date | null> {
  const [row] = await db
    .select({ finishedAt: ingestionRuns.finishedAt })
    .from(ingestionRuns)
    .where(
      and(
        eq(ingestionRuns.complete, true),
        isNotNull(ingestionRuns.finishedAt),
        source && eq(ingestionRuns.source, source),
      ),
    )
    .orderBy(desc(ingestionRuns.finishedAt))
    .limit(1);
  return row?.finishedAt ?? null;
}

// ── Conditional requests ──────────────────────────────────────────────────

export interface HttpValidators {
  etag: string | null;
  lastModified: string | null;
}

export async function getHttpValidators(db: Database, url: string): Promise<HttpValidators | null> {
  const [row] = await db
    .select({ etag: httpCache.etag, lastModified: httpCache.lastModified })
    .from(httpCache)
    .where(eq(httpCache.url, url));
  return row ?? null;
}

export async function saveHttpValidators(
  db: Database,
  url: string,
  validators: HttpValidators,
  at: Date,
): Promise<void> {
  await db
    .insert(httpCache)
    .values({ url, ...validators, updatedAt: at })
    .onConflictDoUpdate({ target: httpCache.url, set: { ...validators, updatedAt: at } });
}

// ── Maize Pages / Happening duplicates ────────────────────────────────────

/** True when an active Happening event was imported from this Maize Pages event. */
export async function hasActiveHappeningTwin(
  db: Database,
  maizepagesEventId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: events.id })
    .from(events)
    .where(
      and(
        eq(events.source, 'happening'),
        eq(events.status, 'active'),
        eq(events.maizepagesEventId, maizepagesEventId),
      ),
    )
    .limit(1);
  return row !== undefined;
}

/**
 * Hides the Maize Pages copy of an event now that Happening carries it, and copies its alert
 * claims to the Happening event so nobody is told about the same event twice.
 * Returns how many rows were retired (0 or 1).
 */
export function retireMaizepagesTwin(
  db: Database,
  maizepagesEventId: string,
  happeningEventId: string,
): Promise<number> {
  return db.transaction(async (tx) => {
    const retired = await tx
      .update(events)
      .set({ status: 'removed' })
      .where(
        and(
          eq(events.source, 'maizepages'),
          eq(events.sourceEventId, maizepagesEventId),
          eq(events.status, 'active'),
        ),
      )
      .returning({ id: events.id });
    for (const { id } of retired) {
      await tx.execute(sql`
        insert into ${notificationLog} (user_id, event_id, channel, sent_at, kind, error)
        select user_id, ${happeningEventId}::uuid, channel, sent_at, kind, error
        from ${notificationLog} where event_id = ${id}::uuid
        on conflict do nothing`);
    }
    return retired.length;
  });
}
