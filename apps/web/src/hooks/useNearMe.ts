import { useCallback, useState } from 'react';
import type { LatLng } from '../lib/geo';

export type NearMeState = 'idle' | 'locating' | 'on' | 'denied';

/**
 * The user's location, asked for only when they press "Near me" (never on page load). Pressing
 * it again turns it off. The position stays in memory for this visit and is sent nowhere.
 */
export function useNearMe(): { state: NearMeState; location: LatLng | null; toggle: () => void } {
  const [state, setState] = useState<NearMeState>('idle');
  const [location, setLocation] = useState<LatLng | null>(null);

  const toggle = useCallback(() => {
    if (state === 'on') {
      setState('idle');
      setLocation(null);
      return;
    }
    if (!('geolocation' in navigator)) {
      setState('denied');
      return;
    }
    setState('locating');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
        setState('on');
      },
      () => {
        setState('denied');
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }, [state]);

  return { state, location, toggle };
}
