import type { ReactNode } from 'react';
import { cx } from './cx';

const TONES = {
  members: 'border-members/60 text-members',
  rsvp: 'border-rsvp/60 text-rsvp',
  danger: 'border-danger/50 text-danger',
  ok: 'border-now text-now-ink',
  muted: 'border-line-strong text-ink-3',
  neutral: 'border-line-strong text-ink-2',
} as const;

export type BadgeTone = keyof typeof TONES;

/** A small outlined label, for exceptions (Members only, RSVP, Likely over) and states. */
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
        'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs leading-4 font-medium whitespace-nowrap',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
