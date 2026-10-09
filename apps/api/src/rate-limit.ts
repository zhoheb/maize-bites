import type { Request, RequestHandler } from 'express';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { sendError } from './errors.js';

export interface LimitRule {
  windowMs: number;
  limit: number;
}

/** A limiter that answers in the standard error format. `key` defaults to the client IP. */
export function limiter(
  name: string,
  rule: LimitRule,
  key?: (req: Request) => string | null,
): RequestHandler {
  return rateLimit({
    windowMs: rule.windowMs,
    limit: rule.limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => {
      const custom = key?.(req);
      return custom ? `${name}:${custom}` : `${name}:ip:${ipKeyGenerator(req.ip ?? 'unknown')}`;
    },
    handler: (req, res) => {
      sendError(req, res, 429, {
        code: 'rate_limited',
        message: 'Too many requests. Try again in a few minutes.',
      });
    },
  });
}

export interface RateLimits {
  magicLinkPerIp: LimitRule;
  magicLinkPerEmail: LimitRule;
  /** Tips per signed-in user. */
  submissionsPerUser: LimitRule;
  /** Reports per signed-in user, across all events. */
  reportsPerUser: LimitRule;
}

export const DEFAULT_RATE_LIMITS: RateLimits = {
  magicLinkPerIp: { windowMs: 15 * 60_000, limit: 10 },
  magicLinkPerEmail: { windowMs: 15 * 60_000, limit: 3 },
  submissionsPerUser: { windowMs: 60 * 60_000, limit: 5 },
  reportsPerUser: { windowMs: 60 * 60_000, limit: 30 },
};

/** Keys a limiter on the signed-in user. Put it after requireUser. */
export const byUser = (req: Request): string | null => req.user?.id ?? null;
