import { Router } from 'express';
import { sessionMiddleware } from '../auth/session.js';
import type { ApiContext } from '../context.js';
import { writeProtection } from '../security.js';
import { adminRouter } from './admin.js';
import { authRouter } from './auth.js';
import { buildingsRouter } from './buildings.js';
import { eventsRouter } from './events.js';
import { healthRouter } from './health.js';
import { meRouter } from './me.js';
import { pushRouter } from './push.js';
import { submissionsRouter } from './submissions.js';

/** Everything under /api. */
export function apiRouter(ctx: ApiContext): Router {
  const router = Router();
  router.use(writeProtection(ctx.webOrigin));
  router.use(sessionMiddleware(ctx.db, ctx.now));
  router.use('/health', healthRouter(ctx.db, ctx.now));
  router.use('/events', eventsRouter(ctx));
  router.use('/buildings', buildingsRouter(ctx.db));
  router.use('/auth', authRouter(ctx));
  router.use('/me', meRouter(ctx));
  router.use('/push', pushRouter(ctx));
  router.use('/submissions', submissionsRouter(ctx));
  router.use('/admin', adminRouter(ctx));
  return router;
}
