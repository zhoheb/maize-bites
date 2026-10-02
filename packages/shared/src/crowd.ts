import { z } from 'zod';
import {
  audienceSchema,
  campusSchema,
  classificationMethodSchema,
  dietaryTagSchema,
  eventSourceSchema,
  mealTypeSchema,
  reportKindSchema,
} from './enums.js';

// Crowdsourcing and admin contracts shared by apps/api and apps/web.

const isoDateTime = z.iso.datetime({ offset: true });
const HOUR = 60 * 60 * 1000;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    // Blank (after trim) and missing both become null.
    .transform((v) => (v === '' ? null : (v ?? null)));

export const TIP_MAX_DURATION_MS = 12 * HOUR;

/** A tip from a signed-in user. Times are validated against "now" again on the server. */
export const submissionRequestSchema = z
  .object({
    title: z.string().trim().min(3, 'Add a short title').max(200),
    description: optionalText(2000),
    buildingId: z.uuid('Pick a building from the list'),
    room: optionalText(100),
    startsAt: isoDateTime,
    endsAt: isoDateTime.nullish().transform((v) => v ?? null),
  })
  .refine((t) => t.endsAt === null || new Date(t.endsAt) > new Date(t.startsAt), {
    path: ['endsAt'],
    message: 'End time must be after the start',
  })
  .refine(
    (t) =>
      t.endsAt === null ||
      new Date(t.endsAt).getTime() - new Date(t.startsAt).getTime() <= TIP_MAX_DURATION_MS,
    {
      path: ['endsAt'],
      message: 'Tips can last at most 12 hours',
    },
  );
export type SubmissionRequest = z.output<typeof submissionRequestSchema>;

export const submissionResponseSchema = z.object({
  id: z.uuid(),
  status: z.enum(['pending', 'approved']),
  /** Set when the tip was published immediately (trusted submitter). */
  eventId: z.uuid().nullable(),
});
export type SubmissionResponse = z.infer<typeof submissionResponseSchema>;

export const reportRequestSchema = z.object({ kind: reportKindSchema });

export const buildingSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  aliases: z.array(z.string()),
  campus: campusSchema,
});
export const buildingsResponseSchema = z.object({ buildings: z.array(buildingSchema) });
export type Building = z.infer<typeof buildingSchema>;

// ── Admin ───────────────────────────────────────────────────────────────────

export const overrideRequestSchema = z.object({
  action: z.enum(['show', 'hide']),
  /** Omitted fields keep the current extraction. */
  foodItems: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  mealType: mealTypeSchema.nullable().optional(),
  dietary: z.array(dietaryTagSchema).optional(),
  audience: audienceSchema.nullable().optional(),
  note: z.string().trim().max(500).optional(),
});
export type OverrideRequest = z.infer<typeof overrideRequestSchema>;

export const reviewSubmissionRequestSchema = z.object({
  action: z.enum(['approve', 'reject']),
  note: z.string().trim().max(500).optional(),
});

export const addAliasRequestSchema = z.object({ alias: z.string().trim().min(2).max(120) });

const adminClassificationSchema = z.object({
  method: classificationMethodSchema,
  model: z.string().nullable(),
  hasFreeFood: z.boolean(),
  confidence: z.number(),
  foodItems: z.array(z.string()),
  mealType: mealTypeSchema.nullable(),
  dietary: z.array(dietaryTagSchema),
  audience: audienceSchema.nullable(),
  evidence: z.string().nullable(),
  createdAt: isoDateTime,
});

export const adminEventSchema = z.object({
  id: z.uuid(),
  source: eventSourceSchema,
  title: z.string(),
  description: z.string().nullable(),
  startsAt: isoDateTime,
  endsAt: isoDateTime.nullable(),
  locationName: z.string().nullable(),
  url: z.string().nullable(),
});

export const reviewQueueResponseSchema = z.object({
  events: z.array(
    z.object({
      event: adminEventSchema,
      classification: adminClassificationSchema.nullable(),
      flag: z.object({ reason: z.string(), detail: z.string().nullable() }).nullable(),
    }),
  ),
  submissions: z.array(
    z.object({
      id: z.uuid(),
      title: z.string(),
      description: z.string().nullable(),
      building: z.object({ id: z.uuid(), name: z.string() }).nullable(),
      locationName: z.string(),
      room: z.string().nullable(),
      startsAt: isoDateTime,
      endsAt: isoDateTime.nullable(),
      submittedAt: isoDateTime,
      submitter: z.object({ email: z.string(), trustLevel: z.number().int() }),
    }),
  ),
});
export type ReviewQueueResponse = z.infer<typeof reviewQueueResponseSchema>;

export const ingestionRunsResponseSchema = z.object({
  runs: z.array(
    z.object({
      id: z.uuid(),
      startedAt: isoDateTime,
      finishedAt: isoDateTime.nullable(),
      fetched: z.number(),
      created: z.number(),
      updated: z.number(),
      classified: z.number(),
      removed: z.number(),
      complete: z.boolean(),
      errors: z.number(),
      errorMessages: z.array(z.string()),
    }),
  ),
});
export type IngestionRunsResponse = z.infer<typeof ingestionRunsResponseSchema>;

export const EVENT_OUTCOMES = [
  'published',
  'review',
  'rejected_rules',
  'rejected_llm',
  'hidden_by_admin',
  'pending_llm',
  'unclassified',
] as const;

export const classifierStatsResponseSchema = z.object({
  window: z.object({ from: isoDateTime, to: isoDateTime }),
  events: z.number(),
  outcomes: z.object(
    Object.fromEntries(EVENT_OUTCOMES.map((o) => [o, z.number()])) as Record<
      (typeof EVENT_OUTCOMES)[number],
      z.ZodNumber
    >,
  ),
  llmClassifications: z.number(),
  alerts: z.object({ sent: z.number(), failed: z.number() }),
});
export type ClassifierStatsResponse = z.infer<typeof classifierStatsResponseSchema>;

export const locationMissesResponseSchema = z.object({
  misses: z.array(
    z.object({
      id: z.uuid(),
      locationName: z.string(),
      normalizedName: z.string(),
      seenCount: z.number(),
      lastSeenAt: isoDateTime,
    }),
  ),
});

export const auditLogResponseSchema = z.object({
  entries: z.array(
    z.object({
      id: z.uuid(),
      actorEmail: z.string().nullable(),
      action: z.string(),
      targetType: z.string(),
      targetId: z.string(),
      details: z.record(z.string(), z.unknown()),
      createdAt: isoDateTime,
    }),
  ),
});
