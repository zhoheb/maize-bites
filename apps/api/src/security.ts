import type { RequestHandler } from 'express';
import { HttpError } from './errors.js';

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * CSRF defense in depth for cookie-authenticated writes (SameSite=Lax is the first layer):
 * - a browser Origin header, when present, must be the web app's origin;
 * - a request body must be JSON, which cross-site forms can't send without a CORS preflight.
 */
export function writeProtection(webOrigin: string): RequestHandler {
  return (req, _res, next) => {
    if (!UNSAFE.has(req.method)) {
      next();
      return;
    }
    const origin = req.headers.origin;
    if (origin !== undefined && origin !== webOrigin) {
      throw new HttpError(403, 'forbidden', 'Cross-origin request blocked');
    }
    const hasBody =
      Number(req.headers['content-length'] ?? 0) > 0 ||
      req.headers['transfer-encoding'] !== undefined;
    if (hasBody && !req.is('application/json')) {
      throw new HttpError(400, 'invalid_request', 'Request body must be JSON');
    }
    next();
  };
}
