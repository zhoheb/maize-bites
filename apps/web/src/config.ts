import { z } from 'zod';

// Client config. Only VITE_* variables reach the browser; never put secrets here.
const configSchema = z.object({
  /**
   * Optional MapLibre style URL that replaces our own basemap (lib/map-style.ts, drawn over
   * OpenFreeMap's free OSM tiles) in both themes. Leave unset to use the built-in styles.
   */
  VITE_MAP_STYLE_URL: z.url().optional(),
  /**
   * Show events whose titles start with "[demo]" (from `pnpm db:seed:demo`). Off unless set, so
   * demo data in a local database never reaches the page by accident.
   */
  VITE_SHOW_DEMO: z.stringbool({ truthy: ['true', '1'], falsy: ['false', '0', ''] }).default(false),
});

export const config = configSchema.parse(import.meta.env);

/** Map starts centered on the Diag. [lng, lat] */
export const ANN_ARBOR_CENTER: [number, number] = [-83.7382, 42.2771];
