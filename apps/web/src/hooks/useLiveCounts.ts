import { useEventsInfinite } from '../api/queries';
import { NO_FILTERS } from '../lib/filters';
import { timeStatus } from '../lib/status';
import { useNow } from './useNow';

export interface LiveCounts {
  live: number;
  soon: number;
}

/** How many unfiltered events are live, and how many start within the next two hours. */
export function useLiveCounts(): LiveCounts | null {
  const now = useNow();
  const { data } = useEventsInfinite('now', NO_FILTERS);
  if (!data) return null;
  const events = data.pages.flatMap((page) => page.events).filter((e) => !e.likelyGone);
  return {
    live: events.filter((e) => timeStatus(e, now) === 'now').length,
    soon: events.filter((e) => timeStatus(e, now) === 'soon').length,
  };
}

export function liveHeadline(counts: LiveCounts | null): string {
  if (counts === null) return 'Free food on campus';
  if (counts.live > 0)
    return `${counts.live} ${counts.live === 1 ? 'spot' : 'spots'} with free food right now`;
  if (counts.soon > 0) return `${counts.soon} starting soon, nothing just yet`;
  return 'No free food right now';
}
