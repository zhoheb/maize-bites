import {
  SubmissionStateError,
  addBuildingAlias,
  approveSubmission,
  classifierStats,
  getActiveClassification,
  getEvent,
  listAuditLog,
  listIngestionRuns,
  listLocationMisses,
  listPendingSubmissions,
  listReviewQueue,
  recordAudit,
  recordClassification,
  rejectSubmission,
  resolveReviewFlags,
} from '@maize-bites/db';
import {
  addAliasRequestSchema,
  eventIdParamsSchema,
  overrideRequestSchema,
  reviewSubmissionRequestSchema,
  type AdminMetricsResponse,
  type AuditLogResponse,
  type Building,
  type OverrideResponse,
  type ReviewQueueResponse,
  type ReviewSubmissionResponse,
} from '@maize-bites/shared';
import { Router } from 'express';
import { currentUser, requireAdmin } from '../auth/session.js';
import type { ApiContext } from '../context.js';
import { HttpError } from '../errors.js';
import { summarizeSources, toAdminClassification, toAdminEvent, toRun } from '../serializers.js';

/** Classifier stats cover events starting from a week back to two weeks ahead. */
const STATS_BACK_MS = 7 * 24 * 60 * 60 * 1000;
const STATS_AHEAD_MS = 14 * 24 * 60 * 60 * 1000;
const RECENT_RUNS = 40;

// Mounted at /api/admin. Every route requires users.is_admin, and every write is recorded in
// audit_log with who did it.
export function adminRouter({ db, now }: ApiContext): Router {
  const router = Router();
  router.use(requireAdmin);

  /** Events a person should look at (review-band verdicts, classifier failures) and pending tips. */
  router.get('/review-queue', async (_req, res) => {
    const [queue, pending] = await Promise.all([
      listReviewQueue(db, now()),
      listPendingSubmissions(db),
    ]);
    const body: ReviewQueueResponse = {
      events: queue.map(({ event, classification, flag }) => ({
        event: toAdminEvent(event),
        classification: classification && toAdminClassification(classification),
        flag: flag && { reason: flag.reason, detail: flag.detail },
      })),
      submissions: pending.map(({ submission, submitter, building }) => ({
        id: submission.id,
        title: submission.title,
        description: submission.description,
        building,
        locationName: submission.locationName,
        room: submission.room,
        startsAt: submission.startsAt.toISOString(),
        endsAt: submission.endsAt?.toISOString() ?? null,
        submittedAt: submission.createdAt.toISOString(),
        submitter,
      })),
    };
    res.set('Cache-Control', 'no-store').json(body);
  });

  /**
   * Force an event shown or hidden with a "manual" classification, optionally correcting the
   * extracted details. A manual verdict always wins over the classifier, including after the
   * listing changes. Any open review flag on the event is resolved.
   */
  router.post('/events/:id/override', async (req, res) => {
    const { id } = eventIdParamsSchema.parse(req.params);
    const override = overrideRequestSchema.parse(req.body);
    const event = await getEvent(db, id);
    if (!event) throw new HttpError(404, 'not_found', 'Event not found');
    const current = await getActiveClassification(db, id);
    const at = now();

    await recordClassification(db, {
      eventId: id,
      contentHash: event.contentHash,
      method: 'manual',
      model: null,
      hasFreeFood: override.action === 'show',
      confidence: 1,
      // Omitted fields keep what the classifier (or an earlier override) extracted.
      foodItems: override.foodItems ?? current?.foodItems ?? [],
      mealType: override.mealType === undefined ? (current?.mealType ?? null) : override.mealType,
      dietary: override.dietary ?? current?.dietary ?? [],
      audience: override.audience === undefined ? (current?.audience ?? null) : override.audience,
      evidence: override.note ?? null,
      createdAt: at,
    });
    const flagsResolved = await resolveReviewFlags(db, id, at);
    await recordAudit(db, {
      actorId: currentUser(req).id,
      action: 'event.override',
      targetType: 'event',
      targetId: id,
      details: { ...override, flagsResolved, title: event.title },
      at,
    });
    const body: OverrideResponse = { eventId: id, action: override.action };
    res.status(201).json(body);
  });

  /** Approve a pending tip (it becomes an event and the submitter gains trust) or reject it. */
  router.post('/submissions/:id', async (req, res) => {
    const { id } = eventIdParamsSchema.parse(req.params);
    const { action, note } = reviewSubmissionRequestSchema.parse(req.body);
    const reviewer = currentUser(req);
    const at = now();
    let eventId: string | null = null;
    try {
      if (action === 'approve') eventId = (await approveSubmission(db, id, reviewer, at)).id;
      else await rejectSubmission(db, id, reviewer, at);
    } catch (error) {
      if (!(error instanceof SubmissionStateError)) throw error;
      throw error.message === 'Submission not found'
        ? new HttpError(404, 'not_found', error.message)
        : new HttpError(400, 'invalid_request', error.message);
    }
    await recordAudit(db, {
      actorId: reviewer.id,
      action: action === 'approve' ? 'submission.approve' : 'submission.reject',
      targetType: 'submission',
      targetId: id,
      details: { ...(note ? { note } : {}), ...(eventId ? { eventId } : {}) },
      at,
    });
    const body: ReviewSubmissionResponse = {
      status: action === 'approve' ? 'approved' : 'rejected',
      eventId,
    };
    res.json(body);
  });

  /** Pipeline health: ingestion per source, classifier outcomes, alerts sent, unmatched locations. */
  router.get('/metrics', async (_req, res) => {
    const at = now();
    const [runs, classifier, misses] = await Promise.all([
      listIngestionRuns(db, RECENT_RUNS),
      classifierStats(db, {
        from: new Date(at.getTime() - STATS_BACK_MS),
        to: new Date(at.getTime() + STATS_AHEAD_MS),
      }),
      listLocationMisses(db),
    ]);
    const body: AdminMetricsResponse = {
      sources: summarizeSources(runs),
      runs: runs.map(toRun),
      classifier,
      locationMisses: misses.map((m) => ({
        id: m.id,
        locationName: m.locationName,
        normalizedName: m.normalizedName,
        seenCount: m.seenCount,
        lastSeenAt: m.lastSeenAt.toISOString(),
      })),
    };
    res.set('Cache-Control', 'no-store').json(body);
  });

  /** Teach the location matcher a new name for a building (from the location misses list). */
  router.post('/buildings/:id/aliases', async (req, res) => {
    const { id } = eventIdParamsSchema.parse(req.params);
    const { alias } = addAliasRequestSchema.parse(req.body);
    const building = await addBuildingAlias(db, id, alias);
    if (!building) throw new HttpError(404, 'not_found', 'Building not found');
    await recordAudit(db, {
      actorId: currentUser(req).id,
      action: 'building.add_alias',
      targetType: 'building',
      targetId: id,
      details: { alias, building: building.name },
      at: now(),
    });
    const body: Building = {
      id: building.id,
      name: building.name,
      aliases: building.aliases,
      campus: building.campus,
    };
    res.status(201).json(body);
  });

  router.get('/audit-log', async (_req, res) => {
    const entries = await listAuditLog(db);
    const body: AuditLogResponse = {
      entries: entries.map((e) => ({
        id: e.id,
        actorEmail: e.actorEmail,
        action: e.action,
        targetType: e.targetType,
        targetId: e.targetId,
        // jsonb comes back untyped; the column only ever holds objects (see recordAudit).
        details: e.details as Record<string, unknown>,
        createdAt: e.createdAt.toISOString(),
      })),
    };
    res.set('Cache-Control', 'no-store').json(body);
  });

  return router;
}
