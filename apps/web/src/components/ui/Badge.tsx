import type { ReactNode } from 'react';
import { cx } from './cx';

const TONES = {
  amber: 'border-amber-line text-amber',
  info: 'border-info-line text-info',
  warn: 'border-warn/40 text-warn',
  ok: 'border-now/40 text-now',
  neutral: 'border-line-strong text-ink-2',
} as const;

export type BadgeTone = keyof typeof TONES;

/** A quiet bordered label for exceptions (Members only, RSVP required, Likely over) and tags. */
export function Badge({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string | undefined;
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
