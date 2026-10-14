import { recordPageView, saltForDay } from '@maize-bites/db';
import {
  deviceFor,
  localDateOf,
  normalizePath,
  pageViewRequestSchema,
  referrerHost,
} from '@maize-bites/shared';
import { Router } from 'express';
import { newSalt, skipReason, visitorId } from '../analytics.js';
import type { ApiContext } from '../context.js';
import { limiter } from '../rate-limit.js';

// Mounted at /api/analytics. See ../analytics.ts for what is (and isn't) stored.
export function analyticsRouter({ db, now, webOrigin, rateLimits }: ApiContext): Router {
  const router = Router();
  const siteHost = new URL(webOrigin).host;
  // The day's salt, cached so a page view costs one insert. saltForDay deletes old salts.
  let cached: { day: string; salt: Promise<string> } | undefined;
  const saltFor = (day: string) => {
    if (cached?.day !== day) {
      const salt = saltForDay(db, day, newSalt);
      cached = { day, salt };
      salt.catch(() => {
        if (cached?.salt === salt) cached = undefined;
      });
    }
    return cached.salt;
  };

  /**
   * One page view, from navigator.sendBeacon. Always answers 204, after at most one insert (also
   * for input it ignores, on a failed write, and over the rate limit); beacons never read it.
   */
  router.post(
    '/view',
    limiter('page-views', rateLimits.pageViewsPerIp, undefined, { silent: true }),
    async (req, res) => {
      const parsed = pageViewRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(204).end();
        return;
      }
      const { path: rawPath, referrer, screen } = parsed.data;
      const userAgent = req.get('user-agent');
      const path = normalizePath(rawPath);
      try {
        const user = req.user;
        const excludedAdmin = user?.isAdmin === true && user.excludeFromAnalytics;
        if (skipReason({ userAgent, headers: req.headers, path, excludedAdmin }) !== null) return;
        const at = now();
        const day = localDateOf(at);
        const ip = req.ip ?? req.socket.remoteAddress ?? '';
        const host = referrerHost(referrer);
        await recordPageView(db, {
          day,
          visitorId: visitorId(await saltFor(day), ip, userAgent ?? '', siteHost),
          path,
          referrerHost: host === siteHost.replace(/^www\./, '') ? null : host,
          device: deviceFor(screen),
          isSignedIn: user !== undefined,
          at,
        });
      } catch (error) {
        req.log.warn({ err: error }, 'page view not recorded');
      } finally {
        res.status(204).end();
      }
    },
  );

  return router;
}
