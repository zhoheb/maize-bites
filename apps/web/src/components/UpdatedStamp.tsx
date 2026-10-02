import { useHealth } from '../api/queries';
import { useNow } from '../hooks/useNow';
import { formatRelative } from '../lib/format';

/** When the event data last refreshed from the source feed (not when this page fetched). */
export function UpdatedStamp() {
  const { data } = useHealth();
  const now = useNow(30_000);
  if (!data) return null;

  const last = data.lastSuccessfulIngestionAt;
  return (
    <p className="flex items-center gap-2 text-sm text-slate-600">
      {data.ingestionStale && (
        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-900">
          Data may be out of date
        </span>
      )}
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
