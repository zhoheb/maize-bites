import type { EventRow } from '@maize-bites/db';
import { z } from 'zod';

/** Everything the classifier looks at. Built from an events row, or from eval/labeled.json. */
export interface ClassifierInput {
  title: string;
  description: string | null;
  locationName: string | null;
  room: string | null;
  startsAt: Date;
  endsAt: Date | null;
  tags: readonly string[];
  sponsor: string | null;
  /** The feed's free-text cost field ("Free - no tickets required", "$16 drop-in"). */
  cost: string | null;
}

const rawCostSchema = z.looseObject({ cost: z.string().nullish() });

export function classifierInputFromEvent(event: EventRow): ClassifierInput {
  const cost = rawCostSchema.safeParse(event.raw).data?.cost?.trim();
  return {
    title: event.title,
    description: event.description,
    locationName: event.locationName,
    room: event.room,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    tags: event.tags,
    sponsor: event.sponsor,
    cost: cost === undefined || cost === '' ? null : cost,
  };
}
