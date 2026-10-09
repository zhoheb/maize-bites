import {
  hasFreshHappeningTwin,
  linkHappeningTwinsByContent,
  retireDuplicateEvents,
  type HttpValidators,
} from '@maize-bites/db';
import { z } from 'zod';
import { httpGet, isRefusal, type HttpOptions, type HttpResult } from '../http/client.js';
import { DUPLICATE_FRESHNESS_MS, type FetchResult, type Source } from '../types.js';
import { normalizeMaizepagesItem } from './normalize.js';
import { readIcsFeed } from './read-ics.js';
import { readRssFeed } from './read-rss.js';
import { maizepagesItemSchema } from './schema.js';

export const MAIZEPAGES_ICS_URL = 'https://maizepages.umich.edu/events.ics';
export const MAIZEPAGES_RSS_URL = 'https://maizepages.umich.edu/events.rss';
/**
 * The RSS feed's <ttl> as of 2026-10-09: it asks readers to wait 5 hours between fetches. The
 * ICS feed states no interval, so it gets the same one. When the RSS feed is read and states a
 * longer ttl, the ingest job waits that long instead.
 */
export const MAIZEPAGES_TTL_MINUTES = 300;
/** Both feeds list public events from now to seven days out. */
const FEED_WINDOW_MS = 7 * 24 * 3_600_000;
/** Events starting in the feed window's last hour may not be listed yet; don't remove those. */
const WINDOW_MARGIN_MS = 3_600_000;

/** Where the last response's ETag / Last-Modified are kept between runs. */
export interface ValidatorStore {
  get: (url: string) => Promise<HttpValidators | null>;
  save: (url: string, validators: HttpValidators) => Promise<void>;
}

const describeError = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Maize Pages public events, from the site's official feeds. Reads /events.ics and, if that
 * fails for an ordinary reason, /events.rss. If the site refuses us (a bot challenge, or
 * robots.txt), it stops there: the other feed is not tried.
 */
export function createMaizepagesSource(options: {
  http: HttpOptions;
  validators: ValidatorStore;
  logger: Pick<Console, 'warn'>;
}): Source {
  const { http, validators, logger } = options;

  async function get(url: string, accept: string): Promise<HttpResult<string>> {
    const result = await httpGet(new URL(url), http, {
      accept,
      parse: (res) => res.text(),
      validators: await validators.get(url),
    });
    return result;
  }

  async function fetchFeed(
    url: string,
    accept: string,
    read: (body: string) => { items: unknown[]; ttlMinutes: number | null },
    from: Date,
  ): Promise<FetchResult> {
    const result = await get(url, accept);
    if (result.status === 'not_modified') return { status: 'not_modified' };
    // Parse before saving the validators: a body we can't read must be fetched again next time.
    const { items, ttlMinutes } = read(result.body);
    await validators.save(url, result.validators);
    return {
      status: 'ok',
      items,
      complete: true,
      windowEnd: new Date(from.getTime() + FEED_WINDOW_MS - WINDOW_MARGIN_MS),
      ttlMinutes,
    };
  }

  return {
    id: 'maizepages',
    // A minute of slack, as with the hourly sources.
    minIntervalMs: (MAIZEPAGES_TTL_MINUTES - 1) * 60_000,

    fetch: async (from) => {
      try {
        return await fetchFeed(
          MAIZEPAGES_ICS_URL,
          'text/calendar',
          (body) => ({ items: readIcsFeed(body), ttlMinutes: null }),
          from,
        );
      } catch (error) {
        if (isRefusal(error)) throw error;
        logger.warn(
          `[ingest] maizepages: events.ics failed (${describeError(error)}); trying events.rss`,
        );
      }
      return fetchFeed(MAIZEPAGES_RSS_URL, 'application/rss+xml', readRssFeed, from);
    },

    normalize: (raw, index) => {
      const parsed = maizepagesItemSchema.safeParse(raw);
      if (!parsed.success) {
        return {
          ok: false,
          message: `item #${index} failed validation: ${z.prettifyError(parsed.error).replaceAll('\n', ' ')}`,
        };
      }
      return { ok: true, label: parsed.data.id, item: normalizeMaizepagesItem(parsed.data) };
    },

    // Happening imports some Maize Pages events. While its feed keeps listing a copy, that copy
    // is the event and ours is skipped.
    beforeUpsert: async ({ db, startedAt }, item) => {
      // Some events are posted to both sites by hand, with no import record to tie them
      // together. Tie those by start time and title first.
      await linkHappeningTwinsByContent(db, {
        eventId: item.event.sourceEventId,
        title: item.event.title,
        startsAt: item.event.startsAt,
      });
      const since = new Date(startedAt.getTime() - DUPLICATE_FRESHNESS_MS);
      return (await hasFreshHappeningTwin(db, item.event.sourceEventId, since)) ? 'skip' : 'upsert';
    },

    // We got here because Happening has no fresh copy. Any copy it left behind is out of date
    // (Happening unreachable, or it dropped the event), so the Maize Pages listing replaces it.
    afterUpsert: async ({ db, startedAt }, event) => {
      await retireDuplicateEvents(db, {
        maizepagesEventId: event.sourceEventId,
        source: 'happening',
        survivorId: event.id,
        seenBefore: new Date(startedAt.getTime() - DUPLICATE_FRESHNESS_MS),
      });
    },
  };
}
