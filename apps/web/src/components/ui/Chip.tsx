import { Check, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cx } from './cx';

/** A toggle button. `aria-pressed` tells assistive tech whether the choice is on. */
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
        'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors',
        pressed
          ? 'border-primary bg-primary text-on-primary'
          : 'border-line-strong bg-card text-ink hover:bg-sunken',
      )}
    >
      {pressed && <Check aria-hidden="true" className="size-3.5" strokeWidth={3} />}
      {children}
    </button>
  );
}

/** An active dropdown choice shown beneath the filter row; activating it removes the choice. */
export function RemovableChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={`Remove filter: ${label}`}
      className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full bg-sunken pr-2 pl-3 text-xs font-medium text-ink hover:bg-line"
    >
      {label}
      <X aria-hidden="true" className="size-3.5 text-ink-3" strokeWidth={2.25} />
    </button>
  );
}
