import { z } from 'zod';

// Client config. Only VITE_* variables reach the browser; never put secrets here.
const configSchema = z.object({
  /** MapLibre style URL. Default: OpenFreeMap's OSM-based "positron" (free, no key). */
  VITE_MAP_STYLE_URL: z.url().default('https://tiles.openfreemap.org/styles/positron'),
});

export const config = configSchema.parse(import.meta.env);

/** Map starts centered on the Diag. [lng, lat] */
export const ANN_ARBOR_CENTER: [number, number] = [-83.7382, 42.2771];
