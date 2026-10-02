import { Router } from 'express';
import { notImplemented } from '../errors.js';

// Mounted at /api/events/:id/reports. Phase 2.
export function reportsRouter(): Router {
  const router = Router({ mergeParams: true });

  // TODO POST /  (auth: user) Report "food_gone" | "still_food" | "not_free" | "wrong_info".
  //   - Validate { kind } with reportKindSchema; 404 unless the event is published.
  //   - One vote per (event, user, kind): the reports unique index; answer 200 on repeats.
  //   - Rate limit per user. Respond with fresh reportCounts + likelyGone.
  router.post('/', notImplemented);

  return router;
}
