import { addReport, countReportsByKind, getPublishedEvent, lastReportAt } from '@maize-bites/db';
import {
  FOOD_GONE_THRESHOLD,
  FOOD_GONE_WINDOW_MS,
  eventIdParamsSchema,
  reportRequestSchema,
  type ReportResponse,
} from '@maize-bites/shared';
import { Router } from 'express';
import { currentUser, requireUser } from '../auth/session.js';
import type { ApiContext } from '../context.js';
import { HttpError } from '../errors.js';
import { byUser, limiter } from '../rate-limit.js';

// Mounted at /api/events/:id/reports.
export function reportsRouter({ db, now, rateLimits }: ApiContext): Router {
  const router = Router({ mergeParams: true });

  /**
   * Report "food_gone" | "still_food" | "not_free" | "wrong_info" on a published event. One
   * report of each kind per user per event: a repeat changes nothing and answers 200, a new
   * one 201. Either way the body carries the event's fresh counts.
   */
  router.post(
    '/',
    requireUser,
    limiter('reports', rateLimits.reportsPerUser, byUser),
    async (req, res) => {
      const { id } = eventIdParamsSchema.parse(req.params);
      const { kind } = reportRequestSchema.parse(req.body);
      const at = now();
      const reportsSince = new Date(at.getTime() - FOOD_GONE_WINDOW_MS);
      if (!(await getPublishedEvent(db, id)))
        throw new HttpError(404, 'not_found', 'Event not found');

      const created = await addReport(db, {
        eventId: id,
        userId: currentUser(req).id,
        kind,
        createdAt: at,
      });
      const fresh = await getPublishedEvent(db, id, { reportsSince });
      const body: ReportResponse = {
        reportCounts: await countReportsByKind(db, id),
        lastReportAt: (await lastReportAt(db, id))?.toISOString() ?? null,
        likelyGone: (fresh?.recentFoodGone ?? 0) >= FOOD_GONE_THRESHOLD,
      };
      res.status(created ? 201 : 200).json(body);
    },
  );

  return router;
}
