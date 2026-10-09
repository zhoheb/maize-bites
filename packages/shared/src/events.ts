import { z } from 'zod';
import {
  audienceSchema,
  campusSchema,
  dietaryTagSchema,
  eventSourceSchema,
  mealTypeSchema,
} from './enums.js';

// Wire formats shared by api and web. Timestamps travel as ISO-8601 strings.

const isoDateTime = z.iso.datetime({ offset: true });

export const foodEventSchema = z.object({
  id: z.uuid(),
  /** "happening" or "maizepages" (campus feeds), or "submission" (a community tip). */
  source: eventSourceSchema,
  title: z.string().min(1),
  description: z.string().nullable(),
  startsAt: isoDateTime,
  endsAt: isoDateTime.nullable(),
  locationName: z.string().nullable(),
  room: z.string().nullable(),
  building: z.object({ id: z.uuid(), name: z.string(), campus: campusSchema }).nullable(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  url: z.url().nullable(),
  sponsor: z.string().nullable(),
  foodItems: z.array(z.string()),
  mealType: mealTypeSchema.nullable(),
  dietary: z.array(dietaryTagSchema),
  audience: audienceSchema.nullable(),
  /** At least FOOD_GONE_THRESHOLD "food's gone" reports in the last FOOD_GONE_WINDOW_MS. */
  likelyGone: z.boolean(),
});
export type FoodEvent = z.infer<typeof foodEventSchema>;

/** Accepts `a,b` or repeated `?k=a&k=b` query params. */
function csv<T extends z.ZodType>(item: T) {
  return z.preprocess(
    (value) => (typeof value === 'string' ? value.split(',').filter((s) => s !== '') : value),
    z.array(item).min(1),
  );
}

/** `west,south,east,north` in degrees. */
export const bboxSchema = z.preprocess(
  (value) => (typeof value === 'string' ? value.split(',').map(Number) : value),
  z
    .tuple([
      z.number().min(-180).max(180),
      z.number().min(-90).max(90),
      z.number().min(-180).max(180),
      z.number().min(-90).max(90),
    ])
    .refine(([west, south, east, north]) => west <= east && south <= north, {
      message: 'bbox must be west,south,east,north with west <= east and south <= north',
    })
    .transform(([west, south, east, north]) => ({ west, south, east, north })),
);
export type Bbox = z.output<typeof bboxSchema>;

export const listEventsQuerySchema = z.object({
  /** Only events still running at or after this instant. Defaults to now. */
  from: isoDateTime.optional(),
  /** Only events starting at or before this instant. */
  to: isoDateTime.optional(),
  campus: csv(campusSchema).optional(),
  /** Event must satisfy every listed need. */
  dietary: csv(dietaryTagSchema).optional(),
  open_only: z.stringbool({ truthy: ['true', '1'], falsy: ['false', '0'] }).optional(),
  meal_type: mealTypeSchema.optional(),
  bbox: bboxSchema.optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListEventsQuery = z.output<typeof listEventsQuerySchema>;

export const listEventsResponseSchema = z.object({
  events: z.array(foodEventSchema),
  nextCursor: z.string().nullable(),
});
export type ListEventsResponse = z.infer<typeof listEventsResponseSchema>;

/** Events without an end time are treated as lasting this long. */
export const DEFAULT_EVENT_DURATION_MS = 60 * 60 * 1000;

export function effectiveEnd(event: Pick<FoodEvent, 'startsAt' | 'endsAt'>): Date {
  if (event.endsAt !== null) return new Date(event.endsAt);
  return new Date(new Date(event.startsAt).getTime() + DEFAULT_EVENT_DURATION_MS);
}

export function isHappeningNow(
  event: Pick<FoodEvent, 'startsAt' | 'endsAt'>,
  now: Date = new Date(),
): boolean {
  const start = new Date(event.startsAt).getTime();
  return start <= now.getTime() && now.getTime() < effectiveEnd(event).getTime();
}
