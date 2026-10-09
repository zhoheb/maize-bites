import {
  finishIngestionRun,
  getLastIngestionRun,
  listBuildingsForMatching,
  markUnseenEventsRemoved,
  recordLocationMisses,
  startIngestionRun,
  upsertEvent,
  type Database,
  type IngestionRunStats,
  type LocationMiss,
} from '@maize-bites/db';
import { z } from 'zod';
import type { ClassifyStats } from '../classifier/classify-events.js';
import type { NotifyStats } from '../notify/notifier.js';
import type { FeedWindow } from '../sources/happening/client.js';
import { normalizeHappeningItem } from '../sources/happening/normalize.js';
import { happeningItemSchema } from '../sources/happening/schema.js';
import { createLocationMatcher, resolveLocation } from '../locations/matcher.js';
import type { Logger } from '../scheduler.js';

/** Events not listed for this long (while they should be) become removed. */
export const REMOVAL_GRACE_MS = 24 * 3_600_000;
/**
 * Never start a run within this long of the previous one, whatever triggered it (cron,
 * startup, CLI, a second worker). A minute of slack keeps exact hourly cron ticks from
 * being skipped because the previous run's start was recorded a few ms late.
 */
export const MIN_INGEST_INTERVAL_MS = 59 * 60_000;
const MAX_ERROR_MESSAGES = 50;

export function isIngestionDue(lastStartedAt: Date | null, now: Date): boolean {
  return (
    lastStartedAt === null || now.getTime() - lastStartedAt.getTime() >= MIN_INGEST_INTERVAL_MS
  );
}

export interface IngestDeps {
  db: Database;
  /** Fetches the feed window starting at the given instant. */
  fetchWindow: (from: Date) => Promise<FeedWindow>;
  logger: Logger;
  now?: () => Date;
  /** Classifies new or changed content after the upserts. Omit to ingest only. */
  classify?: (now: Date) => Promise<ClassifyStats>;
  /** Sends instant alerts for newly published events, after classification. */
  notify?: (now: Date) => Promise<NotifyStats>;
}

export interface IngestResult extends IngestionRunStats {
  runId: string;
  unchanged: number;
  locationMisses: number;
}

/**
 * One idempotent pass: fetch → validate → normalize → resolve location → upsert → misses →
 * removals → classify → record the run. Per-item problems are counted and logged but don't stop the run.
 * A failed fetch is recorded as an incomplete run and nothing is removed.
 */
export async function runIngestion({
  db,
  fetchWindow,
  logger,
  now = () => new Date(),
  classify,
  notify,
}: IngestDeps): Promise<IngestResult> {
  const startedAt = now();
  const runId = await startIngestionRun(db, 'happening', startedAt);
  const stats: IngestionRunStats = {
    fetched: 0,
    created: 0,
    updated: 0,
    classified: 0,
    removed: 0,
    complete: false,
    errors: 0,
    errorMessages: [],
  };
  let unchanged = 0;
  const misses = new Map<string, LocationMiss>();

  const fail = (message: string) => {
    stats.errors += 1;
    if (stats.errorMessages.length < MAX_ERROR_MESSAGES) stats.errorMessages.push(message);
    logger.error(`[ingest] ${message}`);
  };

  try {
    let window: FeedWindow | null = null;
    try {
      window = await fetchWindow(startedAt);
    } catch (error) {
      fail(`fetch failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (window) {
      stats.fetched = window.items.length;
      if (!window.complete) fail(`fetch stopped after ${window.pages} pages; skipping removals`);

      const match = createLocationMatcher(await listBuildingsForMatching(db));

      for (const [index, raw] of window.items.entries()) {
        const parsed = happeningItemSchema.safeParse(raw);
        const label = parsed.success ? parsed.data.id : `item #${index}`;
        if (!parsed.success) {
          fail(
            `${label} failed validation: ${z.prettifyError(parsed.error).replaceAll('\n', ' ')}`,
          );
          continue;
        }
        try {
          const normalized = normalizeHappeningItem(parsed.data);
          const location = resolveLocation(normalized.locationCandidates, match);
          if (location.miss) {
            const prev = misses.get(location.miss.normalizedName);
            misses.set(location.miss.normalizedName, {
              ...location.miss,
              count: (prev?.count ?? 0) + 1,
            });
          }
          const { change } = await upsertEvent(
            db,
            { ...normalized.event, buildingId: location.buildingId },
            startedAt,
          );
          if (change === 'created') stats.created += 1;
          else if (change === 'updated') stats.updated += 1;
          else unchanged += 1;
        } catch (error) {
          fail(`${label}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      await recordLocationMisses(db, [...misses.values()], startedAt);

      if (window.complete) {
        stats.complete = true;
        stats.removed = await markUnseenEventsRemoved(db, {
          source: 'happening',
          seenBefore: new Date(startedAt.getTime() - REMOVAL_GRACE_MS),
          now: startedAt,
          windowEnd: window.windowEnd,
        });
      }
    }

    if (classify) {
      try {
        const c = await classify(startedAt);
        stats.classified = c.rulesClassified + c.llmClassified;
        if (c.llmErrors > 0) fail(`${c.llmErrors} LLM request(s) failed`);
      } catch (error) {
        fail(`classification failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (notify) {
      try {
        const n = await notify(now());
        if (n.failed > 0) fail(`${n.failed} alert(s) failed to send`);
      } catch (error) {
        fail(`notifier failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } finally {
    await finishIngestionRun(db, runId, now(), stats);
  }

  logger.info(
    `[ingest] run ${runId}: fetched ${stats.fetched}, created ${stats.created}, updated ${stats.updated}, ` +
      `unchanged ${unchanged}, removed ${stats.removed}, location misses ${misses.size}, errors ${stats.errors}`,
  );
  return { ...stats, runId, unchanged, locationMisses: misses.size };
}

export type IngestOutcome =
  { status: 'ran'; result: IngestResult } | { status: 'skipped'; nextAllowedAt: Date };

/** Runs ingestion unless another run started within MIN_INGEST_INTERVAL_MS. */
export async function ingestIfDue(deps: IngestDeps): Promise<IngestOutcome> {
  const now = deps.now ?? (() => new Date());
  const last = (await getLastIngestionRun(deps.db, 'happening'))?.startedAt ?? null;
  if (!isIngestionDue(last, now())) {
    const nextAllowedAt = new Date((last?.getTime() ?? 0) + MIN_INGEST_INTERVAL_MS);
    deps.logger.info(
      `[ingest] skipped: last run started ${last?.toISOString()}; next allowed ${nextAllowedAt.toISOString()}`,
    );
    return { status: 'skipped', nextAllowedAt };
  }
  return { status: 'ran', result: await runIngestion(deps) };
}
