import type { FoodEvent } from '@maize-bites/shared';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre locates its worker next to its own module, which bundling breaks (dev and prod).
// Bundle the worker as its own entry and point MapLibre at it.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { ANN_ARBOR_CENTER, config } from '../config';

export interface EventMapProps {
  events: FoodEvent[];
  hoveredId: string | null;
  selectedId: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}

maplibregl.setWorkerUrl(workerUrl);

interface Pin {
  marker: maplibregl.Marker;
  el: HTMLButtonElement;
}

/**
 * MapLibre map with one keyboard-focusable button per event. Loaded lazily (it's the heaviest
 * dependency). The list is the text equivalent of the map, so the map itself is supplementary.
 */
export default function EventMap({
  events,
  hoveredId,
  selectedId,
  onHover,
  onSelect,
}: EventMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const pins = useRef(new Map<string, Pin>());
  const handlers = useRef({ onHover, onSelect });
  useLayoutEffect(() => {
    handlers.current = { onHover, onSelect };
  });

  useEffect(() => {
    if (!container.current) return;
    const m = new maplibregl.Map({
      container: container.current,
      style: config.VITE_MAP_STYLE_URL,
      center: ANN_ARBOR_CENTER,
      zoom: 14,
      attributionControl: { compact: true },
      cooperativeGestures: false,
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.current = m;
    // The map may mount inside a hidden panel (mobile list view); resize when it becomes visible.
    const observer = new ResizeObserver(() => {
      m.resize();
    });
    observer.observe(container.current);
    const current = pins.current;
    return () => {
      observer.disconnect();
      current.clear();
      m.remove();
      map.current = null;
    };
  }, []);

  // Sync markers with the event list and fit the view to them.
  const idsKey = events.map((e) => e.id).join(',');
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const located = events.filter(
      (e): e is FoodEvent & { lat: number; lng: number } => e.lat !== null && e.lng !== null,
    );
    const keep = new Set(located.map((e) => e.id));

    for (const [id, pin] of pins.current) {
      if (!keep.has(id)) {
        pin.marker.remove();
        pins.current.delete(id);
      }
    }
    for (const event of located) {
      if (pins.current.has(event.id)) continue;
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'map-pin';
      // MapLibre positions markers with `transform` on this element, so visuals go on a child.
      el.appendChild(Object.assign(document.createElement('span'), { className: 'map-pin-dot' }));
      el.setAttribute('aria-label', `${event.title}. Show details.`);
      el.addEventListener('click', () => {
        handlers.current.onSelect(event.id);
      });
      el.addEventListener('mouseenter', () => {
        handlers.current.onHover(event.id);
      });
      el.addEventListener('mouseleave', () => {
        handlers.current.onHover(null);
      });
      el.addEventListener('focus', () => {
        handlers.current.onHover(event.id);
      });
      el.addEventListener('blur', () => {
        handlers.current.onHover(null);
      });
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([event.lng, event.lat])
        .addTo(m);
      pins.current.set(event.id, { marker, el });
    }

    if (located.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      for (const e of located) bounds.extend([e.lng, e.lat]);
      m.fitBounds(bounds, { padding: 56, maxZoom: 16, duration: 0 });
    }
    // idsKey captures the relevant change in `events`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  // Reflect hover/selection from the list.
  useEffect(() => {
    for (const [id, { el }] of pins.current) {
      el.classList.toggle('is-highlighted', id === hoveredId);
      el.classList.toggle('is-selected', id === selectedId);
    }
  }, [hoveredId, selectedId, idsKey]);

  const unlocated = events.filter((e) => e.lat === null || e.lng === null).length;

  return (
    <div className="relative h-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
      <div
        ref={container}
        role="region"
        aria-label="Map of free food events"
        className="h-full w-full"
      />
      {unlocated > 0 && (
        <p className="absolute bottom-2 left-2 rounded-md bg-white/95 px-2 py-1 text-xs text-slate-700 shadow">
          {unlocated} event{unlocated === 1 ? '' : 's'} without a map location
        </p>
      )}
    </div>
  );
}
