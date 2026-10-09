import type { Database, EventRow, UpsertEventInput } from '@maize-bites/db';
import type { EventSource } from '@maize-bites/shared';

/** Sources we fetch. Community tips ('submission') arrive through the API instead. */
export type FeedSourceId = Exclude<EventSource, 'submission'>;

export interface NormalizedItem {
  /** Everything upsertEvent needs except the building, which location matching fills in. */
  event: Omit<UpsertEventInput, 'buildingId'>;
  /** Names to match against buildings, most structured first. */
  locationCandidates: string[];
}

export type FetchResult =
  | {
      /** The feed answered 304 Not Modified. */
      status: 'not_modified';
    }
  | {
      status: 'ok';
      /** Raw items; each is validated by `normalize`. */
      items: unknown[];
      /** False if the fetch stopped early. Removals only run after a complete fetch. */
      complete: boolean;
      /** Recorded as a run error when `complete` is false. */
      incompleteReason?: string;
      /** Events starting before this were in scope, so a missing one may be removed. */
      windowEnd: Date;
      /** The feed's own refresh hint (RSS <ttl>), when it gave one. */
      ttlMinutes?: number | null;
    };

export type NormalizeResult =
  { ok: true; label: string; item: NormalizedItem } | { ok: false; message: string };

/**
 * One place events come from. The ingest job drives every source the same way:
 * fetch → normalize → resolve location → upsert → removals.
 */
export interface Source {
  id: FeedSourceId;
  /** Never start a run within this long of the source's previous one. */
  minIntervalMs: number;
  fetch: (from: Date) => Promise<FetchResult>;
  /** Validates and maps one raw item. Problems come back as a message, never a throw. */
  normalize: (raw: unknown, index: number) => NormalizeResult;
  /** Return 'skip' when another source already carries this event. */
  beforeUpsert?: (ctx: SourceContext, item: NormalizedItem) => Promise<'upsert' | 'skip'>;
  afterUpsert?: (ctx: SourceContext, event: EventRow) => Promise<void>;
}

export interface SourceContext {
  db: Database;
  /** When this ingestion pass started; events upserted in it get this as last_seen_at. */
  startedAt: Date;
}

/**
 * How recently Happening must have listed its copy of a Maize Pages event for that copy to be
 * the one we show. Older than this (Happening unreachable, or it dropped the event) and the
 * Maize Pages listing takes over. Matches the removal grace period.
 */
export const DUPLICATE_FRESHNESS_MS = 24 * 3_600_000;
