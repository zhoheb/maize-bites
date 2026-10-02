import { Router } from 'express';
import { notImplemented } from '../errors.js';

// Mounted at /api/admin. Phase 2. All routes require users.is_admin.
export function adminRouter(): Router {
  const router = Router();

  // TODO GET /review-queue  listReviewQueue (review-band verdicts + LLM failures) and pending submissions.
  router.get('/review-queue', notImplemented);

  // TODO POST /events/:id/override  Insert a method "manual" classification (force show/hide,
  //   edit food_items / dietary / audience). Manual verdicts always win.
  router.post('/events/:id/override', notImplemented);

  // TODO POST /submissions/:id  Approve (create the event, bump the user's trust_level) or reject.
  router.post('/submissions/:id', notImplemented);

  // TODO GET /metrics  Ingestion runs, classifier stats (calls, cost, flags), alerts sent.
  router.get('/metrics', notImplemented);

  return router;
}
