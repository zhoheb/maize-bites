import type { FoodEvent } from '@maize-bites/shared';
import { List, Map as MapIcon, Search, SlidersHorizontal } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEventsInfinite } from '../api/queries';
import { EventList, EventListSkeleton } from '../components/EventList';
import { ActiveFilters, FilterBar } from '../components/FilterBar';
import { FilterSheet } from '../components/FilterSheet';
import { HeroStrip } from '../components/HeroStrip';
import { MapBoundary } from '../components/MapBoundary';
import { SearchBox } from '../components/SearchBox';
import { SiteCredit } from '../components/SiteCredit';
import { EmptyState, ErrorState, OfflineBanner } from '../components/States';
import { Button } from '../components/ui/Button';
import { RemovableChip } from '../components/ui/Chip';
import { IconButton } from '../components/ui/IconButton';
import { Segmented } from '../components/ui/Segmented';
import { BottomSheet } from '../components/ui/Sheet';
import { snapHeight, type SheetSnap } from '../components/ui/sheet-snaps';
import { eventHref, tabHref, useHomeParams } from '../hooks/useHomeParams';
import { useIdle } from '../hooks/useIdle';
import { DESKTOP, useMediaQuery } from '../hooks/useMediaQuery';
import { useNearMe } from '../hooks/useNearMe';
import { useNow } from '../hooks/useNow';
import { useOnline } from '../hooks/useOnline';
import { useTheme } from '../hooks/useTheme';
import { useViewportHeight } from '../hooks/useViewportHeight';
import { emptyCopy } from '../lib/empty';
import { NO_FILTERS, countActiveFilters, hasActiveFilters } from '../lib/filters';
import { distanceMeters, formatWalk, inBbox, type Bbox } from '../lib/geo';
import { groupEvents } from '../lib/grouping';
import { hero as heroFor } from '../lib/hero';
import { mapBackground } from '../lib/map-style';
import { loadList, saveList } from '../lib/offline-cache';
import { isLocated } from '../lib/pins';
import { searchEvents } from '../lib/search';
import { TAB_OPTIONS } from '../lib/tabs';

const EventMap = lazy(() => import('../components/EventMap'));
const EventDrawer = lazy(() =>
  import('../components/EventDrawer').then((m) => ({ default: m.EventDrawer })),
);

const NO_EVENTS: FoodEvent[] = [];
/** Width of the detail drawer, which covers the right of the map while open. */
const DRAWER_WIDTH = 440;
/** The site header (h-14). */
const HEADER_HEIGHT = 56;
/** How long a row stays washed in colour after its pin is picked. */
const FLASH_MS = 1500;

const savedAtFormat = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });

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
  const [flashId, setFlashId] = useState<string | null>(null);
  /** "Search this area": the list is limited to what was on the map when it was pressed. */
  const [area, setArea] = useState<Bbox | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  /** Phones keep the search field tucked behind an icon until it's wanted. */
  const [searchOpen, setSearchOpen] = useState(false);
  const [snap, setSnap] = useState<SheetSnap>('peek');
  const isDesktop = useMediaQuery(DESKTOP);
  const viewportHeight = useViewportHeight();
  const online = useOnline();
  const now = useNow();
  const nearMe = useNearMe();
  const { theme } = useTheme();
  // The map is the heaviest thing on the page; start it once the list has had its turn.
  const mapReady = useIdle();
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
  const searched = useMemo(() => searchEvents(all, search), [all, search]);
  const events = useMemo(
    () => (area ? searched.filter((e) => isLocated(e) && inBbox(e, area)) : searched),
    [searched, area],
  );
  const groups = useMemo(() => groupEvents(events, now), [events, now]);
  const ready = loaded !== null || saved !== null;
  const hero = useMemo(
    () => (ready ? heroFor(tab, events, now, query.hasNextPage && search === '' && !area) : null),
    [ready, tab, events, now, query.hasNextPage, search, area],
  );
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

  /** A pin was picked: show its row, and wash it in colour for a moment. */
  const focusFromMap = useCallback((id: string | null) => {
    setFocusedId(id);
    setFlashId(id);
  }, []);
  useEffect(() => {
    if (flashId === null) return;
    const timer = setTimeout(() => {
      setFlashId(null);
    }, FLASH_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [flashId]);

  // Bring the focused event's row into view (a pin was picked, or j/k moved).
  useEffect(() => {
    if (focusedId === null) return;
    const card = listRef.current?.querySelector(`[data-event-id="${CSS.escape(focusedId)}"]`);
    card?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [focusedId]);

  // Keyboard: j/k move through the rows, Enter opens (the row's own link), Esc lets go,
  // "/" jumps to search.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || typingIn(e.target)) return;
      if (e.key === '/') {
        e.preventDefault();
        setSnap('full');
        setSearchOpen(true);
        searchRef.current?.focus();
      } else if (e.key === 'j' || e.key === 'k') {
        // In the order shown, which is grouped (and puts likely-over events last).
        const order = groups.flatMap((g) => g.events);
        if (order.length === 0) return;
        e.preventDefault();
        const at = order.findIndex((ev) => ev.id === focusedId);
        const next =
          at === -1 ? 0 : Math.min(order.length - 1, Math.max(0, at + (e.key === 'j' ? 1 : -1)));
        const id = order[next]?.id;
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
  }, [groups, focusedId]);

  const unlocated = events.filter((e) => !isLocated(e)).length;
  const empty = emptyCopy(tab, now);
  const results = !ready ? (
    unreachable ? (
      <div className="pt-3">
        <ErrorState
          message={
            online
              ? "Couldn't load events. Check your connection."
              : "You're offline, and this list hasn't been saved on this device yet."
          }
          onRetry={() => void query.refetch()}
        />
      </div>
    ) : (
      <EventListSkeleton />
    )
  ) : (
    <>
      {offlineAsOf && <OfflineBanner savedAt={savedAtFormat.format(offlineAsOf)} />}
      {area && (
        <div className="pt-3">
          <RemovableChip
            label="Map area"
            onRemove={() => {
              setArea(null);
            }}
          />
        </div>
      )}
      {events.length > 0 ? (
        <>
          <EventList
            groups={groups}
            now={now}
            hrefFor={hrefFor}
            selectedId={selectedId}
            highlightedId={hoveredId ?? focusedId}
            flashId={flashId}
            distances={distances}
            onHover={setHoveredId}
            stickyClass={isDesktop || view === 'map' ? 'top-0' : 'top-14'}
          />
          {query.hasNextPage && (
            <Button
              className="mt-2 w-full"
              disabled={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
            </Button>
          )}
          {(unlocated > 0 || nearMe.state === 'denied') && (
            <p role="status" className="mt-3 text-xs text-ink-3">
              {nearMe.state === 'denied'
                ? 'Location is blocked for this site. Allow it in your browser settings to use Near me.'
                : `${unlocated} of these ${unlocated === 1 ? 'has' : 'have'} no map location and ${unlocated === 1 ? 'is' : 'are'} only in this list.`}
            </p>
          )}
        </>
      ) : search !== '' ? (
        <EmptyState title={`Nothing matches “${search}”.`}>
          <p>Search looks at titles, food and buildings.</p>
          <Button
            className="mt-4"
            size="sm"
            onClick={() => {
              setSearch('');
            }}
          >
            Show all events
          </Button>
        </EmptyState>
      ) : area ? (
        <EmptyState title="Nothing in this part of the map.">
          <Button
            className="mt-4"
            size="sm"
            onClick={() => {
              setArea(null);
            }}
          >
            Show everywhere
          </Button>
        </EmptyState>
      ) : hasActiveFilters(filters) ? (
        <EmptyState title="Nothing matches those filters.">
          <p>Loosen them to see what else is on.</p>
          <Button
            className="mt-4"
            size="sm"
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
    </>
  );

  // Before MapLibre arrives the map area is already the basemap's land colour, so the map
  // seems to be there at once and its tiles and pins fade in.
  const mapPlaceholder = (
    <div className="h-full w-full" style={{ background: mapBackground(theme) }} />
  );
  const map = (inset: { right?: number; bottom?: number }) => (
    <MapBoundary>
      <Suspense fallback={mapPlaceholder}>
        {!mapReady ? (
          mapPlaceholder
        ) : (
          <EventMap
            events={events}
            hoveredId={hoveredId}
            focusedId={activeId}
            onHover={setHoveredId}
            onFocus={focusFromMap}
            onOpen={select}
            inset={inset}
            userLocation={nearMe.location}
            nearMe={nearMe.state}
            onNearMe={nearMe.toggle}
            onSearchArea={setArea}
            areaActive={area !== null}
            peek={selectedId === null}
          />
        )}
      </Suspense>
    </MapBoundary>
  );

  const drawer = selectedId && (
    <Suspense fallback={null}>
      <EventDrawer
        key={selectedId}
        id={selectedId}
        onClose={() => {
          select(null);
        }}
      />
    </Suspense>
  );

  if (isDesktop) {
    return (
      <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
        <div className="space-y-3 px-5 pt-4 pb-3">
          <HeroStrip hero={hero} nextHref={hrefFor} />
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
        <div className="grid min-h-0 flex-1 grid-cols-[32.5rem_minmax(0,1fr)] border-t border-line">
          <section
            ref={listRef}
            aria-label="Event list"
            className="relative z-[1] overflow-y-auto overscroll-contain border-r border-line bg-page px-5 pb-6 shadow-edge"
          >
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
  const showSearch = searchOpen || search !== '';
  const controls = (
    <div className="flex items-center gap-2">
      <Segmented label="When" value={tab} options={TAB_OPTIONS} onChange={setTab} />
      <IconButton
        label="Search"
        variant="secondary"
        aria-expanded={showSearch}
        onClick={() => {
          setSearchOpen(!showSearch);
          if (showSearch) setSearch('');
        }}
        className="ml-auto"
      >
        <Search aria-hidden="true" className="size-[1.125rem]" strokeWidth={1.75} />
      </IconButton>
      <IconButton
        label={activeCount > 0 ? `Filters, ${activeCount} active` : 'Filters'}
        variant="secondary"
        onClick={() => {
          setFiltersOpen(true);
        }}
        className="relative"
      >
        <SlidersHorizontal aria-hidden="true" className="size-[1.125rem]" strokeWidth={1.75} />
        {activeCount > 0 && (
          <span
            aria-hidden="true"
            className="tabular absolute -top-1 -right-1 grid size-4.5 place-items-center rounded-full bg-primary text-[0.6875rem] font-bold text-on-primary"
          >
            {activeCount}
          </span>
        )}
      </IconButton>
      <IconButton
        label={view === 'map' ? 'Show as a list' : 'Show on the map'}
        variant="secondary"
        onClick={() => {
          setView(view === 'map' ? 'list' : 'map');
        }}
      >
        {view === 'map' ? (
          <List aria-hidden="true" className="size-[1.125rem]" strokeWidth={1.75} />
        ) : (
          <MapIcon aria-hidden="true" className="size-[1.125rem]" strokeWidth={1.75} />
        )}
      </IconButton>
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
  const searchBox = showSearch && (
    <SearchBox
      value={search}
      onChange={setSearch}
      inputRef={searchRef}
      autoFocus={searchOpen}
      className="w-full"
    />
  );

  if (view === 'list') {
    return (
      <div ref={listRef} className="mx-auto max-w-2xl px-4 pt-5 pb-4">
        <div className="space-y-3">
          <HeroStrip hero={hero} nextHref={hrefFor} compact />
          {controls}
          {searchBox}
          <ActiveFilters filters={filters} onChange={setFilters} />
        </div>
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
        {map({ bottom: snapHeight(snap === 'full' ? 'peek' : snap, available) })}
      </div>
      <BottomSheet
        label="Event list"
        snap={snap}
        onSnapChange={setSnap}
        available={available}
        header={
          <div className="space-y-2.5">
            <HeroStrip hero={hero} nextHref={hrefFor} compact />
            {controls}
          </div>
        }
      >
        <div ref={listRef} className="px-4 pb-8">
          <div
            className="space-y-2.5 empty:hidden"
            onFocus={() => {
              setSnap('full');
            }}
          >
            {searchBox}
            <ActiveFilters filters={filters} onChange={setFilters} />
          </div>
          {results}
        </div>
      </BottomSheet>
      {filterSheet}
      {drawer}
    </div>
  );
}
