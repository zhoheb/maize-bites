import {
  deletePushSubscription,
  listSubscriptions,
  replaceSubscriptions,
  savePushSubscription,
} from '@maize-bites/db';
import {
  DEFAULT_ALERT_PREFERENCES,
  alertPreferencesSchema,
  pushSubscriptionSchema,
  pushUnsubscribeSchema,
  type AlertPreferencesInput,
  type CurrentUser,
} from '@maize-bites/shared';
import { Router } from 'express';
import { currentUser, requireUser } from '../auth/session.js';
import type { ApiContext } from '../context.js';

/** "HH:MM:SS" from Postgres `time` → "HH:MM". */
const hhmm = (t: string) => t.slice(0, 5);

// Mounted at /api/me. Everything here requires a signed-in user.
export function meRouter({ db }: ApiContext): Router {
  const router = Router();
  router.use(requireUser);

  router.get('/', (req, res) => {
    const user = currentUser(req);
    const body: { user: CurrentUser } = { user: { email: user.email, isAdmin: user.isAdmin } };
    res.set('Cache-Control', 'no-store').json(body);
  });

  /** One preference set, applied to each enabled channel. */
  router.get('/subscription', async (req, res) => {
    const rows = await listSubscriptions(db, currentUser(req).id);
    const first = rows[0];
    const body: AlertPreferencesInput = first
      ? {
          channels: rows.map((r) => r.channel).sort(),
          campuses: first.campuses,
          dietary: first.dietary,
          openOnly: first.openOnly,
          mode: first.mode,
          quietHours:
            first.quietStart && first.quietEnd
              ? { start: hhmm(first.quietStart), end: hhmm(first.quietEnd) }
              : null,
        }
      : DEFAULT_ALERT_PREFERENCES;
    res.set('Cache-Control', 'no-store').json(body);
  });

  router.put('/subscription', async (req, res) => {
    const prefs = alertPreferencesSchema.parse(req.body);
    await replaceSubscriptions(db, currentUser(req).id, prefs);
    res.json(prefs);
  });

  router.post('/push', async (req, res) => {
    const sub = pushSubscriptionSchema.parse(req.body);
    await savePushSubscription(db, {
      userId: currentUser(req).id,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
    });
    res.status(201).json({ ok: true });
  });

  router.delete('/push', async (req, res) => {
    const { endpoint } = pushUnsubscribeSchema.parse(req.body);
    await deletePushSubscription(db, currentUser(req).id, endpoint);
    res.status(204).end();
  });

  return router;
}
