import { z } from 'zod';
import { classificationMethodSchema, eventSourceSchema, type ReportKind } from './enums.js';
import { foodEventSchema, listEventsQuerySchema } from './events.js';

// Request/response contracts for apps/api beyond the event list (see events.ts).

/** /api/events/now covers events live now or starting within this window. */
export const NOW_WINDOW_MS = 3 * 60 * 60 * 1000;
/** This many "food's gone" reports within FOOD_GONE_WINDOW_MS mark an event as likely over. */
export const FOOD_GONE_THRESHOLD = 3;
export const FOOD_GONE_WINDOW_MS = 60 * 60 * 1000;
/** Users with this many approved tips have new tips published without review. */
export const AUTO_PUBLISH_TRUST_LEVEL = 3;

export function shouldAutoPublish(trustLevel: number): boolean {
  return trustLevel >= AUTO_PUBLISH_TRUST_LEVEL;
}
/** /api/health reports degraded when the last complete ingestion is older than this. */
export const INGESTION_STALE_MS = 3 * 60 * 60 * 1000;
/**
 * The same limit per feed source. Maize Pages is read every five hours, so it gets two missed
 * reads of slack before it counts as stale.
 */
export const SOURCE_STALE_MS = {
  happening: INGESTION_STALE_MS,
  maizepages: 11 * 60 * 60 * 1000,
} as const;
/** A source with no run started in this long is treated as switched off and left out of /api/health. */
export const SOURCE_ACTIVE_MS = 48 * 60 * 60 * 1000;

export const nowEventsQuerySchema = listEventsQuerySchema.omit({ from: true, to: true });
export type NowEventsQuery = z.output<typeof nowEventsQuerySchema>;

export const eventIdParamsSchema = z.object({ id: z.uuid() });

const count = z.number().int().min(0);
// `satisfies` fails to compile if a report kind is missing or unknown.
export const reportCountsSchema = z.object({
  food_gone: count,
  still_food: count,
  not_free: count,
  wrong_info: count,
} satisfies Record<ReportKind, typeof count>);
export type ReportCounts = z.infer<typeof reportCountsSchema>;

/** Answer to POST /api/events/:id/reports: the event's counts after this report. */
export const reportResponseSchema = z.object({
  reportCounts: reportCountsSchema,
  /** When anyone last reported on this event, whatever the kind. */
  lastReportAt: z.iso.datetime({ offset: true }).nullable(),
  likelyGone: z.boolean(),
});
export type ReportResponse = z.infer<typeof reportResponseSchema>;

export const eventDetailSchema = foodEventSchema.extend({
  /** Null for a community tip the classifier hasn't read yet. */
  classification: z
    .object({
      method: classificationMethodSchema,
      confidence: z.number().min(0).max(1),
      evidence: z.string().nullable(),
      classifiedAt: z.iso.datetime({ offset: true }),
    })
    .nullable(),
  /** All reports on this occurrence, by kind. (likelyGone counts only recent food_gone.) */
  reportCounts: reportCountsSchema,
  /** When anyone last reported on this event, whatever the kind. Null with no reports. */
  lastReportAt: z.iso.datetime({ offset: true }).nullable(),
});
export type EventDetail = z.infer<typeof eventDetailSchema>;

export const sourceFreshnessSchema = z.object({
  source: eventSourceSchema.exclude(['submission']),
  /** When the source's newest run started, complete or not. */
  lastRunAt: z.iso.datetime({ offset: true }),
  lastSuccessfulIngestionAt: z.iso.datetime({ offset: true }).nullable(),
  /** No complete run within the source's limit (SOURCE_STALE_MS). */
  stale: z.boolean(),
});

export const healthResponseSchema = z.object({
  /** "degraded" when any source below is stale, or nothing has ingested lately. */
  status: z.enum(['ok', 'degraded']),
  database: z.literal('ok'),
  /** The newest complete ingestion from any source. */
  lastSuccessfulIngestionAt: z.iso.datetime({ offset: true }).nullable(),
  /** True when no source is fresh, so what the site shows may be out of date. */
  ingestionStale: z.boolean(),
  /** Each feed source that has run in the last SOURCE_ACTIVE_MS. */
  sources: z.array(sourceFreshnessSchema),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const API_ERROR_CODES = [
  'invalid_request',
  'invalid_token',
  'unauthorized',
  'forbidden',
  'not_found',
  'rate_limited',
  'not_implemented',
  'service_unavailable',
  'internal_error',
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/** Every non-2xx JSON response from apps/api has this shape. */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.enum(API_ERROR_CODES),
    message: z.string(),
    requestId: z.string(),
    /** Validation problems, for invalid_request. `path` is dotted, e.g. "campus.0". */
    issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
