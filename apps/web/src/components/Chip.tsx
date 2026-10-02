import type { ReactNode } from 'react';

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
      className={[
        'inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full border px-3.5 text-sm font-medium transition-colors',
        'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-michigan-blue',
        pressed
          ? 'border-michigan-blue bg-michigan-blue text-white'
          : 'border-slate-300 bg-white text-slate-800 hover:border-michigan-blue hover:bg-michigan-blue/5',
      ].join(' ')}
    >
      {pressed && (
        <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3.5 fill-maize">
          <path d="M6.2 11.6 2.6 8l1.1-1.1 2.5 2.5 6.1-6.1L13.4 4.4z" />
        </svg>
      )}
      {children}
    </button>
  );
}
