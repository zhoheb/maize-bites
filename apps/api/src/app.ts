import { randomUUID } from 'node:crypto';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { ApiContext } from './context.js';
import { errorHandler, notFoundHandler } from './errors.js';
import type { Logger } from './logger.js';
import { DEFAULT_RATE_LIMITS, type RateLimits } from './rate-limit.js';
import { apiRouter } from './routes/index.js';

export interface AppDeps extends Omit<ApiContext, 'now' | 'rateLimits'> {
  logger: Logger;
  now?: () => Date;
  rateLimits?: RateLimits;
  /** Express `trust proxy`: number of proxy hops in front of the API (for client IPs). */
  trustProxy?: number;
}

const REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/;

export function createApp({
  logger,
  now = () => new Date(),
  rateLimits = DEFAULT_RATE_LIMITS,
  trustProxy = 0,
  ...ctx
}: AppDeps): Express {
  const { webOrigin } = ctx;
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', trustProxy);

  app.use(
    pinoHttp({
      logger,
      // Reuse a sane upstream id (load balancer, web app) so logs correlate; otherwise mint one.
      genReqId: (req, res) => {
        const incoming = req.headers['x-request-id'];
        const id =
          typeof incoming === 'string' && REQUEST_ID.test(incoming) ? incoming : randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
      customLogLevel: (_req, res, err) =>
        err !== undefined || res.statusCode >= 500
          ? 'error'
          : res.statusCode >= 400
            ? 'warn'
            : 'info',
    }),
  );
  app.use(helmet());
  app.use(
    cors({
      // Requests with no Origin (curl, server-to-server) aren't CORS and pass through untouched.
      origin: (origin, callback) => {
        callback(null, origin === webOrigin);
      },
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      credentials: true, // for the session cookie once auth lands
      exposedHeaders: ['X-Request-Id'],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: '100kb' }));

  app.use('/api', apiRouter({ ...ctx, now, rateLimits }));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
