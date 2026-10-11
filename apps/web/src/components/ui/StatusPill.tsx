import type { ReactNode } from 'react';
import { cx } from './cx';

const TONES = {
  now: 'bg-now-soft text-now-ink',
  soon: 'bg-soon-soft text-soon-ink',
  neutral: 'bg-sunken text-ink-2',
  muted: 'bg-sunken text-ink-3',
} as const;

export type StatusTone = keyof typeof TONES;

/** A filled status label. `live` adds a pulsing dot. */
export function StatusPill({
  tone = 'neutral',
  live = false,
  className,
  children,
}: {
  tone?: StatusTone;
  live?: boolean;
  className?: string | undefined;
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        'tabular inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap',
        TONES[tone],
        className,
      )}
    >
      {live && (
        <span aria-hidden="true" className="relative flex size-2">
          <span className="absolute inset-0 animate-ring rounded-full bg-now" />
          <span className="relative size-2 rounded-full bg-now" />
        </span>
      )}
      {children}
    </span>
  );
}
