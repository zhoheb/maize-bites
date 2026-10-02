import { lazy, Suspense, useState } from 'react';
import { useEventsInfinite } from '../api/queries';
import { EventCard, EventCardSkeleton } from '../components/EventCard';
import { EventDrawer } from '../components/EventDrawer';
import { FilterBar } from '../components/FilterBar';
import { EmptyState, ErrorState } from '../components/States';
import { Tabs } from '../components/Tabs';
import { PANEL_ID, TAB_LABELS, tabId } from '../lib/tabs';
import { UpdatedStamp } from '../components/UpdatedStamp';
import { eventHref, tabHref, useHomeParams, type View } from '../hooks/useHomeParams';
import { DESKTOP, useMediaQuery } from '../hooks/useMediaQuery';
import { useNow } from '../hooks/useNow';
import { hasActiveFilters, type Tab } from '../lib/filters';

const EventMap = lazy(() => import('../components/EventMap'));

const EMPTY: Record<Tab, { title: string; next?: Tab; nextLabel?: string }> = {
  now: { title: 'No free food right now.', next: 'today', nextLabel: 'Check Today' },
  today: { title: 'No more free food today.', next: 'week', nextLabel: 'Check This Week' },
  week: { title: 'No free food found this week yet.' },
};

function ViewToggle({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  return (
    <div
      role="group"
      aria-label="Show as"
      className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 lg:hidden"
    >
      {(['list', 'map'] as const).map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={view === v}
          onClick={() => {
            onChange(v);
          }}
          className={[
            'min-h-9 rounded-md px-4 text-sm font-semibold capitalize focus-visible:outline-3 focus-visible:outline-michigan-blue',
            view === v ? 'bg-michigan-blue text-white' : 'text-slate-700',
          ].join(' ')}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

export function HomePage() {
  const { params, filters, tab, selectedId, view, setFilters, setTab, setView, select } =
    useHomeParams();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const isDesktop = useMediaQuery(DESKTOP);
  const now = useNow();
  const query = useEventsInfinite(tab, filters);
  const events = query.data?.pages.flatMap((p) => p.events) ?? [];
  const showMap = isDesktop || view === 'map';
  const empty = EMPTY[tab];

  return (
    <div className="mx-auto max-w-7xl px-4 py-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-michigan-blue sm:text-3xl">
            Free food on campus
          </h1>
          <UpdatedStamp />
        </div>
        <Tabs value={tab} onChange={setTab} />
      </div>

      <div id={PANEL_ID} role="tabpanel" aria-labelledby={tabId(tab)} className="mt-4">
        <FilterBar filters={filters} onChange={setFilters} />

        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-sm text-slate-600" aria-live="polite">
            {query.isSuccess &&
              `${events.length}${query.hasNextPage ? '+' : ''} event${events.length === 1 ? '' : 's'} · ${TAB_LABELS[tab]}`}
          </p>
          <ViewToggle view={view} onChange={setView} />
        </div>

        <div className="mt-3 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-6">
          <section
            aria-label="Event list"
            className={view === 'map' ? 'hidden lg:block' : undefined}
          >
            {query.isPending ? (
              <div role="status" className="space-y-3">
                <span className="sr-only">Loading events…</span>
                {Array.from({ length: 5 }, (_, i) => (
                  <EventCardSkeleton key={i} />
                ))}
              </div>
            ) : query.isError ? (
              <ErrorState
                message="Couldn't load events. Check your connection."
                onRetry={() => void query.refetch()}
              />
            ) : events.length === 0 ? (
              <EmptyState
                title={empty.title}
                action={
                  empty.next && empty.nextLabel
                    ? { label: empty.nextLabel, to: tabHref(params, empty.next) }
                    : undefined
                }
              >
                {hasActiveFilters(filters) && (
                  <button
                    type="button"
                    onClick={() => {
                      setFilters({ campuses: [], dietary: [], openOnly: false, mealType: null });
                    }}
                    className="font-semibold text-michigan-blue underline underline-offset-2"
                  >
                    Try clearing your filters
                  </button>
                )}
              </EmptyState>
            ) : (
              <>
                <ul className="space-y-3">
                  {events.map((event) => (
                    <li key={event.id}>
                      <EventCard
                        event={event}
                        now={now}
                        href={eventHref(params, event.id)}
                        selected={event.id === selectedId}
                        highlighted={event.id === hoveredId}
                        onHover={setHoveredId}
                      />
                    </li>
                  ))}
                </ul>
                {query.hasNextPage && (
                  <button
                    type="button"
                    onClick={() => void query.fetchNextPage()}
                    disabled={query.isFetchingNextPage}
                    className="mt-4 min-h-11 w-full rounded-lg border border-slate-300 bg-white text-sm font-semibold text-michigan-blue hover:bg-slate-50 focus-visible:outline-3 focus-visible:outline-michigan-blue disabled:opacity-60"
                  >
                    {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
                  </button>
                )}
              </>
            )}
          </section>

          <div
            className={[
              'h-[calc(100dvh-16rem)] min-h-80 lg:sticky lg:top-4 lg:h-[calc(100dvh-8rem)]',
              view === 'list' ? 'hidden lg:block' : '',
            ].join(' ')}
          >
            {showMap && (
              <Suspense
                fallback={
                  <div
                    className="h-full animate-pulse rounded-xl bg-slate-200"
                    aria-hidden="true"
                  />
                }
              >
                <EventMap
                  events={events}
                  hoveredId={hoveredId}
                  selectedId={selectedId}
                  onHover={setHoveredId}
                  onSelect={select}
                />
              </Suspense>
            )}
          </div>
        </div>
      </div>

      {selectedId && (
        <EventDrawer
          key={selectedId}
          id={selectedId}
          onClose={() => {
            select(null);
          }}
        />
      )}
    </div>
  );
}
