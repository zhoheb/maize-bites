import { Router } from 'express';
import type { ApiContext } from '../context.js';

// Mounted at /api/push. Public config the browser needs to subscribe.
export function pushRouter({ vapidPublicKey }: ApiContext): Router {
  const router = Router();
  router.get('/public-key', (_req, res) => {
    res.json({ publicKey: vapidPublicKey });
  });
  return router;
}
