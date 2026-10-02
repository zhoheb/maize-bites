import type { EventSource } from '@maize-bites/shared';
import { and, desc, eq, gte, isNotNull, lt, lte, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import {
  buildings,
  events,
  ingestionRuns,
  locationMisses,
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

export async function startIngestionRun(db: Database, startedAt: Date): Promise<string> {
  const [row] = await db
    .insert(ingestionRuns)
    .values({ startedAt })
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
>;

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

/** Most recent run start, finished or not. Used to keep ingestion at most hourly. */
export async function getLastIngestionRunStart(db: Database): Promise<Date | null> {
  const [row] = await db
    .select({ startedAt: ingestionRuns.startedAt })
    .from(ingestionRuns)
    .orderBy(desc(ingestionRuns.startedAt))
    .limit(1);
  return row?.startedAt ?? null;
}

/** Finish time of the newest run that fetched the whole feed window. */
export async function getLastSuccessfulIngestion(db: Database): Promise<Date | null> {
  const [row] = await db
    .select({ finishedAt: ingestionRuns.finishedAt })
    .from(ingestionRuns)
    .where(and(eq(ingestionRuns.complete, true), isNotNull(ingestionRuns.finishedAt)))
    .orderBy(desc(ingestionRuns.finishedAt))
    .limit(1);
  return row?.finishedAt ?? null;
}
