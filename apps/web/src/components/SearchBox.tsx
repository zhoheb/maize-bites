import { Search, X } from 'lucide-react';
import type { Ref } from 'react';
import { cx } from './ui/cx';

/** Filters the loaded events by title, food and building. "/" focuses it from anywhere on Home. */
export function SearchBox({
  value,
  onChange,
  inputRef,
  autoFocus = false,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  inputRef?: Ref<HTMLInputElement> | undefined;
  /** Take focus on mount: the field was just revealed by its button. */
  autoFocus?: boolean;
  className?: string | undefined;
}) {
  return (
    <div className={cx('relative', className)}>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3"
        strokeWidth={1.75}
      />
      <input
        ref={inputRef}
        type="text"
        role="searchbox"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        // Only ever set in response to pressing the search button.
        autoFocus={autoFocus}
        aria-label="Search events"
        aria-keyshortcuts="/"
        placeholder="Search pizza, Union, ramen"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && value !== '') {
            e.stopPropagation();
            onChange('');
          }
        }}
        className="h-9 w-full rounded-full border border-transparent bg-sunken pr-10 pl-9.5 text-sm text-ink placeholder:text-ink-3 focus:border-line-strong"
      />
      {value === '' ? (
        <kbd
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-2.5 hidden -translate-y-1/2 rounded-md border border-line-strong bg-card px-1.5 font-sans text-xs text-ink-3 lg:block"
        >
          /
        </kbd>
      ) : (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            onChange('');
          }}
          className="absolute top-1/2 right-1 grid size-7 -translate-y-1/2 place-items-center rounded-full text-ink-2 hover:bg-line"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      )}
    </div>
  );
}
