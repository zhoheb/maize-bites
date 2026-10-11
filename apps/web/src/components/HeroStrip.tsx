import { Link } from 'react-router';
import type { Hero } from '../lib/hero';
import { UpdatedStamp } from './UpdatedStamp';
import { cx } from './ui/cx';

/**
 * The answer first: how much free food there is in the selected range (or what's next), and
 * how fresh the data is. The headline is computed from the list being shown.
 */
export function HeroStrip({
  hero,
  nextHref,
  compact = false,
}: {
  /** Null while the list is loading. */
  hero: Hero | null;
  /** Where the "next up" event links. */
  nextHref?: ((id: string) => string) | undefined;
  compact?: boolean;
}) {
  return (
    <div
      className={
        // On phones the stamp always sits under the headline, so a longer headline can't push
        // it onto a new line and shift the list.
        compact ? 'space-y-1' : 'flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1'
      }
    >
      <h1
        aria-live="polite"
        className={cx(
          'tabular font-display font-bold tracking-[-0.02em] text-ink',
          compact ? 'text-xl leading-7' : 'text-[2rem] leading-9',
        )}
      >
        {hero === null ? (
          'Free food on campus'
        ) : hero.next ? (
          <>
            {hero.text}{' '}
            <Link
              to={nextHref?.(hero.next.id) ?? '#'}
              className="underline decoration-line-strong decoration-2 underline-offset-4 hover:decoration-maize"
            >
              {hero.next.text}
            </Link>
          </>
        ) : (
          hero.text
        )}
      </h1>
      <UpdatedStamp />
    </div>
  );
}
