import { SubmissionStateError, submitTip } from '@maize-bites/db';
import { submissionRequestSchema, type SubmissionResponse } from '@maize-bites/shared';
import { Router } from 'express';
import { currentUser, requireUser } from '../auth/session.js';
import type { ApiContext } from '../context.js';
import { HttpError } from '../errors.js';
import { byUser, limiter } from '../rate-limit.js';

/** A tip with no end time is treated as lasting this long when checking it isn't already over. */
const ASSUMED_DURATION_MS = 60 * 60 * 1000;
/** Tips are for food that is out now or soon, not a calendar. */
const MAX_AHEAD_MS = 14 * 24 * 60 * 60 * 1000;

// Mounted at /api/submissions. Crowdsourced tips from signed-in users.
export function submissionsRouter({ db, now, rateLimits }: ApiContext): Router {
  const router = Router();

  /**
   * Submit a tip. A new user's tip waits in the review queue; once a user has
   * AUTO_PUBLISH_TRUST_LEVEL approved tips, theirs publish at once as events with source
   * "submission". The worker's classifier fills in food details on its next pass.
   */
  router.post(
    '/',
    requireUser,
    limiter('submissions', rateLimits.submissionsPerUser, byUser),
    async (req, res) => {
      const tip = submissionRequestSchema.parse(req.body);
      const at = now();
      const startsAt = new Date(tip.startsAt);
      const endsAt = tip.endsAt === null ? null : new Date(tip.endsAt);
      const over = (endsAt?.getTime() ?? startsAt.getTime() + ASSUMED_DURATION_MS) < at.getTime();
      if (over) throw new HttpError(400, 'invalid_request', 'This event has already ended');
      if (startsAt.getTime() - at.getTime() > MAX_AHEAD_MS)
        throw new HttpError(400, 'invalid_request', 'Tips can be at most two weeks ahead');

      try {
        const { submission, event } = await submitTip(
          db,
          currentUser(req),
          {
            title: tip.title,
            description: tip.description,
            buildingId: tip.buildingId,
            room: tip.room,
            startsAt,
            endsAt,
          },
          at,
        );
        const body: SubmissionResponse = {
          id: submission.id,
          status: event ? 'approved' : 'pending',
          eventId: event?.id ?? null,
        };
        res.status(201).json(body);
      } catch (error) {
        if (error instanceof SubmissionStateError)
          throw new HttpError(400, 'invalid_request', error.message);
        throw error;
      }
    },
  );

  return router;
}
