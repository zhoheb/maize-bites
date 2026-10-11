import { cx } from './ui/cx';

/** Where the data comes from, and that this isn't an official university site. */
export function SiteCredit({ className }: { className?: string }) {
  return (
    <p className={cx('text-xs text-ink-3', className)}>
      Event data from Happening @ Michigan and Maize Pages. Not affiliated with the University of
      Michigan.
    </p>
  );
}
