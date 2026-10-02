import {
  consumeMagicLink,
  createMagicLink,
  createSession,
  deleteSession,
  upsertUserByEmail,
} from '@maize-bites/db';
import { magicLinkEmail } from '@maize-bites/email';
import {
  MAGIC_LINK_TTL_MS,
  SESSION_TTL_MS,
  magicLinkRequestSchema,
  umichEmailSchema,
  verifyQuerySchema,
  type CurrentUser,
} from '@maize-bites/shared';
import { Router } from 'express';
import { clearSessionCookie, requireUser, setSessionCookie } from '../auth/session.js';
import { generateToken, hashToken } from '../auth/tokens.js';
import type { ApiContext } from '../context.js';
import { HttpError } from '../errors.js';
import { limiter } from '../rate-limit.js';

// Mounted at /api/auth. Passwordless sign-in for @umich.edu addresses.
export function authRouter(ctx: ApiContext): Router {
  const router = Router();
  const { db, now, mailer } = ctx;

  const perIp = limiter('magic-ip', ctx.rateLimits.magicLinkPerIp);
  const perEmail = limiter('magic-email', ctx.rateLimits.magicLinkPerEmail, (req) => {
    const parsed = umichEmailSchema.safeParse((req.body as { email?: unknown } | undefined)?.email);
    return parsed.success ? parsed.data : null;
  });

  /** Emails a single-use link. Always 202 for a valid address, so it can't probe accounts. */
  router.post('/magic-link', perIp, perEmail, async (req, res) => {
    const { email } = magicLinkRequestSchema.parse(req.body);
    const token = generateToken();
    await createMagicLink(db, {
      email,
      tokenHash: hashToken(token),
      expiresAt: new Date(now().getTime() + MAGIC_LINK_TTL_MS),
    });
    // The link opens a web page that calls /api/auth/verify from JS, so email link
    // scanners that prefetch URLs don't burn the token.
    const url = `${ctx.webOrigin}/auth/verify?token=${token}`;
    await mailer.send({ to: email, ...magicLinkEmail(url) });
    res.status(202).json({ ok: true });
  });

  /** Exchanges a link token for a session cookie. */
  router.get('/verify', async (req, res) => {
    const { token } = verifyQuerySchema.parse(req.query);
    const email = await consumeMagicLink(db, hashToken(token), now());
    if (email === null) {
      throw new HttpError(
        400,
        'invalid_token',
        'This sign-in link is invalid, expired, or already used',
      );
    }
    const user = await upsertUserByEmail(db, email);
    const sessionToken = generateToken();
    await createSession(db, {
      userId: user.id,
      tokenHash: hashToken(sessionToken),
      expiresAt: new Date(now().getTime() + SESSION_TTL_MS),
    });
    setSessionCookie(res, sessionToken, ctx.cookieSecure, SESSION_TTL_MS);
    const body: { user: CurrentUser } = { user: { email: user.email, isAdmin: user.isAdmin } };
    res.set('Cache-Control', 'no-store').json(body);
  });

  router.post('/logout', requireUser, async (req, res) => {
    if (req.sessionTokenHash) await deleteSession(db, req.sessionTokenHash);
    clearSessionCookie(res, ctx.cookieSecure);
    res.status(204).end();
  });

  return router;
}
