import { Router } from 'express';
import { notImplemented } from '../errors.js';

// Mounted at /api/submissions. Phase 2: crowdsourced tips.
export function submissionsRouter(): Router {
  const router = Router();

  // TODO POST /  (auth: user) Submit a tip { title, description?, location_name, starts_at, ends_at? }.
  //   - New users' tips go to the review queue; trust_level >= 3 auto-publishes as an event
  //     with source "submission". Rate limit per user.
  router.post('/', notImplemented);

  return router;
}
