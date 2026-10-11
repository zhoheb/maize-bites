import { Search, X } from 'lucide-react';
import type { Ref } from 'react';
import { cx } from './ui/cx';

/** Filters the loaded events by title, food and building. "/" focuses it from anywhere on Home. */
export function SearchBox({
  value,
  onChange,
  inputRef,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  inputRef?: Ref<HTMLInputElement> | undefined;
  className?: string | undefined;
}) {
  return (
    <div className={cx('relative', className)}>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3"
      />
      <input
        ref={inputRef}
        type="text"
        role="searchbox"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
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
        className="h-10 w-full rounded-full border border-line-strong bg-surface pr-10 pl-10 text-sm text-ink placeholder:text-ink-3"
      />
      {value === '' ? (
        <kbd
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 rounded-md border border-line px-1.5 font-sans text-xs text-ink-3 lg:block"
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
          className="absolute top-1/2 right-1.5 grid size-7 -translate-y-1/2 place-items-center rounded-full text-ink-2 hover:bg-sunken"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      )}
    </div>
  );
}
