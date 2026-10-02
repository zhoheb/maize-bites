import type { FoodEvent } from '@maize-bites/shared';
import { countdown } from '../lib/format';

const STYLES = {
  live: 'bg-maize text-michigan-blue',
  upcoming: 'bg-michigan-blue/10 text-michigan-blue',
  ended: 'bg-slate-100 text-slate-600',
} as const;

export function Countdown({
  event,
  now,
}: {
  event: Pick<FoodEvent, 'startsAt' | 'endsAt'>;
  now: Date;
}) {
  const { status, text } = countdown(event, now);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-bold ${STYLES[status]}`}
    >
      {status === 'live' && (
        <span
          aria-hidden="true"
          className="size-1.5 rounded-full bg-michigan-blue motion-safe:animate-pulse"
        />
      )}
      {status === 'live' && <span className="sr-only">Happening now. </span>}
      {text}
    </span>
  );
}
