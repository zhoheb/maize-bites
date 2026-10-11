import type { ExpressionSpecification, StyleSpecification } from 'maplibre-gl';
import type { Theme } from './theme';

// Our own basemap over the free OpenFreeMap vector tiles (OpenStreetMap data, OpenMapTiles
// schema; no key, no paid API). It is deliberately quiet: paper land, white roads with a soft
// casing, buildings a shade apart, few labels. Campus land gets a faint warm wash so the
// university reads as the subject. One palette per theme.

const TILES = 'https://tiles.openfreemap.org/planet';
const GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';

interface Palette {
  land: string;
  water: string;
  green: string;
  campus: string;
  building: string;
  buildingLine: string;
  path: string;
  road: string;
  roadCasing: string;
  rail: string;
  label: string;
  labelStrong: string;
  waterLabel: string;
}

// A map is a picture, not UI chrome, so its colours live here rather than in the CSS tokens.
// They are chosen to sit a clear step away from the panels beside it in both themes.
const PALETTES: Record<Theme, Palette> = {
  light: {
    land: '#f2efe8',
    water: '#cfe0ea',
    green: '#e3ebd8',
    campus: '#f4ecd2',
    building: '#e8e3d8',
    buildingLine: '#d9d2c3',
    path: '#ddd6c8',
    road: '#ffffff',
    roadCasing: '#e0d9cb',
    rail: '#d6cfc0',
    label: '#7c8697',
    labelStrong: '#5c6678',
    waterLabel: '#7f9bb0',
  },
  dark: {
    land: '#0f151c',
    water: '#0b1a26',
    green: '#111d1c',
    campus: '#161d22',
    building: '#18212b',
    buildingLine: '#222d3a',
    path: '#1a232d',
    road: '#1e2833',
    roadCasing: '#0b1016',
    rail: '#1a232d',
    label: '#5e6b7a',
    labelStrong: '#8491a3',
    waterLabel: '#3d566b',
  },
};

const classIn = (...classes: string[]): ExpressionSpecification => [
  'match',
  ['get', 'class'],
  classes,
  true,
  false,
];

const MAJOR = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary'];
const MINOR = ['minor', 'service', 'residential', 'unclassified', 'busway'];
const PATHS = ['path', 'track', 'pedestrian'];

const width = (stops: [number, number][]): ExpressionSpecification => [
  'interpolate',
  ['exponential', 1.5],
  ['zoom'],
  ...stops.flat(),
];

export function mapStyle(theme: Theme): StyleSpecification {
  const c = PALETTES[theme];
  const text = {
    'text-font': ['Noto Sans Regular'],
    'text-max-width': 8,
  };
  const halo = { 'text-halo-color': c.land, 'text-halo-width': 1.4 };

  return {
    version: 8,
    name: `Maize Bites ${theme}`,
    glyphs: GLYPHS,
    sources: {
      osm: {
        type: 'vector',
        url: TILES,
        attribution:
          '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
      },
    },
    layers: [
      { id: 'land', type: 'background', paint: { 'background-color': c.land } },
      {
        id: 'green-cover',
        type: 'fill',
        source: 'osm',
        'source-layer': 'landcover',
        filter: classIn('grass', 'wood'),
        paint: { 'fill-color': c.green, 'fill-opacity': 0.7 },
      },
      {
        id: 'campus',
        type: 'fill',
        source: 'osm',
        'source-layer': 'landuse',
        filter: classIn('university', 'college', 'school'),
        paint: { 'fill-color': c.campus },
      },
      {
        id: 'park',
        type: 'fill',
        source: 'osm',
        'source-layer': 'park',
        paint: { 'fill-color': c.green },
      },
      {
        id: 'water',
        type: 'fill',
        source: 'osm',
        'source-layer': 'water',
        paint: { 'fill-color': c.water },
      },
      {
        id: 'waterway',
        type: 'line',
        source: 'osm',
        'source-layer': 'waterway',
        paint: {
          'line-color': c.water,
          'line-width': width([
            [10, 1],
            [16, 4],
          ]),
        },
      },
      {
        id: 'paths',
        type: 'line',
        source: 'osm',
        'source-layer': 'transportation',
        minzoom: 14.5,
        filter: classIn(...PATHS),
        paint: {
          'line-color': c.path,
          'line-width': width([
            [14, 0.6],
            [18, 2],
          ]),
          'line-dasharray': [2, 1.5],
        },
      },
      {
        id: 'rail',
        type: 'line',
        source: 'osm',
        'source-layer': 'transportation',
        minzoom: 11,
        filter: classIn('rail', 'transit'),
        paint: { 'line-color': c.rail, 'line-width': 1 },
      },
      {
        id: 'roads-minor-casing',
        type: 'line',
        source: 'osm',
        'source-layer': 'transportation',
        minzoom: 13,
        filter: classIn(...MINOR),
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': c.roadCasing,
          'line-width': width([
            [13, 1.4],
            [18, 14],
          ]),
        },
      },
      {
        id: 'roads-major-casing',
        type: 'line',
        source: 'osm',
        'source-layer': 'transportation',
        filter: classIn(...MAJOR),
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': c.roadCasing,
          'line-width': width([
            [9, 1],
            [13, 4],
            [18, 24],
          ]),
        },
      },
      {
        id: 'roads-minor',
        type: 'line',
        source: 'osm',
        'source-layer': 'transportation',
        minzoom: 13,
        filter: classIn(...MINOR),
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': c.road,
          'line-width': width([
            [13, 0.8],
            [18, 11],
          ]),
        },
      },
      {
        id: 'roads-major',
        type: 'line',
        source: 'osm',
        'source-layer': 'transportation',
        filter: classIn(...MAJOR),
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': c.road,
          'line-width': width([
            [9, 0.5],
            [13, 2.6],
            [18, 20],
          ]),
        },
      },
      {
        id: 'buildings',
        type: 'fill',
        source: 'osm',
        'source-layer': 'building',
        minzoom: 13.5,
        paint: {
          'fill-color': c.building,
          'fill-opacity': ['interpolate', ['linear'], ['zoom'], 13.5, 0, 15, 1],
        },
      },
      {
        id: 'buildings-outline',
        type: 'line',
        source: 'osm',
        'source-layer': 'building',
        minzoom: 15,
        paint: { 'line-color': c.buildingLine, 'line-width': 0.75 },
      },
      {
        id: 'water-labels',
        type: 'symbol',
        source: 'osm',
        'source-layer': 'water_name',
        layout: {
          ...text,
          'text-field': ['get', 'name'],
          'text-size': 11,
          'text-font': ['Noto Sans Italic'],
        },
        paint: { 'text-color': c.waterLabel, ...halo, 'text-halo-color': c.water },
      },
      {
        id: 'road-labels',
        type: 'symbol',
        source: 'osm',
        'source-layer': 'transportation_name',
        minzoom: 14,
        filter: classIn(...MAJOR, ...MINOR),
        layout: {
          ...text,
          'symbol-placement': 'line',
          'text-field': ['get', 'name'],
          'text-size': width([
            [14, 10],
            [18, 13],
          ]),
        },
        paint: { 'text-color': c.label, ...halo },
      },
      {
        id: 'poi-labels',
        type: 'symbol',
        source: 'osm',
        'source-layer': 'poi',
        minzoom: 15,
        // Reduced density: of all points of interest, only university buildings are named.
        filter: classIn('college', 'university'),
        layout: { ...text, 'text-field': ['get', 'name'], 'text-size': 11, 'text-padding': 6 },
        paint: { 'text-color': c.label, ...halo },
      },
      {
        id: 'place-labels',
        type: 'symbol',
        source: 'osm',
        'source-layer': 'place',
        filter: classIn('city', 'town', 'village', 'suburb', 'neighbourhood', 'quarter'),
        layout: {
          ...text,
          'text-font': ['Noto Sans Bold'],
          'text-field': ['get', 'name'],
          'text-size': ['match', ['get', 'class'], ['city', 'town'], 15, 11.5],
          'text-transform': ['match', ['get', 'class'], ['city', 'town'], 'none', 'uppercase'],
          'text-letter-spacing': ['match', ['get', 'class'], ['city', 'town'], 0, 0.08],
        },
        paint: { 'text-color': c.labelStrong, ...halo },
      },
    ],
  };
}

/** The page colour behind the map before tiles arrive, so there is no flash of grey. */
export const mapBackground = (theme: Theme) => PALETTES[theme].land;
