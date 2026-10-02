import type { Campus } from '@maize-bites/shared';

export interface BuildingSeed {
  name: string;
  aliases: string[];
  campus: Campus;
  lat: number;
  lng: number;
}

// Coordinates cross-checked against OpenStreetMap Nominatim (© OpenStreetMap contributors,
// ODbL) on 2026-09-30. Each point is the OSM feature for that building by name or street address.
// `TODO(verify)` marks coordinates that came from a weak match: a nearby bus stop, a
// multi-building complex, or an address mismatch. Check those on a map before relying on them.
//
// Aliases are matched case-insensitively against feed location_name values. Keep them unique
// across buildings (enforced by buildings.test.ts).
export const BUILDINGS: readonly BuildingSeed[] = [
  // ── Central campus ──────────────────────────────────────────────────────────
  {
    name: 'Michigan Union',
    aliases: ['Union', 'The Union', 'Michigan Union Building', '530 S State St'],
    campus: 'central',
    lat: 42.27517,
    lng: -83.74151,
  },
  {
    name: 'Michigan League',
    aliases: ['League', 'The League', '911 N University Ave'],
    campus: 'central',
    lat: 42.27935,
    lng: -83.73771,
  },
  {
    name: 'Shapiro Undergraduate Library',
    aliases: ['Shapiro', 'Shapiro Library', 'UGLi', 'Ugli', 'Undergraduate Library'],
    campus: 'central',
    lat: 42.27563,
    lng: -83.73719,
  },
  {
    name: 'Hatcher Graduate Library',
    aliases: ['Hatcher', 'Hatcher Library', 'Harlan Hatcher Graduate Library', 'Grad Library'],
    campus: 'central',
    lat: 42.27622,
    lng: -83.73818,
  },
  {
    name: 'Mason Hall',
    aliases: ['Mason'],
    campus: 'central',
    lat: 42.27705,
    lng: -83.7395,
  },
  {
    name: 'Angell Hall',
    aliases: ['Angell', 'Angell Hall Auditorium', 'Angell Hall Computing Site'],
    campus: 'central',
    lat: 42.27672,
    lng: -83.73975,
  },
  {
    name: 'Haven Hall',
    aliases: ['Haven'],
    campus: 'central',
    lat: 42.27651,
    lng: -83.73923,
  },
  {
    name: 'Tisch Hall',
    aliases: ['Tisch'],
    campus: 'central',
    lat: 42.27624,
    lng: -83.73958,
  },
  {
    name: 'Chemistry Building',
    aliases: ['Chemistry', 'Chem Building', 'Chem', 'Willard H. Dow Laboratory'],
    campus: 'central',
    lat: 42.27803,
    lng: -83.73671,
  },
  {
    name: 'Biological Sciences Building',
    aliases: ['BSB', 'Bio Sciences Building'],
    campus: 'central',
    lat: 42.279,
    lng: -83.7345,
  },
  {
    // TODO(verify): OSM point is the center of the multi-building Ross complex.
    name: 'Ross School of Business',
    aliases: [
      'Ross',
      'Ross School',
      'Stephen M. Ross School of Business',
      'Blau Hall',
      '701 Tappan',
    ],
    campus: 'central',
    lat: 42.27278,
    lng: -83.73697,
  },
  {
    name: 'Rackham Graduate School',
    aliases: ['Rackham', 'Rackham Building', 'Horace H. Rackham Building', 'Rackham Amphitheatre'],
    campus: 'central',
    lat: 42.28087,
    lng: -83.73828,
  },
  {
    name: 'Hill Auditorium',
    // Not "Hill": that usually means the Hill neighborhood residence halls.
    aliases: ['Hill Aud'],
    campus: 'central',
    lat: 42.27918,
    lng: -83.73908,
  },
  {
    name: 'Modern Languages Building',
    aliases: ['MLB'],
    campus: 'central',
    lat: 42.27988,
    lng: -83.73908,
  },
  {
    name: 'Weiser Hall',
    aliases: ['Weiser'],
    campus: 'central',
    lat: 42.2765,
    lng: -83.735,
  },
  {
    name: 'North Quad',
    aliases: ['North Quadrangle', 'NQ'],
    campus: 'central',
    lat: 42.28087,
    lng: -83.73961,
  },
  {
    name: 'Weill Hall',
    aliases: [
      'Ford School',
      'Gerald R. Ford School of Public Policy',
      'Joan and Sanford Weill Hall',
    ],
    campus: 'central',
    lat: 42.2724,
    lng: -83.7404,
  },
  {
    name: 'Hutchins Hall',
    aliases: ['Law Quad', 'Law School', 'Michigan Law'],
    campus: 'central',
    lat: 42.27367,
    lng: -83.74036,
  },
  {
    name: 'Dana Building',
    aliases: ['Dana', 'Samuel Trask Dana Building', 'SEAS'],
    campus: 'central',
    lat: 42.27732,
    lng: -83.73661,
  },
  {
    name: 'University of Michigan Museum of Art',
    aliases: ['UMMA', 'Museum of Art'],
    campus: 'central',
    lat: 42.27559,
    lng: -83.73984,
  },
  {
    name: 'Palmer Commons',
    aliases: ['Palmer'],
    campus: 'central',
    lat: 42.28064,
    lng: -83.73387,
  },
  {
    name: 'Trotter Multicultural Center',
    aliases: ['Trotter', 'Trotter MC', 'William Monroe Trotter Multicultural Center'],
    campus: 'central',
    lat: 42.27707,
    lng: -83.74109,
  },
  {
    name: 'Hadley Family Recreation & Well-Being Center',
    aliases: ['CCRB', 'Central Campus Recreation Building', 'Hadley Center', '401 Washtenaw Ave'],
    campus: 'central',
    lat: 42.27822,
    lng: -83.7327,
  },
  {
    name: 'The Diag',
    aliases: ['Diag', 'Diag Block M'],
    campus: 'central',
    lat: 42.2771,
    lng: -83.73801,
  },
  {
    name: 'Lane Hall',
    aliases: ['Lane'],
    campus: 'central',
    lat: 42.27998,
    lng: -83.74125,
  },

  // Central campus residence halls
  {
    name: 'East Quad',
    aliases: ['East Quadrangle', 'EQ'],
    campus: 'central',
    lat: 42.27293,
    lng: -83.73516,
  },
  {
    name: 'West Quad',
    aliases: ['West Quadrangle', 'WQ'],
    campus: 'central',
    lat: 42.27491,
    lng: -83.74256,
  },
  {
    name: 'South Quad',
    aliases: ['South Quadrangle', 'SQ'],
    campus: 'central',
    lat: 42.27371,
    lng: -83.74215,
  },
  {
    name: 'Mosher-Jordan Hall',
    aliases: ['MoJo', 'Mosher Jordan', 'Mosher-Jordan'],
    campus: 'central',
    lat: 42.28015,
    lng: -83.7317,
  },
  {
    name: 'Markley Hall',
    aliases: ['Markley', 'Mary Markley Hall'],
    campus: 'central',
    lat: 42.28088,
    lng: -83.72888,
  },
  {
    // TODO(verify): OSM only matched the "Stockwell Hall" bus stop on Observatory St.
    name: 'Stockwell Hall',
    aliases: ['Stockwell'],
    campus: 'central',
    lat: 42.2777,
    lng: -83.73085,
  },

  // ── North campus ────────────────────────────────────────────────────────────
  {
    name: 'Duderstadt Center',
    aliases: ['Dude', 'The Dude', 'James and Anne Duderstadt Center'],
    campus: 'north',
    lat: 42.29118,
    lng: -83.71577,
  },
  {
    name: 'Pierpont Commons',
    aliases: ['Pierpont'],
    campus: 'north',
    lat: 42.29112,
    lng: -83.7176,
  },
  {
    name: 'Bob and Betty Beyster Building',
    aliases: ['BBB', 'Beyster', 'Beyster Building', 'Bob & Betty Beyster Building'],
    campus: 'north',
    lat: 42.29302,
    lng: -83.71635,
  },
  {
    name: 'EECS Building',
    aliases: ['EECS', 'Electrical Engineering and Computer Science Building'],
    campus: 'north',
    lat: 42.29234,
    lng: -83.71388,
  },
  {
    name: 'G.G. Brown Laboratory',
    aliases: ['GG Brown', 'G. G. Brown', 'GGB', 'G.G. Brown Building'],
    campus: 'north',
    lat: 42.2933,
    lng: -83.71399,
  },
  {
    name: 'Lurie Engineering Center',
    aliases: ['LEC', 'Robert H. Lurie Engineering Center'],
    campus: 'north',
    lat: 42.29149,
    lng: -83.71389,
  },
  {
    name: 'Chrysler Center',
    aliases: ['Chrysler'],
    campus: 'north',
    lat: 42.29089,
    lng: -83.71677,
  },
  {
    name: 'Ford Motor Company Robotics Building',
    aliases: ['Ford Robotics Building', 'Robotics Building', 'FMCRB', 'FRB'],
    campus: 'north',
    lat: 42.29459,
    lng: -83.70941,
  },
  {
    // TODO(verify): OSM feature is at 2600 Plymouth Rd; NCRC's address is 2800 Plymouth Rd.
    name: 'North Campus Research Complex',
    aliases: ['NCRC'],
    campus: 'north',
    lat: 42.29988,
    lng: -83.7019,
  },
  {
    name: 'Art & Architecture Building',
    aliases: ['A&A', 'Art and Architecture Building', 'Taubman College'],
    campus: 'north',
    lat: 42.28958,
    lng: -83.71705,
  },
  {
    name: 'Earl V. Moore Building',
    aliases: ['Moore Building', 'School of Music'],
    campus: 'north',
    lat: 42.29038,
    lng: -83.72097,
  },
  {
    name: 'Bursley Hall',
    aliases: ['Bursley'],
    campus: 'north',
    lat: 42.2938,
    lng: -83.71989,
  },

  // ── Medical campus ──────────────────────────────────────────────────────────
  {
    name: 'University Hospital',
    aliases: ['UH', 'Michigan Medicine University Hospital'],
    campus: 'medical',
    lat: 42.28468,
    lng: -83.72942,
  },
  {
    name: 'Taubman Health Sciences Library',
    aliases: ['THL', 'Taubman Library'],
    campus: 'medical',
    lat: 42.28353,
    lng: -83.73453,
  },
  {
    name: 'School of Public Health',
    aliases: ['SPH', 'SPH I', 'Vaughan Building', 'Henry Vaughan Public Health Building'],
    campus: 'medical',
    lat: 42.28089,
    lng: -83.73067,
  },

  // ── Athletic campus ─────────────────────────────────────────────────────────
  {
    name: 'Michigan Stadium',
    aliases: ['The Big House', 'Big House'],
    campus: 'athletic',
    lat: 42.26583,
    lng: -83.74783,
  },
  {
    name: 'Crisler Center',
    aliases: ['Crisler', 'Crisler Arena'],
    campus: 'athletic',
    lat: 42.26504,
    lng: -83.74667,
  },
  {
    name: 'Yost Ice Arena',
    aliases: ['Yost', 'Yost Arena'],
    campus: 'athletic',
    lat: 42.26758,
    lng: -83.74102,
  },
];
