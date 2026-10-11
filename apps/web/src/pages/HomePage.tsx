import type { FoodEvent } from '@maize-bites/shared';
import { List, Map as MapIcon, SlidersHorizontal } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEventsInfinite } from '../api/queries';
import { EventCardSkeleton } from '../components/EventCard';
import { EventDrawer } from '../components/EventDrawer';
import { EventList } from '../components/EventList';
import { ActiveFilters, FilterBar } from '../components/FilterBar';
import { FilterSheet } from '../components/FilterSheet';
import { HeroStrip } from '../components/HeroStrip';
import { MapBoundary } from '../components/MapBoundary';
import { SearchBox } from '../components/SearchBox';
import { SiteCredit } from '../components/SiteCredit';
import { EmptyState, ErrorState, OfflineBanner } from '../components/States';
import { Button } from '../components/ui/Button';
import { buttonClass } from '../components/ui/button-class';
import { Segmented } from '../components/ui/Segmented';
import { BottomSheet } from '../components/ui/Sheet';
import { snapHeight, type SheetSnap } from '../components/ui/sheet-snaps';
import { Skeleton } from '../components/ui/Skeleton';
import { eventHref, tabHref, useHomeParams } from '../hooks/useHomeParams';
import { DESKTOP, useMediaQuery } from '../hooks/useMediaQuery';
import { useNearMe } from '../hooks/useNearMe';
import { useNow } from '../hooks/useNow';
import { useOnline } from '../hooks/useOnline';
import { useViewportHeight } from '../hooks/useViewportHeight';
import { emptyCopy } from '../lib/empty';
import { NO_FILTERS, countActiveFilters, hasActiveFilters } from '../lib/filters';
import { distanceMeters, formatWalk } from '../lib/geo';
import { groupEvents } from '../lib/grouping';
import { loadList, saveList } from '../lib/offline-cache';
import { isLocated } from '../lib/pins';
import { searchEvents } from '../lib/search';
import { TAB_LABELS, TAB_OPTIONS } from '../lib/tabs';

const EventMap = lazy(() => import('../components/EventMap'));

const NO_EVENTS: FoodEvent[] = [];
/** Width of the detail drawer, which covers the right of the map while open. */
const DRAWER_WIDTH = 480;
/** The site header (h-14). */
const HEADER_HEIGHT = 56;

const savedAtFormat = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  hour: 'numeric',
  minute: '2-digit',
});

/** True when a key press belongs to a text field or an open dialog, not to the page. */
function typingIn(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
    target.closest('[role="dialog"], [role="menu"]') !== null
  );
}

export function HomePage() {
  const {
    params,
    filters,
    tab,
    search,
    selectedId,
    view,
    setFilters,
    setSearch,
    setTab,
    setView,
    select,
  } = useHomeParams();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [snap, setSnap] = useState<SheetSnap>('peek');
  const isDesktop = useMediaQuery(DESKTOP);
  const viewportHeight = useViewportHeight();
  const online = useOnline();
  const now = useNow();
  const nearMe = useNearMe();
  const query = useEventsInfinite(tab, filters);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const loaded = useMemo(() => query.data?.pages.flatMap((p) => p.events) ?? null, [query.data]);
  // No connection and nothing loaded this visit: fall back to the copy saved on this device.
  const unreachable = query.isError || query.fetchStatus === 'paused';
  const saved = useMemo(
    () => (loaded === null && unreachable ? loadList(tab, filters) : null),
    [loaded, unreachable, tab, filters],
  );
  const all = loaded ?? saved?.events ?? NO_EVENTS;
  const events = useMemo(() => searchEvents(all, search), [all, search]);
  const groups = useMemo(() => groupEvents(events, now), [events, now]);
  const offlineAsOf = saved
    ? saved.savedAt
    : !online && loaded !== null
      ? new Date(query.dataUpdatedAt)
      : null;

  useEffect(() => {
    if (loaded !== null && query.isSuccess && !query.isPlaceholderData)
      saveList(tab, filters, loaded, new Date());
  }, [loaded, query.isSuccess, query.isPlaceholderData, tab, filters]);

  const distances = useMemo(() => {
    const from = nearMe.location;
    if (!from) return undefined;
    return new Map(
      events.filter(isLocated).map((e) => [e.id, formatWalk(distanceMeters(from, e))] as const),
    );
  }, [events, nearMe.location]);

  const hrefFor = useCallback((id: string) => eventHref(params, id), [params]);
  /** The event the map points at: the open one, else the one picked by pin or keyboard. */
  const activeId = selectedId ?? focusedId;

  // Bring the focused event's card into view (a pin was picked, or j/k moved).
  useEffect(() => {
    if (focusedId === null) return;
    const card = listRef.current?.querySelector(`[data-event-id="${CSS.escape(focusedId)}"]`);
    card?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [focusedId]);

  // Keyboard: j/k move through the cards, Enter opens (the card's own link), Esc lets go,
  // "/" jumps to search.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || typingIn(e.target)) return;
      if (e.key === '/') {
        e.preventDefault();
        setSnap('full');
        searchRef.current?.focus();
      } else if (e.key === 'j' || e.key === 'k') {
        if (events.length === 0) return;
        e.preventDefault();
        const at = events.findIndex((ev) => ev.id === focusedId);
        const next =
          at === -1 ? 0 : Math.min(events.length - 1, Math.max(0, at + (e.key === 'j' ? 1 : -1)));
        const id = events[next]?.id;
        if (id === undefined) return;
        setFocusedId(id);
        listRef.current
          ?.querySelector<HTMLElement>(`[data-event-id="${CSS.escape(id)}"] a`)
          ?.focus({ preventScroll: true });
      } else if (e.key === 'Escape' && focusedId !== null) {
        setFocusedId(null);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [events, focusedId]);

  const count = (
    <p className="tabular text-sm text-ink-2" aria-live="polite">
      {(loaded !== null || saved !== null) &&
        `${events.length}${query.hasNextPage && search === '' ? '+' : ''} ${events.length === 1 ? 'event' : 'events'} · ${TAB_LABELS[tab]}${search === '' ? '' : ` · matching “${search}”`}`}
    </p>
  );

  const empty = emptyCopy(tab, now);
  const results =
    loaded === null && saved === null ? (
      unreachable ? (
        <ErrorState
          message={
            online
              ? "Couldn't load events. Check your connection."
              : "You're offline, and this list hasn't been saved on this device yet."
          }
          onRetry={() => void query.refetch()}
        />
      ) : (
        <div role="status" className="space-y-3">
          <span className="sr-only">Loading events…</span>
          {Array.from({ length: 5 }, (_, i) => (
            <EventCardSkeleton key={i} />
          ))}
        </div>
      )
    ) : (
      <div className="space-y-3">
        {offlineAsOf && <OfflineBanner savedAt={savedAtFormat.format(offlineAsOf)} />}
        {events.length > 0 ? (
          <>
            <EventList
              groups={groups}
              hrefFor={hrefFor}
              selectedId={selectedId}
              highlightedId={hoveredId ?? focusedId}
              distances={distances}
              onHover={setHoveredId}
              stickyClass={isDesktop || view === 'map' ? 'top-0' : 'top-14'}
            />
            {query.hasNextPage && (
              <Button
                className="w-full"
                disabled={query.isFetchingNextPage}
                onClick={() => void query.fetchNextPage()}
              >
                {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
              </Button>
            )}
          </>
        ) : search !== '' ? (
          <EmptyState title={`Nothing matches “${search}”.`}>
            <p>Search looks at titles, food and buildings.</p>
            <Button
              className="mt-4"
              onClick={() => {
                setSearch('');
              }}
            >
              Show all events
            </Button>
          </EmptyState>
        ) : hasActiveFilters(filters) ? (
          <EmptyState title="Nothing matches those filters.">
            <p>Loosen them to see what else is on.</p>
            <Button
              className="mt-4"
              onClick={() => {
                setFilters(NO_FILTERS);
              }}
            >
              Clear filters
            </Button>
          </EmptyState>
        ) : (
          <EmptyState
            title={empty.title}
            actions={[
              ...(empty.next
                ? [{ label: empty.next.label, to: tabHref(params, empty.next.tab), primary: true }]
                : []),
              { label: 'Get alerts', to: '/alerts', primary: empty.next === null },
            ]}
          >
            {empty.hint}
          </EmptyState>
        )}
      </div>
    );

  const map = (inset: { right?: number; bottom?: number; top?: number }) => (
    <MapBoundary>
      <Suspense fallback={<Skeleton className="h-full w-full rounded-none" />}>
        <EventMap
          events={events}
          hoveredId={hoveredId}
          focusedId={activeId}
          onHover={setHoveredId}
          onFocus={setFocusedId}
          onOpen={select}
          inset={inset}
          userLocation={nearMe.location}
          nearMe={nearMe.state}
          onNearMe={nearMe.toggle}
        />
      </Suspense>
    </MapBoundary>
  );

  const drawer = selectedId && (
    <EventDrawer
      key={selectedId}
      id={selectedId}
      onClose={() => {
        select(null);
      }}
    />
  );

  if (isDesktop) {
    return (
      <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
        <div className="space-y-3 border-b border-line px-6 pt-5 pb-3">
          <HeroStrip />
          <FilterBar
            tab={tab}
            onTab={setTab}
            filters={filters}
            onChange={setFilters}
            search={search}
            onSearch={setSearch}
            searchRef={searchRef}
          />
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(24rem,44%)_minmax(0,1fr)]">
          <section
            ref={listRef}
            aria-label="Event list"
            className="overflow-y-auto overscroll-contain px-6 pb-6"
          >
            <div className="pt-3 pb-1">{count}</div>
            {results}
            <SiteCredit className="mt-8" />
          </section>
          <div className="border-l border-line">
            {map({ right: selectedId ? DRAWER_WIDTH : 0 })}
          </div>
        </div>
        {drawer}
      </div>
    );
  }

  const activeCount = countActiveFilters(filters);
  const controls = (
    <div className="flex items-center gap-2">
      <Segmented
        label="When"
        value={tab}
        options={TAB_OPTIONS}
        onChange={setTab}
        className="shadow-card"
      />
      <button
        type="button"
        aria-label={activeCount > 0 ? `Filters, ${activeCount} active` : 'Filters'}
        onClick={() => {
          setFiltersOpen(true);
        }}
        className={buttonClass(
          { variant: activeCount > 0 ? 'maize' : 'secondary', size: 'icon' },
          'tabular relative ml-auto shadow-card',
        )}
      >
        <SlidersHorizontal aria-hidden="true" className="size-4.5" />
        {activeCount > 0 && (
          <span
            aria-hidden="true"
            className="absolute -top-1 -right-1 grid size-5 place-items-center rounded-full bg-primary text-[0.6875rem] font-bold text-on-primary"
          >
            {activeCount}
          </span>
        )}
      </button>
      <button
        type="button"
        aria-label={view === 'map' ? 'Show as a list' : 'Show on the map'}
        onClick={() => {
          setView(view === 'map' ? 'list' : 'map');
        }}
        className={buttonClass({ variant: 'secondary', size: 'icon' }, 'shadow-card')}
      >
        {view === 'map' ? (
          <List aria-hidden="true" className="size-4.5" />
        ) : (
          <MapIcon aria-hidden="true" className="size-4.5" />
        )}
      </button>
    </div>
  );
  const filterSheet = filtersOpen && (
    <FilterSheet
      tab={tab}
      filters={filters}
      onApply={setFilters}
      onClose={() => {
        setFiltersOpen(false);
      }}
    />
  );
  const searchBox = (
    <SearchBox value={search} onChange={setSearch} inputRef={searchRef} className="w-full" />
  );

  if (view === 'list') {
    return (
      <div ref={listRef} className="mx-auto max-w-2xl space-y-3 px-4 py-4">
        <HeroStrip />
        {controls}
        {searchBox}
        <ActiveFilters filters={filters} onChange={setFilters} />
        {count}
        <section aria-label="Event list">{results}</section>
        <SiteCredit className="pt-6" />
        {filterSheet}
        {drawer}
      </div>
    );
  }

  // Phones: the map fills the screen and the list rides over it in a sheet.
  const available = viewportHeight - HEADER_HEIGHT;
  return (
    <div className="relative overflow-hidden" style={{ height: available }}>
      <div className="absolute inset-0">
        {/* At full height the sheet hides the map anyway; keep the smaller inset so it rests. */}
        {map({ top: 52, bottom: snapHeight(snap === 'full' ? 'peek' : snap, available) })}
      </div>
      <div className="absolute inset-x-3 top-3 z-10">{controls}</div>
      <BottomSheet
        label="Event list"
        snap={snap}
        onSnapChange={setSnap}
        available={available}
        header={
          <div className="space-y-2.5">
            <HeroStrip compact />
            <div
              onFocus={() => {
                setSnap('full');
              }}
            >
              {searchBox}
            </div>
          </div>
        }
      >
        <div ref={listRef} className="space-y-3 px-4 pb-8">
          <ActiveFilters filters={filters} onChange={setFilters} />
          {count}
          {results}
        </div>
      </BottomSheet>
      {filterSheet}
      {drawer}
    </div>
  );
}
