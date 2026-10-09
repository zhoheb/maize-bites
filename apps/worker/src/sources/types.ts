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
  beforeUpsert?: (db: Database, item: NormalizedItem) => Promise<'upsert' | 'skip'>;
  afterUpsert?: (db: Database, event: EventRow) => Promise<void>;
}
