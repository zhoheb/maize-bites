import { useRef, type KeyboardEvent } from 'react';
import { TABS, type Tab } from '../lib/filters';
import { PANEL_ID, TAB_LABELS, tabId } from '../lib/tabs';

/** WAI-ARIA tabs: one tab stop; arrow keys, Home, and End move between tabs. */
export function Tabs({ value, onChange }: { value: Tab; onChange: (tab: Tab) => void }) {
  const refs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});

  function onKeyDown(e: KeyboardEvent) {
    const i = TABS.indexOf(value);
    const target =
      e.key === 'ArrowRight'
        ? TABS[(i + 1) % TABS.length]
        : e.key === 'ArrowLeft'
          ? TABS[(i - 1 + TABS.length) % TABS.length]
          : e.key === 'Home'
            ? TABS[0]
            : e.key === 'End'
              ? TABS[TABS.length - 1]
              : undefined;
    if (!target) return;
    e.preventDefault();
    onChange(target);
    refs.current[target]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label="When"
      className="inline-flex rounded-xl bg-slate-100 p-1"
      onKeyDown={onKeyDown}
    >
      {TABS.map((tab) => {
        const selected = tab === value;
        return (
          <button
            key={tab}
            ref={(el) => {
              refs.current[tab] = el;
            }}
            id={tabId(tab)}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={PANEL_ID}
            tabIndex={selected ? 0 : -1}
            onClick={() => {
              onChange(tab);
            }}
            className={[
              'min-h-10 rounded-lg px-4 text-sm font-semibold transition-colors',
              'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-michigan-blue',
              selected
                ? 'bg-michigan-blue text-white shadow'
                : 'text-slate-700 hover:text-michigan-blue',
            ].join(' ')}
          >
            {TAB_LABELS[tab]}
          </button>
        );
      })}
    </div>
  );
}
