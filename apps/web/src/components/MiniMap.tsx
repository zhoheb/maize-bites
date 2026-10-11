import { useEffect, useRef } from 'react';
import { config } from '../config';
import { useTheme } from '../hooks/useTheme';
import type { LatLng } from '../lib/geo';
import { mapBackground, mapStyle } from '../lib/map-style';
import { maplibregl } from '../lib/maplibre';

/** A small, still map of one place, for the event details. Loaded lazily with MapLibre. */
export default function MiniMap({ at, label }: { at: LatLng; label: string }) {
  const container = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();

  useEffect(() => {
    if (!container.current) return;
    const m = new maplibregl.Map({
      container: container.current,
      style: config.VITE_MAP_STYLE_URL ?? mapStyle(theme),
      center: [at.lng, at.lat],
      zoom: 16,
      interactive: false,
      attributionControl: { compact: true },
    });
    const pin = document.createElement('div');
    pin.className = 'map-pin';
    pin.dataset['status'] = 'soon';
    pin.appendChild(Object.assign(document.createElement('span'), { className: 'map-pin-body' }));
    new maplibregl.Marker({ element: pin }).setLngLat([at.lng, at.lat]).addTo(m);
    return () => {
      m.remove();
    };
  }, [at.lat, at.lng, theme]);

  return (
    <div
      ref={container}
      role="img"
      aria-label={label}
      className="h-full w-full"
      style={{ background: mapBackground(theme) }}
    />
  );
}
