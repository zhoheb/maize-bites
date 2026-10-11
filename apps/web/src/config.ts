import { z } from 'zod';

// Client config. Only VITE_* variables reach the browser; never put secrets here.
const configSchema = z.object({
  /**
   * Optional MapLibre style URL that replaces our own basemap (lib/map-style.ts, drawn over
   * OpenFreeMap's free OSM tiles) in both themes. Leave unset to use the built-in styles.
   */
  VITE_MAP_STYLE_URL: z.url().optional(),
});

export const config = configSchema.parse(import.meta.env);

/** Map starts centered on the Diag. [lng, lat] */
export const ANN_ARBOR_CENTER: [number, number] = [-83.7382, 42.2771];
