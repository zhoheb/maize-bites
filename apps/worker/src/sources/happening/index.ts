import { retireDuplicateEvents } from '@maize-bites/db';
import { z } from 'zod';
import { FeedHttpError } from '../http/client.js';
import type { Source } from '../types.js';
import type { FeedWindow } from './client.js';
import { normalizeHappeningItem } from './normalize.js';
import { happeningItemSchema } from './schema.js';

/**
 * A minute of slack under an hour keeps exact hourly cron ticks from being skipped because the
 * previous run's start was recorded a few ms late.
 */
export const HAPPENING_MIN_INTERVAL_MS = 59 * 60_000;

export const HAPPENING_HOST = 'events.umich.edu';
/**
 * Student Life Technology Solutions allows our client with this header (approved
 * 2026-10-09). Its value is "<token> <site URL>" and it goes to HAPPENING_HOST only.
 */
export const HAPPENING_INTEGRATION_HEADER = 'x-umich-integration';
export const HAPPENING_REJECTED =
  'Happening rejected the integration header; check the token';

export function happeningIntegrationHeader(token: string, siteUrl: string): Record<string, string> {
  return { [HAPPENING_INTEGRATION_HEADER]: `${token} ${siteUrl}` };
}

/** Happening @ Michigan, the university-wide events calendar. */
export function createHappeningSource(options: {
  /** Fetches the feed window starting at the given instant. */
  fetchWindow: (from: Date) => Promise<FeedWindow>;
}): Source {
  return {
    id: 'happening',
    minIntervalMs: HAPPENING_MIN_INTERVAL_MS,

    fetch: async (from) => {
      let window: FeedWindow;
      try {
        window = await options.fetchWindow(from);
      } catch (error) {
        // We sent the header and were still turned away: say so plainly. Never retried.
        if (
          error instanceof FeedHttpError &&
          (error.kind === 'challenge' || error.status === 401 || error.status === 403)
        )
          throw new FeedHttpError(
            `${HAPPENING_REJECTED} (HTTP ${error.status ?? 403}${error.kind === 'challenge' ? ', Cloudflare challenge' : ''})`,
            false,
            error.kind,
            error.status,
          );
        throw error;
      }
      return {
        status: 'ok',
        items: window.items,
        complete: window.complete,
        incompleteReason: `fetch stopped after ${window.pages} pages; skipping removals`,
        windowEnd: window.windowEnd,
      };
    },

    normalize: (raw, index) => {
      const parsed = happeningItemSchema.safeParse(raw);
      if (!parsed.success) {
        return {
          ok: false,
          message: `item #${index} failed validation: ${z.prettifyError(parsed.error).replaceAll('\n', ' ')}`,
        };
      }
      const label = parsed.data.id;
      try {
        const { event, locationCandidates } = normalizeHappeningItem(parsed.data);
        return { ok: true, label, item: { event, locationCandidates } };
      } catch (error) {
        return {
          ok: false,
          message: `${label}: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },

    // Happening imports some Maize Pages events. Once its copy exists, ours from Maize Pages goes.
    afterUpsert: async ({ db }, event) => {
      if (event.maizepagesEventId !== null)
        await retireDuplicateEvents(db, {
          maizepagesEventId: event.maizepagesEventId,
          source: 'maizepages',
          survivorId: event.id,
        });
    },
  };
}
