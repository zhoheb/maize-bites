import { getSessionUser, type Database, type UserRow } from '@maize-bites/db';
import type { CookieOptions, RequestHandler, Response } from 'express';
import { HttpError } from '../errors.js';
import { hashToken } from './tokens.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- augmenting @types/express's global namespace
  namespace Express {
    interface Request {
      /** Set by sessionMiddleware when the session cookie is valid. */
      user?: UserRow;
      sessionTokenHash?: string;
    }
  }
}

const SESSION_COOKIE = 'mb_session';

/** Minimal Cookie header parser (we only read one cookie). */
export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

function sessionCookieOptions(secure: boolean, maxAgeMs?: number): CookieOptions {
  return {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    ...(maxAgeMs === undefined ? {} : { maxAge: maxAgeMs }),
  };
}

export function setSessionCookie(
  res: Response,
  token: string,
  secure: boolean,
  maxAgeMs: number,
): void {
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions(secure, maxAgeMs));
}

export function clearSessionCookie(res: Response, secure: boolean): void {
  res.clearCookie(SESSION_COOKIE, sessionCookieOptions(secure));
}

/** Attaches req.user for a valid session cookie. Never rejects; use requireUser for that. */
export function sessionMiddleware(db: Database, now: () => Date): RequestHandler {
  return async (req, _res, next) => {
    const token = readCookie(req.headers.cookie, SESSION_COOKIE);
    if (token && /^[A-Za-z0-9_-]{43}$/.test(token)) {
      const tokenHash = hashToken(token);
      const user = await getSessionUser(db, tokenHash, now());
      if (user) {
        req.user = user;
        req.sessionTokenHash = tokenHash;
      }
    }
    next();
  };
}

export const requireUser: RequestHandler = (req, _res, next) => {
  if (!req.user) throw new HttpError(401, 'unauthorized', 'Sign in to continue');
  next();
};

export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (!req.user) throw new HttpError(401, 'unauthorized', 'Sign in to continue');
  if (!req.user.isAdmin) throw new HttpError(403, 'forbidden', 'Admins only');
  next();
};

/** For handlers after requireUser. */
export function currentUser(req: { user?: UserRow | undefined }): UserRow {
  if (!req.user) throw new HttpError(401, 'unauthorized', 'Sign in to continue');
  return req.user;
}
