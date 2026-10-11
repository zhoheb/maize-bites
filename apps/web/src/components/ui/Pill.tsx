import type { ReactNode } from 'react';
import { cx } from './cx';

const TONES = {
  now: 'bg-now-bg text-now',
  soon: 'bg-maize text-on-maize',
  neutral: 'bg-sunken text-ink-2',
  muted: 'bg-sunken text-ink-3',
  warn: 'bg-warn-bg text-warn',
} as const;

export type PillTone = keyof typeof TONES;

/** A filled status label. `dot` adds a pulsing dot for live states. */
export function Pill({
  tone = 'neutral',
  dot = false,
  className,
  children,
}: {
  tone?: PillTone;
  dot?: boolean;
  className?: string | undefined;
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        'tabular inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold leading-none',
        TONES[tone],
        className,
      )}
    >
      {dot && (
        <span aria-hidden="true" className="relative flex size-2">
          <span className="absolute inset-0 animate-ping rounded-full bg-current opacity-60" />
          <span className="relative size-2 rounded-full bg-current" />
        </span>
      )}
      {children}
    </span>
  );
}
