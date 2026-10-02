import type { ApiError, ApiErrorCode } from '@maize-bites/shared';
import type { ErrorRequestHandler, Request, RequestHandler, Response } from 'express';
import { ZodError } from 'zod';

/** Throw from a handler to send a specific status and error code. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export function sendError(
  req: Request,
  res: Response,
  status: number,
  error: Omit<ApiError['error'], 'requestId'>,
): void {
  // genReqId in app.ts always returns a string.
  const requestId = typeof req.id === 'string' ? req.id : 'unknown';
  const body: ApiError = { error: { ...error, requestId } };
  res.status(status).json(body);
}

export const notFoundHandler: RequestHandler = (req, res) => {
  sendError(req, res, 404, {
    code: 'not_found',
    message: `No route for ${req.method} ${req.path}`,
  });
};

/** For routes that are designed but not built yet. */
export const notImplemented: RequestHandler = (req) => {
  const path = req.originalUrl.split('?')[0] ?? req.originalUrl;
  throw new HttpError(501, 'not_implemented', `${req.method} ${path} is not implemented yet`);
};

function isBodyParseError(err: unknown): boolean {
  return err instanceof SyntaxError && (err as { type?: unknown }).type === 'entity.parse.failed';
}

export const errorHandler: ErrorRequestHandler = (err: unknown, req, res, _next) => {
  if (err instanceof ZodError) {
    sendError(req, res, 400, {
      code: 'invalid_request',
      message: 'Invalid request',
      issues: err.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    });
    return;
  }
  if (err instanceof HttpError) {
    sendError(req, res, err.status, { code: err.code, message: err.message });
    return;
  }
  if (isBodyParseError(err)) {
    sendError(req, res, 400, { code: 'invalid_request', message: 'Malformed JSON body' });
    return;
  }
  // Unexpected: log the details (pino-http attaches res.err to the request log), return nothing internal.
  res.err = err instanceof Error ? err : new Error(String(err));
  sendError(req, res, 500, { code: 'internal_error', message: 'Something went wrong' });
};
