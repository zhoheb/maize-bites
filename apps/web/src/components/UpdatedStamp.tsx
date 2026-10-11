import { useHealth } from '../api/queries';
import { useNow } from '../hooks/useNow';
import { formatRelative } from '../lib/format';
import { cx } from './ui/cx';

/**
 * When the event data last refreshed from the source feeds (not when this page fetched). A
 * pulsing green dot while fresh; a still amber one when the pipeline has fallen behind.
 */
export function UpdatedStamp({ className }: { className?: string }) {
  const { data } = useHealth();
  const now = useNow();
  // Reserve the line while loading so nothing shifts when it arrives.
  if (!data) return <p className={cx('h-5 text-sm', className)} />;

  const last = data.lastSuccessfulIngestionAt;
  const stale = data.ingestionStale;
  return (
    <p className={cx('tabular flex h-5 items-center gap-2 text-sm text-ink-2', className)}>
      <span aria-hidden="true" className="relative flex size-2">
        {!stale && (
          <span className="absolute inset-0 animate-ping rounded-full bg-now-dot opacity-60" />
        )}
        <span className={cx('relative size-2 rounded-full', stale ? 'bg-amber' : 'bg-now-dot')} />
      </span>
      {stale && <span className="font-medium text-amber">May be out of date ·</span>}
      {last ? (
        <span>
          Updated <time dateTime={last}>{formatRelative(new Date(last), now)}</time>
        </span>
      ) : (
        <span>Waiting for the first update</span>
      )}
    </p>
  );
}
