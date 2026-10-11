import { CAMPUSES, DIETARY_TAGS, MEAL_TYPES } from '@maize-bites/shared';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useEventsInfinite } from '../api/queries';
import { NO_FILTERS, hasActiveFilters, toggle, type Filters, type Tab } from '../lib/filters';
import { CAMPUS_LABELS, DIETARY_LABELS, MEAL_LABELS } from '../lib/labels';
import { Button } from './ui/Button';
import { buttonClass } from './ui/button-class';
import { Chip } from './ui/Chip';
import { Toggle } from './ui/Toggle';

function Group({ label, children }: { label: string; children: ReactNode }) {
  const id = `sheet-filter-${label.toLowerCase()}`;
  return (
    <div role="group" aria-labelledby={id}>
      <h3 id={id} className="text-xs font-semibold tracking-wider text-ink-2 uppercase">
        {label}
      </h3>
      <div className="mt-2.5 flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

/**
 * The phone's filters: a full-screen sheet. Choices are a draft until "Show N events" applies
 * them; N is the live count for the draft, so there are no surprises on the way back.
 */
export function FilterSheet({
  tab,
  filters,
  onApply,
  onClose,
}: {
  tab: Tab;
  filters: Filters;
  onApply: (next: Filters) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(filters);
  const preview = useEventsInfinite(tab, draft);
  const count = preview.data?.pages.reduce((n, page) => n + page.events.length, 0);
  const more = preview.hasNextPage;

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-50 flex flex-col bg-page text-ink"
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-2">
            <Dialog.Title className="font-display text-xl font-bold">Filters</Dialog.Title>
            <Dialog.Close
              aria-label="Close filters"
              className={buttonClass({ variant: 'ghost', size: 'icon' })}
            >
              <X aria-hidden="true" className="size-5" />
            </Dialog.Close>
          </div>

          <div className="flex-1 space-y-7 overflow-y-auto px-4 py-5">
            <Group label="Campus">
              {CAMPUSES.map((c) => (
                <Chip
                  key={c}
                  pressed={draft.campuses.includes(c)}
                  onClick={() => {
                    setDraft({ ...draft, campuses: toggle(draft.campuses, c) });
                  }}
                >
                  {CAMPUS_LABELS[c]}
                </Chip>
              ))}
            </Group>
            <Group label="Diet">
              {DIETARY_TAGS.map((d) => (
                <Chip
                  key={d}
                  pressed={draft.dietary.includes(d)}
                  onClick={() => {
                    setDraft({ ...draft, dietary: toggle(draft.dietary, d) });
                  }}
                >
                  {DIETARY_LABELS[d]}
                </Chip>
              ))}
            </Group>
            <Group label="Meal">
              {MEAL_TYPES.map((m) => (
                <Chip
                  key={m}
                  pressed={draft.mealType === m}
                  onClick={() => {
                    setDraft({ ...draft, mealType: draft.mealType === m ? null : m });
                  }}
                >
                  {MEAL_LABELS[m]}
                </Chip>
              ))}
            </Group>
            <Toggle
              label="Only events open to all"
              checked={draft.openOnly}
              onChange={(openOnly) => {
                setDraft({ ...draft, openOnly });
              }}
            />
          </div>

          <div className="flex items-center gap-3 border-t border-line bg-surface px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <Button
              variant="ghost"
              disabled={!hasActiveFilters(draft)}
              onClick={() => {
                setDraft(NO_FILTERS);
              }}
            >
              Clear all
            </Button>
            <Button
              variant="maize"
              className="tabular flex-1"
              onClick={() => {
                onApply(draft);
                onClose();
              }}
            >
              {count === undefined
                ? 'Show events'
                : `Show ${count}${more ? '+' : ''} ${count === 1 ? 'event' : 'events'}`}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
