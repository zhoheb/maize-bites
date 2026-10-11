import { liveHeadline, useLiveCounts } from '../hooks/useLiveCounts';
import { UpdatedStamp } from './UpdatedStamp';
import { cx } from './ui/cx';

/** The answer first: how much free food there is right now, and how fresh the data is. */
export function HeroStrip({ compact = false }: { compact?: boolean }) {
  const counts = useLiveCounts();
  return (
    <div
      className={
        // On phones the stamp always sits under the headline. Side by side, it would drop to a
        // second line when the live count makes the headline longer, shifting the list.
        compact ? 'space-y-1' : 'flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1'
      }
    >
      <h1
        className={cx(
          'tabular font-bold text-ink',
          compact ? 'text-xl leading-7' : 'text-[1.75rem] leading-9 sm:text-3xl',
        )}
      >
        {liveHeadline(counts)}
      </h1>
      <UpdatedStamp />
    </div>
  );
}
