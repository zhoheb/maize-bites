import { cx } from './cx';

const TONES = { now: 'bg-now', soon: 'bg-soon', over: 'bg-over' } as const;

/** A thin bar showing how far through something we are. `value` runs from 0 to 1. */
export function ProgressBar({
  value,
  tone = 'now',
  label,
  className,
}: {
  value: number;
  tone?: keyof typeof TONES;
  /** What the bar measures, for screen readers. */
  label: string;
  className?: string | undefined;
}) {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className={cx('h-[3px] overflow-hidden rounded-full bg-sunken', className)}
    >
      <div
        className={cx('h-full rounded-full transition-[width] duration-700', TONES[tone])}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
