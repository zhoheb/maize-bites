import { Check, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cx } from './cx';

/** A toggle button. `aria-pressed` tells assistive tech whether the filter is on. */
export function Chip({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cx(
        'inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors',
        pressed
          ? 'border-on-maize/20 bg-maize text-on-maize'
          : 'border-line-strong bg-surface text-ink hover:bg-sunken',
      )}
    >
      {pressed && <Check aria-hidden="true" className="size-3.5" strokeWidth={3} />}
      {children}
    </button>
  );
}

/** An active filter shown beneath the filter row; activating it removes the filter. */
export function RemovableChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={`Remove filter: ${label}`}
      className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-full bg-maize pr-2 pl-3 text-xs font-semibold text-on-maize hover:brightness-95"
    >
      {label}
      <X aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
    </button>
  );
}
