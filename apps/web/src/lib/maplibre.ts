import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre locates its worker next to its own module, which bundling breaks (dev and prod).
// Bundle the worker as its own entry and point MapLibre at it. Import MapLibre from here so
// every map shares that setup.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

maplibregl.setWorkerUrl(workerUrl);

export { maplibregl };
