import { computeContentHash, type UpsertEventInput } from '@maize-bites/db';
import { decodeHtmlEntities } from './html.js';
import type { HappeningItem } from './schema.js';
import { parseFeedDateTime } from './time.js';

export interface NormalizedFeedEvent {
  /** Everything upsertEvent needs except the building, which location resolution fills in. */
  event: Omit<UpsertEventInput, 'buildingId'>;
  /** Same hash upsertEvent stores; exposed for logging and tests. */
  contentHash: string;
  /** Names to match against buildings, most structured first. */
  locationCandidates: string[];
}

/** Trimmed, entity-decoded text, or null when empty. */
function clean(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const decoded = decodeHtmlEntities(value).trim();
  return decoded === '' ? null : decoded;
}

function toHttps(url: string | null): string | null {
  return url?.replace(/^http:\/\/events\.umich\.edu\//, 'https://events.umich.edu/') ?? null;
}

/** Maps one validated feed item to our events shape. Throws if its times can't be parsed. */
export function normalizeHappeningItem(item: HappeningItem): NormalizedFeedEvent {
  const [sourceEventId, occurrenceId] = item.id.split('-') as [string, string];

  const startsAt = parseFeedDateTime(item.datetime_start, item.time_zone);
  let endsAt: Date | null = null;
  if (item.has_end_time === 1 && item.datetime_end !== '') {
    endsAt = parseFeedDateTime(item.datetime_end, item.time_zone);
    // events has a check constraint ends_at >= starts_at; drop a bad end rather than the event.
    if (endsAt < startsAt) endsAt = null;
  }

  // Occurrence notes often carry the useful bit ("lunch provided"), so the classifier sees them too.
  const description =
    [clean(item.description), clean(item.occurrence_notes)].filter(Boolean).join('\n\n') || null;

  const buildingName = clean(item.building_name);
  const locationName = clean(item.location_name) ?? buildingName;

  const sponsor =
    item.sponsors
      .map((s) => clean(s.group_name))
      .filter((s): s is string => s !== null)
      // '' (no sponsors) falls through to the MaizePages group name.
      .join(', ') || clean(item.maizepages_import?.maizepages_group_name);

  const event: NormalizedFeedEvent['event'] = {
    source: 'happening',
    sourceEventId,
    occurrenceId,
    title: clean(item.combined_title) ?? clean(item.event_title) ?? '(untitled event)',
    description,
    startsAt,
    endsAt,
    locationName,
    room: clean(item.room),
    // The feed has no coordinates; the API falls back to the matched building's.
    lat: null,
    lng: null,
    url: toHttps(clean(item.permalink)) ?? clean(item.website),
    sponsor,
    tags: item.tags.map((t) => decodeHtmlEntities(t).trim()).filter((t) => t !== ''),
    raw: item,
    status: 'active',
  };

  const locationCandidates = [buildingName, clean(item.location_name)].filter(
    (name, i, all): name is string => name !== null && all.indexOf(name) === i,
  );

  return { event, contentHash: computeContentHash(event), locationCandidates };
}
