import { cx } from './cx';

/** A shimmering placeholder block. Hidden from assistive tech; pair it with a role="status". */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cx('skeleton', className)} />;
}
