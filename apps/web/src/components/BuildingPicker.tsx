import type { Building } from '@maize-bites/shared';
import { useId, useState } from 'react';
import { matchBuildings } from '../lib/buildings';
import { CAMPUS_LABELS } from '../lib/labels';
import { inputClass } from './forms';

/** A type-ahead for campus buildings (an ARIA combobox with a listbox popup). */
export function BuildingPicker({
  buildings,
  value,
  onChange,
  inputId,
  invalid = false,
  describedBy,
}: {
  buildings: readonly Building[];
  value: Building | null;
  onChange: (building: Building | null) => void;
  inputId: string;
  invalid?: boolean;
  describedBy?: string | undefined;
}) {
  const listId = useId();
  const [text, setText] = useState(value?.name ?? '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const options = open ? matchBuildings(buildings, text) : [];

  const choose = (building: Building) => {
    onChange(building);
    setText(building.name);
    setOpen(false);
  };

  return (
    <div className="relative">
      <input
        id={inputId}
        role="combobox"
        type="text"
        autoComplete="off"
        placeholder="Start typing: Union, BBB, Mason…"
        aria-expanded={options.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={options[active] ? `${listId}-${options[active].id}` : undefined}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        className={inputClass}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setActive(0);
          // Typing after a pick means the pick no longer stands.
          if (value) onChange(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setActive((i) => Math.min(i + 1, Math.max(options.length - 1, 0)));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === 'Enter' && options[active]) {
            e.preventDefault();
            choose(options[active]);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
        onBlur={() => {
          setOpen(false);
        }}
      />
      <ul
        id={listId}
        role="listbox"
        aria-label="Buildings"
        hidden={options.length === 0}
        className="absolute z-10 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
      >
        {options.map((building, index) => (
          <li
            key={building.id}
            id={`${listId}-${building.id}`}
            role="option"
            aria-selected={index === active}
            className={`flex min-h-11 cursor-pointer items-center justify-between gap-3 px-3 text-sm ${
              index === active ? 'bg-michigan-blue/10 text-michigan-blue' : 'text-slate-800'
            }`}
            // mousedown fires before the input's blur closes the list.
            onMouseDown={(e) => {
              e.preventDefault();
              choose(building);
            }}
            onMouseEnter={() => {
              setActive(index);
            }}
          >
            <span className="font-medium">{building.name}</span>
            <span className="shrink-0 text-xs text-slate-500">
              {CAMPUS_LABELS[building.campus]}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
