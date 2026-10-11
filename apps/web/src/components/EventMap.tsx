import type { FoodEvent } from '@maize-bites/shared';
import { LocateFixed, Maximize, Minus, Plus, Search, type LucideIcon } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import Supercluster from 'supercluster';
import { ANN_ARBOR_CENTER, config } from '../config';
import type { NearMeState } from '../hooks/useNearMe';
import { useNow } from '../hooks/useNow';
import { useTheme } from '../hooks/useTheme';
import { FOOD_ICONS, foodIconKind, type FoodIconKind } from '../lib/food-icons';
import { directionsUrl, foodText, formatLocation, isApplePlatform } from '../lib/format';
import type { Bbox, LatLng } from '../lib/geo';
import { MEAL_LABELS } from '../lib/labels';
import { mapBackground, mapStyle } from '../lib/map-style';
import { maplibregl } from '../lib/maplibre';
import { isLocated, pinLabel, type LocatedEvent } from '../lib/pins';
import { statusPhrase, timeStatus, type TimeStatus } from '../lib/status';
import { buttonClass } from './ui/button-class';
import { cx } from './ui/cx';

export interface EventMapProps {
  events: FoodEvent[];
  /** Hovered in the list: its pin grows. */
  hoveredId: string | null;
  /** The current event (picked on the map or with j/k): its pin is selected and gets a card. */
  focusedId: string | null;
  onHover: (id: string | null) => void;
  onFocus: (id: string | null) => void;
  /** "Details" in the peek card. */
  onOpen: (id: string) => void;
  /** Screen space covered by a drawer or sheet, so pins are centred in what's visible. */
  inset?: { right?: number; bottom?: number };
  userLocation?: LatLng | null;
  nearMe?: NearMeState;
  onNearMe?: () => void;
  /** Called with the visible bounds when the user presses "Search this area". */
  onSearchArea?: (bounds: Bbox) => void;
  /** The list is limited to an area: don't refit the view when results change. */
  areaActive?: boolean;
  /** Show the peek card over the focused pin. Off while the details are open over the map. */
  peek?: boolean;
}

const MAX_ZOOM = 19;
/** Pins closer than this many pixels merge into a counted cluster. */
const CLUSTER_RADIUS = 36;

// Lucide icons as SVG markup, for pins (plain DOM that MapLibre positions). Rendered once per
// icon the first time a pin needs it.
const iconCache = new Map<FoodIconKind, string>();
function iconMarkup(kind: FoodIconKind): string {
  let markup = iconCache.get(kind);
  if (markup === undefined) {
    const Icon = FOOD_ICONS[kind];
    const holder = document.createElement('div');
    const root = createRoot(holder);
    flushSync(() => {
      root.render(<Icon aria-hidden="true" strokeWidth={2.25} />);
    });
    markup = holder.innerHTML;
    root.unmount();
    iconCache.set(kind, markup);
  }
  return markup;
}
// Warm the cache outside React's render and effect phases, where flushSync is not allowed.
for (const kind of Object.keys(FOOD_ICONS) as FoodIconKind[]) iconMarkup(kind);

interface PinProps {
  id: string;
}
interface Shown {
  marker: maplibregl.Marker;
  el: HTMLButtonElement;
  /** Event ids this marker stands for (one for a pin, several for a cluster). */
  ids: string[];
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** The most urgent status among events, for a cluster. */
function topStatus(events: readonly FoodEvent[], now: Date): TimeStatus {
  const order: TimeStatus[] = ['now', 'soon', 'later', 'ended'];
  const statuses = new Set(events.map((e) => timeStatus(e, now)));
  return order.find((s) => statuses.has(s)) ?? 'later';
}

function ToolbarButton({
  icon: Icon,
  label,
  pressed,
  busy = false,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  pressed?: boolean;
  busy?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={busy}
      onClick={onClick}
      className="grid size-10 place-items-center text-ink transition-colors hover:bg-sunken disabled:opacity-50 aria-pressed:text-rsvp"
    >
      <Icon
        aria-hidden="true"
        className={cx('size-[1.125rem]', busy && 'animate-pulse')}
        strokeWidth={1.75}
      />
    </button>
  );
}

/**
 * The map half of the interface. Pins are real buttons (keyboard and screen-reader reachable)
 * sized and coloured by urgency, nearby pins merge into counted clusters, and hover, focus and
 * selection mirror the list. One toolbar floats over it; nothing else does, apart from the
 * "Search this area" offer after the user moves the map. Loaded lazily: MapLibre is the
 * heaviest dependency.
 */
export default function EventMap({
  events,
  hoveredId,
  focusedId,
  onHover,
  onFocus,
  onOpen,
  inset,
  userLocation = null,
  nearMe = 'idle',
  onNearMe,
  onSearchArea,
  areaActive = false,
  peek = true,
}: EventMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const shown = useRef(new Map<string, Shown>());
  const index = useRef<Supercluster<PinProps> | null>(null);
  const popup = useRef<maplibregl.Popup | null>(null);
  const userMarker = useRef<maplibregl.Marker | null>(null);
  /** The user has panned or zoomed since the view was last set for them. */
  const [moved, setMoved] = useState(false);
  const { theme } = useTheme();
  const now = useNow();

  // The latest props, for handlers attached once to the map and to pin elements.
  const live = useRef({ events, now, hoveredId, focusedId, onHover, onFocus, onOpen, inset });
  useLayoutEffect(() => {
    live.current = { events, now, hoveredId, focusedId, onHover, onFocus, onOpen, inset };
  });

  const padding = useCallback(() => {
    const { inset: i } = live.current;
    return { top: 56, left: 48, right: 72 + (i?.right ?? 0), bottom: 48 + (i?.bottom ?? 0) };
  }, []);

  /** Marks which pins are hovered and focused. A clustered event lights up its cluster. */
  const paint = useCallback(() => {
    const { hoveredId: hovered, focusedId: focused } = live.current;
    for (const { el: node, ids } of shown.current.values()) {
      node.classList.toggle('is-highlighted', hovered !== null && ids.includes(hovered));
      node.classList.toggle('is-selected', focused !== null && ids.includes(focused));
    }
  }, []);

  const closePopup = useCallback(() => {
    popup.current?.remove();
    popup.current = null;
  }, []);

  const openPopup = useCallback(
    (at: [number, number], content: HTMLElement) => {
      const m = map.current;
      if (!m) return;
      closePopup();
      popup.current = new maplibregl.Popup({
        offset: 20,
        closeButton: false,
        closeOnClick: false,
        maxWidth: '280px',
        focusAfterOpen: false,
      })
        .setLngLat(at)
        .setDOMContent(content)
        .addTo(m);
    },
    [closePopup],
  );

  /**
   * The peek card over a pin: status, title, food, place, and the two things to do next. Built
   * as plain DOM because MapLibre owns the popup (it supplies the arrow to the pin).
   */
  const showEvent = useCallback(
    (event: LocatedEvent) => {
      const at = live.current.now;
      const status = timeStatus(event, at);
      const box = el('div', 'w-[17.5rem] p-3.5');
      box.setAttribute('role', 'group');
      box.setAttribute('aria-label', event.title);
      box.appendChild(
        el(
          'p',
          cx(
            'tabular inline-flex h-6 items-center rounded-full px-2.5 text-xs font-semibold',
            event.likelyGone || status === 'ended'
              ? 'bg-sunken text-ink-3'
              : status === 'now'
                ? 'bg-now-soft text-now-ink'
                : status === 'soon'
                  ? 'bg-soon-soft text-soon-ink'
                  : 'bg-sunken text-ink-2',
          ),
          event.likelyGone ? 'Likely over' : statusPhrase(event, at),
        ),
      );
      box.appendChild(
        el(
          'p',
          'mt-2 line-clamp-2 text-base leading-[1.375rem] font-semibold text-ink',
          event.title,
        ),
      );
      const food = foodText(event, MEAL_LABELS);
      if (food) box.appendChild(el('p', 'mt-1 text-sm font-medium text-ink-2', food));
      const place = formatLocation(event);
      if (place) box.appendChild(el('p', 'mt-0.5 truncate text-[0.8125rem] text-ink-3', place));

      const actions = el('div', 'mt-3 grid grid-cols-2 gap-2');
      const directions = el('a', buttonClass({ variant: 'secondary', size: 'sm' }), 'Directions');
      directions.href = directionsUrl(event, isApplePlatform()) ?? '#';
      directions.target = '_blank';
      directions.rel = 'noopener noreferrer';
      const details = el('button', buttonClass({ variant: 'primary', size: 'sm' }), 'Details');
      details.type = 'button';
      details.addEventListener('click', () => {
        live.current.onOpen(event.id);
      });
      actions.append(directions, details);
      box.appendChild(actions);
      openPopup([event.lng, event.lat], box);
    },
    [openPopup],
  );

  /** Several events at one spot: a list to pick from. */
  const showList = useCallback(
    (at: [number, number], members: readonly FoodEvent[]) => {
      const box = el('div', 'w-[17.5rem] p-2');
      box.appendChild(
        el(
          'p',
          'px-2 pt-1.5 pb-1 text-xs font-semibold tracking-wide text-ink-3 uppercase',
          `${members.length} events here`,
        ),
      );
      const list = el('ul', 'max-h-56 overflow-y-auto');
      for (const event of members) {
        const item = el('li', '');
        const button = el(
          'button',
          'block w-full truncate rounded-lg px-2 py-2 text-left text-sm font-medium text-ink hover:bg-sunken',
          event.title,
        );
        button.type = 'button';
        button.addEventListener('click', () => {
          live.current.onFocus(event.id);
        });
        item.appendChild(button);
        list.appendChild(item);
      }
      box.appendChild(list);
      openPopup(at, box);
    },
    [openPopup],
  );

  /** Redraws pins and clusters for the current view. Markers that are still right are kept. */
  const sync = useCallback(() => {
    const m = map.current;
    const clusterIndex = index.current;
    if (!m || !clusterIndex) return;
    const { events: all, now: at } = live.current;
    const byId = new Map(all.map((e) => [e.id, e]));
    const bounds = m.getBounds();
    const features = clusterIndex.getClusters(
      [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
      Math.floor(m.getZoom()),
    );

    const keep = new Set<string>();
    for (const feature of features) {
      const [lng = 0, lat = 0] = feature.geometry.coordinates;
      // A cluster's properties are loosely typed by supercluster; read them defensively.
      const props: Record<string, unknown> = { ...feature.properties };
      const clusterId = typeof props['cluster_id'] === 'number' ? props['cluster_id'] : null;
      const ids =
        clusterId === null
          ? typeof props['id'] === 'string'
            ? [props['id']]
            : []
          : clusterIndex.getLeaves(clusterId, Infinity).map((leaf) => leaf.properties.id);
      const members = ids.flatMap((id) => byId.get(id) ?? []);
      const [first] = members;
      if (!first) continue;
      const key = clusterId === null ? first.id : `cluster:${[...ids].sort().join(',')}`;
      keep.add(key);

      const existing = shown.current.get(key);
      if (existing) {
        // Status changes as time passes (soon → now), so refresh it on every pass.
        existing.el.dataset['status'] = topStatus(members, at);
        continue;
      }

      const node = el('button', clusterId === null ? 'map-pin' : 'map-pin map-cluster');
      node.type = 'button';
      node.dataset['status'] = topStatus(members, at);
      const body = el('span', 'map-pin-body');
      node.appendChild(body);

      if (clusterId === null) {
        body.innerHTML = iconMarkup(foodIconKind(first));
        if (first.likelyGone) node.dataset['gone'] = 'true';
        node.setAttribute('aria-label', pinLabel(first, at));
        node.addEventListener('click', (e) => {
          e.stopPropagation();
          live.current.onFocus(first.id);
        });
        const hover = (id: string | null) => () => {
          live.current.onHover(id);
        };
        node.addEventListener('mouseenter', hover(first.id));
        node.addEventListener('mouseleave', hover(null));
        node.addEventListener('focus', hover(first.id));
        node.addEventListener('blur', hover(null));
      } else {
        body.textContent = String(members.length);
        node.setAttribute('aria-label', `${members.length} events here. Zoom in to see them.`);
        node.addEventListener('click', (e) => {
          e.stopPropagation();
          const zoom = clusterIndex.getClusterExpansionZoom(clusterId);
          if (zoom <= MAX_ZOOM && zoom > m.getZoom()) {
            m.easeTo({ center: [lng, lat], zoom, padding: padding() });
          } else {
            // Same building: zooming can't separate them, so list them instead.
            showList([lng, lat], members);
          }
        });
      }

      const marker = new maplibregl.Marker({ element: node }).setLngLat([lng, lat]).addTo(m);
      shown.current.set(key, { marker, el: node, ids });
    }

    for (const [key, item] of shown.current) {
      if (!keep.has(key)) {
        item.marker.remove();
        shown.current.delete(key);
      }
    }
    paint();
  }, [paint, padding, showList]);

  // Create the map once.
  useEffect(() => {
    if (!container.current) return;
    const node = container.current;
    const m = new maplibregl.Map({
      container: node,
      style:
        config.VITE_MAP_STYLE_URL ??
        mapStyle(document.documentElement.dataset['theme'] === 'dark' ? 'dark' : 'light'),
      center: ANN_ARBOR_CENTER,
      zoom: 14,
      maxZoom: MAX_ZOOM,
      attributionControl: { compact: true },
      cooperativeGestures: false,
    });
    map.current = m;

    m.on('moveend', (e) => {
      sync();
      // `originalEvent` is set only for moves the user made (drag, wheel, pinch), not ours.
      if ('originalEvent' in e && e.originalEvent) setMoved(true);
    });
    m.on('click', () => {
      live.current.onFocus(null);
    });
    // "idle" means every visible tile is drawn; the screenshot script waits for it.
    m.on('idle', () => {
      node.dataset['mapIdle'] = 'true';
    });
    m.on('movestart', () => {
      node.dataset['mapIdle'] = 'false';
    });

    // The map may mount inside a hidden or resizing panel; keep its canvas the right size.
    const observer = new ResizeObserver(() => {
      m.resize();
    });
    observer.observe(node);
    const markers = shown.current;
    return () => {
      observer.disconnect();
      markers.clear();
      popup.current = null;
      userMarker.current = null;
      m.remove();
      map.current = null;
    };
  }, [sync]);

  // Follow the theme with the matching basemap. Pins are DOM, so they survive a style change.
  const firstTheme = useRef(true);
  useEffect(() => {
    if (firstTheme.current) {
      firstTheme.current = false;
      return;
    }
    if (!config.VITE_MAP_STYLE_URL) map.current?.setStyle(mapStyle(theme));
  }, [theme]);

  // New results: rebuild the cluster index and fit the view to them.
  const idsKey = events.map((e) => `${e.id}${e.likelyGone ? '!' : ''}`).join(',');
  const fitted = useRef(false);
  const fit = useCallback(
    (animate: boolean) => {
      const m = map.current;
      const located = live.current.events.filter(isLocated);
      if (!m || located.length === 0) return;
      const bounds = new maplibregl.LngLatBounds();
      for (const e of located) bounds.extend([e.lng, e.lat]);
      m.fitBounds(bounds, { padding: padding(), maxZoom: 16.5, duration: animate ? 500 : 0 });
      setMoved(false);
    },
    [padding],
  );
  useEffect(() => {
    const clusterIndex = new Supercluster<PinProps>({ radius: CLUSTER_RADIUS, maxZoom: MAX_ZOOM });
    clusterIndex.load(
      events.filter(isLocated).map((e) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [e.lng, e.lat] },
        properties: { id: e.id },
      })),
    );
    index.current = clusterIndex;
    // Drop every marker: an event's details (status, likely over) may have changed.
    for (const item of shown.current.values()) item.marker.remove();
    shown.current.clear();
    // Results limited to an area the user chose stay where the user put the map.
    if (!areaActive) fit(fitted.current);
    fitted.current = true;
    sync();
    // idsKey captures the relevant change in `events`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, fit, sync]);

  // Statuses drift as time passes; refresh pins on each clock tick.
  useEffect(() => {
    sync();
  }, [now, sync]);

  useEffect(() => {
    paint();
  }, [hoveredId, focusedId, paint]);

  // The focused event: bring it into view and open its peek card.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const event = focusedId === null ? undefined : events.find((e) => e.id === focusedId);
    if (!event || !isLocated(event)) {
      closePopup();
      return;
    }
    if (peek) showEvent(event);
    else closePopup();
    m.easeTo({
      center: [event.lng, event.lat],
      zoom: Math.max(m.getZoom(), 15.5),
      padding: padding(),
      duration: 600,
    });
    // Re-run for a new focus or a new result set, not for every render's fresh `events` array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedId, idsKey, peek, closePopup, showEvent, padding]);

  // "Near me": a dot for the user, and the view moves to include them.
  useEffect(() => {
    const m = map.current;
    userMarker.current?.remove();
    userMarker.current = null;
    if (!m || !userLocation) return;
    const dot = el(
      'div',
      'size-4 rounded-full border-2 border-panel bg-rsvp shadow-[0_0_0_6px_color-mix(in_srgb,var(--rsvp)_25%,transparent)]',
    );
    dot.setAttribute('role', 'img');
    dot.setAttribute('aria-label', 'Your location');
    userMarker.current = new maplibregl.Marker({ element: dot })
      .setLngLat([userLocation.lng, userLocation.lat])
      .addTo(m);
    m.easeTo({
      center: [userLocation.lng, userLocation.lat],
      zoom: Math.max(m.getZoom(), 15.5),
      padding: padding(),
    });
  }, [userLocation, padding]);

  const zoomBy = useCallback((by: number) => {
    const m = map.current;
    m?.easeTo({ zoom: m.getZoom() + by, duration: 250 });
  }, []);

  return (
    <div className="relative h-full overflow-hidden" style={{ background: mapBackground(theme) }}>
      <div
        ref={container}
        role="region"
        aria-label="Map of free food events"
        className="h-full w-full"
      />

      {onSearchArea && moved && (
        <button
          type="button"
          onClick={() => {
            const bounds = map.current?.getBounds();
            if (!bounds) return;
            setMoved(false);
            onSearchArea({
              west: bounds.getWest(),
              south: bounds.getSouth(),
              east: bounds.getEast(),
              north: bounds.getNorth(),
            });
          }}
          className={buttonClass(
            { variant: 'secondary', size: 'sm' },
            'absolute top-3 left-1/2 -translate-x-1/2 animate-enter border-line bg-raised shadow-lift',
          )}
        >
          <Search aria-hidden="true" className="size-4" strokeWidth={1.75} />
          Search this area
        </button>
      )}

      <div
        role="toolbar"
        aria-label="Map controls"
        aria-orientation="vertical"
        className="absolute top-3 right-3 flex flex-col divide-y divide-line overflow-hidden rounded-xl border border-line bg-raised shadow-lift"
      >
        {onNearMe && (
          <ToolbarButton
            icon={LocateFixed}
            label={
              nearMe === 'denied'
                ? 'Near me (location is blocked for this site)'
                : nearMe === 'locating'
                  ? 'Finding your location'
                  : 'Near me'
            }
            pressed={nearMe === 'on'}
            busy={nearMe === 'locating'}
            onClick={onNearMe}
          />
        )}
        <ToolbarButton
          icon={Maximize}
          label="Fit results"
          onClick={() => {
            closePopup();
            fit(true);
          }}
        />
        <ToolbarButton
          icon={Plus}
          label="Zoom in"
          onClick={() => {
            zoomBy(1);
          }}
        />
        <ToolbarButton
          icon={Minus}
          label="Zoom out"
          onClick={() => {
            zoomBy(-1);
          }}
        />
      </div>
    </div>
  );
}
