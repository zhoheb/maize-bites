import { retireDuplicateEvents } from '@maize-bites/db';
import { z } from 'zod';
import type { Source } from '../types.js';
import type { FeedWindow } from './client.js';
import { normalizeHappeningItem } from './normalize.js';
import { happeningItemSchema } from './schema.js';

/**
 * A minute of slack under an hour keeps exact hourly cron ticks from being skipped because the
 * previous run's start was recorded a few ms late.
 */
export const HAPPENING_MIN_INTERVAL_MS = 59 * 60_000;

/** Happening @ Michigan, the university-wide events calendar. */
export function createHappeningSource(options: {
  /** Fetches the feed window starting at the given instant. */
  fetchWindow: (from: Date) => Promise<FeedWindow>;
}): Source {
  return {
    id: 'happening',
    minIntervalMs: HAPPENING_MIN_INTERVAL_MS,

    fetch: async (from) => {
      const window = await options.fetchWindow(from);
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
