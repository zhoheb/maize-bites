import { readFileSync } from 'node:fs';
import { z } from 'zod';
import type { ClassifierInput } from '../classifier/input.js';

export const LABELED_FILE = new URL('../../eval/labeled.json', import.meta.url);

const isoDateTime = z.iso.datetime({ offset: true });

export const labeledItemSchema = z.object({
  /** Feed id ("<eventId>-<occurrenceId>") or any stable id. */
  id: z.string().min(1),
  event: z.object({
    title: z.string(),
    description: z.string().nullable(),
    locationName: z.string().nullable(),
    room: z.string().nullable(),
    startsAt: isoDateTime,
    endsAt: isoDateTime.nullable(),
    tags: z.array(z.string()),
    sponsor: z.string().nullable(),
    cost: z.string().nullable(),
  }),
  /** null = not labeled yet; such items are skipped. */
  label: z.object({
    has_free_food: z.boolean().nullable(),
    audience: z.enum(['open', 'members', 'rsvp', 'unknown']).nullable(),
  }),
  notes: z.string().default(''),
});
export type LabeledItem = z.infer<typeof labeledItemSchema>;

export const labeledFileSchema = z.object({
  version: z.literal(1),
  instructions: z.string(),
  items: z.array(labeledItemSchema),
});
export type LabeledFile = z.infer<typeof labeledFileSchema>;

export function loadLabeledFile(url: URL = LABELED_FILE): LabeledFile {
  return labeledFileSchema.parse(JSON.parse(readFileSync(url, 'utf8')));
}

export function toClassifierInput(item: LabeledItem): ClassifierInput {
  const { event } = item;
  return {
    ...event,
    startsAt: new Date(event.startsAt),
    endsAt: event.endsAt === null ? null : new Date(event.endsAt),
  };
}
