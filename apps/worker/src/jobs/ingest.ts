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
import type { ClassifyStats } from '../classifier/classify-events.js';
import { createLocationMatcher, resolveLocation } from '../locations/matcher.js';
import type { NotifyStats } from '../notify/notifier.js';
import type { Logger } from '../scheduler.js';
import type { FeedSourceId, Source } from '../sources/types.js';

/** Events not listed for this long (while they should be) become removed. */
export const REMOVAL_GRACE_MS = 24 * 3_600_000;
/**
 * No source runs within this long of its previous run, whatever triggered it (cron, startup,
 * CLI, a second worker). Sources may ask for longer, never shorter.
 */
export const MIN_INGEST_INTERVAL_MS = 59 * 60_000;
const MAX_ERROR_MESSAGES = 50;

export function isIngestionDue(
  lastStartedAt: Date | null,
  now: Date,
  minIntervalMs = MIN_INGEST_INTERVAL_MS,
): boolean {
  return lastStartedAt === null || now.getTime() - lastStartedAt.getTime() >= minIntervalMs;
}

export interface IngestDeps {
  db: Database;
  /** Run in order. One failing does not stop the others. */
  sources: readonly Source[];
  logger: Logger;
  now?: () => Date;
  /** Classifies new or changed content after the upserts. Omit to ingest only. */
  classify?: (now: Date) => Promise<ClassifyStats>;
  /** Sends instant alerts for newly published events, after classification. */
  notify?: (now: Date) => Promise<NotifyStats>;
}

export interface IngestResult extends Required<IngestionRunStats> {
  source: FeedSourceId;
  runId: string;
  unchanged: number;
  locationMisses: number;
}

const describeError = (error: unknown) => (error instanceof Error ? error.message : String(error));

function emptyResult(source: FeedSourceId, runId: string): IngestResult {
  return {
    source,
    runId,
    fetched: 0,
    created: 0,
    updated: 0,
    classified: 0,
    removed: 0,
    complete: false,
    notModified: false,
    skippedDuplicates: 0,
    ttlMinutes: null,
    errors: 0,
    errorMessages: [],
    unchanged: 0,
    locationMisses: 0,
  };
}

/** fetch → validate → normalize → resolve location → upsert → misses → removals, for one source. */
async function ingestSource(
  db: Database,
  source: Source,
  startedAt: Date,
  result: IngestResult,
  fail: (message: string) => void,
): Promise<void> {
  let fetched;
  try {
    fetched = await source.fetch(startedAt);
  } catch (error) {
    fail(`fetch failed: ${describeError(error)}`);
    return;
  }

  if (fetched.status === 'not_modified') {
    // Nothing changed upstream. Events keep their last_seen_at; the next full fetch refreshes
    // it before removals are considered, so nothing is removed for being unseen meanwhile.
    result.notModified = true;
    result.complete = true;
    return;
  }

  result.fetched = fetched.items.length;
  result.ttlMinutes = fetched.ttlMinutes ?? null;
  if (!fetched.complete)
    fail(fetched.incompleteReason ?? 'fetch was incomplete; skipping removals');

  const match = createLocationMatcher(await listBuildingsForMatching(db));
  const misses = new Map<string, LocationMiss>();

  for (const [index, raw] of fetched.items.entries()) {
    const normalized = source.normalize(raw, index);
    if (!normalized.ok) {
      fail(normalized.message);
      continue;
    }
    const { label, item } = normalized;
    try {
      if ((await source.beforeUpsert?.(db, item)) === 'skip') {
        result.skippedDuplicates += 1;
        continue;
      }
      const location = resolveLocation(item.locationCandidates, match);
      if (location.miss) {
        const prev = misses.get(location.miss.normalizedName);
        misses.set(location.miss.normalizedName, {
          ...location.miss,
          count: (prev?.count ?? 0) + 1,
        });
      }
      const { event, change } = await upsertEvent(
        db,
        { ...item.event, buildingId: location.buildingId },
        startedAt,
      );
      if (change === 'created') result.created += 1;
      else if (change === 'updated') result.updated += 1;
      else result.unchanged += 1;
      await source.afterUpsert?.(db, event);
    } catch (error) {
      fail(`${label}: ${describeError(error)}`);
    }
  }

  await recordLocationMisses(db, [...misses.values()], startedAt);
  result.locationMisses = misses.size;

  if (fetched.complete) {
    result.complete = true;
    result.removed = await markUnseenEventsRemoved(db, {
      source: source.id,
      seenBefore: new Date(startedAt.getTime() - REMOVAL_GRACE_MS),
      now: startedAt,
      windowEnd: fetched.windowEnd,
    });
  }
}

/**
 * One idempotent pass over the given sources, then classification and alerts once for all of
 * them. Each source gets its own ingestion_runs row. Per-item problems are counted and logged
 * but don't stop a source, and a source that fails outright doesn't stop the next one.
 * A failed fetch is recorded as an incomplete run and nothing is removed.
 */
export async function runIngestion({
  db,
  sources,
  logger,
  now = () => new Date(),
  classify,
  notify,
}: IngestDeps): Promise<IngestResult[]> {
  const startedAt = now();
  const results: IngestResult[] = [];
  const failOn = (result: IngestResult) => (message: string) => {
    result.errors += 1;
    if (result.errorMessages.length < MAX_ERROR_MESSAGES) result.errorMessages.push(message);
    logger.error(`[ingest] ${result.source}: ${message}`);
  };

  try {
    for (const source of sources) {
      const result = emptyResult(source.id, await startIngestionRun(db, source.id, startedAt));
      results.push(result);
      try {
        await ingestSource(db, source, startedAt, result, failOn(result));
      } catch (error) {
        failOn(result)(`ingest failed: ${describeError(error)}`);
      }
    }

    // Classification and alerts cover every source at once. Their problems, and verdicts on
    // community tips, are recorded on the first run of the pass.
    const [first] = results;
    if (first && classify) {
      try {
        const c = await classify(startedAt);
        for (const result of results) result.classified = c.bySource[result.source] ?? 0;
        first.classified += c.bySource.submission ?? 0;
        if (c.llmErrors > 0) failOn(first)(`${c.llmErrors} LLM request(s) failed`);
      } catch (error) {
        failOn(first)(`classification failed: ${describeError(error)}`);
      }
    }

    if (first && notify) {
      try {
        const n = await notify(now());
        if (n.failed > 0) failOn(first)(`${n.failed} alert(s) failed to send`);
      } catch (error) {
        failOn(first)(`notifier failed: ${describeError(error)}`);
      }
    }
  } finally {
    const finishedAt = now();
    for (const { source: _source, runId, unchanged: _u, locationMisses: _m, ...stats } of results)
      await finishIngestionRun(db, runId, finishedAt, stats);
  }

  for (const r of results) {
    logger.info(
      `[ingest] ${r.source} run ${r.runId}: ` +
        (r.notModified ? 'not modified, ' : '') +
        `fetched ${r.fetched}, created ${r.created}, updated ${r.updated}, unchanged ${r.unchanged}, ` +
        `removed ${r.removed}, duplicates skipped ${r.skippedDuplicates}, location misses ${r.locationMisses}, errors ${r.errors}`,
    );
  }
  return results;
}

export type IngestOutcome =
  | {
      status: 'ran';
      results: IngestResult[];
      /** Sources that weren't due yet. */
      skipped: { source: FeedSourceId; nextAllowedAt: Date }[];
    }
  /** No source was due. `nextAllowedAt` is when the first one will be. */
  | { status: 'skipped'; nextAllowedAt: Date };

/**
 * Runs the sources that are due. A source is due once its minimum interval, and any longer
 * refresh hint its feed gave last time, has passed since its previous run started.
 */
export async function ingestIfDue(deps: IngestDeps): Promise<IngestOutcome> {
  const now = (deps.now ?? (() => new Date()))();
  const due: Source[] = [];
  const skipped: { source: FeedSourceId; nextAllowedAt: Date }[] = [];

  for (const source of deps.sources) {
    const last = await getLastIngestionRun(deps.db, source.id);
    const interval = Math.max(
      MIN_INGEST_INTERVAL_MS,
      source.minIntervalMs,
      // A minute of slack, as with the hourly interval.
      last?.ttlMinutes ? (last.ttlMinutes - 1) * 60_000 : 0,
    );
    if (isIngestionDue(last?.startedAt ?? null, now, interval)) {
      due.push(source);
      continue;
    }
    const nextAllowedAt = new Date((last?.startedAt.getTime() ?? 0) + interval);
    skipped.push({ source: source.id, nextAllowedAt });
    deps.logger.info(
      `[ingest] ${source.id} skipped: last run started ${last?.startedAt.toISOString()}; next allowed ${nextAllowedAt.toISOString()}`,
    );
  }

  if (due.length === 0) {
    const next = Math.min(...skipped.map((s) => s.nextAllowedAt.getTime()));
    return { status: 'skipped', nextAllowedAt: new Date(Number.isFinite(next) ? next : now) };
  }
  return { status: 'ran', results: await runIngestion({ ...deps, sources: due }), skipped };
}
