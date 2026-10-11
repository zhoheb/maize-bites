import { useHealth } from '../api/queries';
import { useNow } from '../hooks/useNow';
import { formatRelative } from '../lib/format';
import { freshness, type Freshness } from '../lib/hero';
import { cx } from './ui/cx';

const DOT: Record<Freshness, string> = { fresh: 'bg-now', aging: 'bg-soon', old: 'bg-over' };

/**
 * When the event data last refreshed from the source feeds (not when this page fetched). The
 * dot's colour is the age: green under 15 minutes (and pulsing), amber under 2 hours, grey
 * beyond that.
 */
export function UpdatedStamp({ className }: { className?: string }) {
  const { data } = useHealth();
  const now = useNow();
  // Reserve the line while loading so nothing shifts when it arrives.
  if (!data) return <p className={cx('h-[1.125rem]', className)} />;

  const last = data.lastSuccessfulIngestionAt;
  const age = last ? freshness(new Date(last), now) : 'old';
  return (
    <p
      className={cx(
        'tabular flex h-[1.125rem] shrink-0 items-center gap-2 text-[0.8125rem] text-ink-2',
        className,
      )}
    >
      <span aria-hidden="true" data-freshness={age} className="relative flex size-2">
        {age === 'fresh' && <span className="absolute inset-0 animate-ring rounded-full bg-now" />}
        <span className={cx('relative size-2 rounded-full', DOT[age])} />
      </span>
      {last ? (
        <span>
          Updated <time dateTime={last}>{formatRelative(new Date(last), now)}</time>
          {data.ingestionStale && <span className="text-soon-ink"> · may be out of date</span>}
        </span>
      ) : (
        <span>Waiting for the first update</span>
      )}
    </p>
  );
}
