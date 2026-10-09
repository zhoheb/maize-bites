import { getHttpValidators, saveHttpValidators, type Database } from '@maize-bites/db';
import { createMailer } from '@maize-bites/email';
import { anthropicCreateMessage } from '../classifier/anthropic.js';
import { classifyPendingEvents, type LlmDeps } from '../classifier/classify-events.js';
import type { WorkerEnv } from '../env.js';
import { createDelivery, type Delivery } from '../notify/delivery.js';
import { runDigest, runInstantAlerts } from '../notify/notifier.js';
import type { Job, Logger } from '../scheduler.js';
import { fetchHappeningWindow } from '../sources/happening/client.js';
import { createHappeningSource } from '../sources/happening/index.js';
import { buildUserAgent, type HttpOptions } from '../sources/http/client.js';
import { createHostRateLimiter } from '../sources/http/rate-limit.js';
import { createRobotsChecker } from '../sources/http/robots.js';
import { createMaizepagesSource } from '../sources/maizepages/index.js';
import type { Source } from '../sources/types.js';
import { ingestIfDue, type IngestDeps } from './ingest.js';

export function llmDepsFromEnv(env: WorkerEnv): LlmDeps | null {
  if (!env.ANTHROPIC_API_KEY) return null;
  return {
    createMessage: anthropicCreateMessage(env.ANTHROPIC_API_KEY),
    maxCalls: env.LLM_MAX_CALLS_PER_RUN,
  };
}

export function deliveryFromEnv(db: Database, env: WorkerEnv, logger: Logger): Delivery {
  const vapid =
    env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT
      ? {
          publicKey: env.VAPID_PUBLIC_KEY,
          privateKey: env.VAPID_PRIVATE_KEY,
          subject: env.VAPID_SUBJECT,
        }
      : null;
  const mailer = createMailer({ apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM, logger });
  return createDelivery({ db, mailer, vapid, logger });
}

/**
 * The sources switched on in the environment, sharing one HTTP client so robots.txt lookups and
 * per-host pacing apply across them. Empty without INGEST_CONTACT_EMAIL: we don't fetch
 * anything unless the User-Agent says how to reach us.
 */
export function sourcesFromEnv(db: Database, env: WorkerEnv, logger: Logger): Source[] {
  if (!env.INGEST_CONTACT_EMAIL) return [];
  const userAgent = buildUserAgent(env.INGEST_CONTACT_EMAIL);
  const http: HttpOptions = {
    userAgent,
    logger,
    robots: createRobotsChecker({ userAgent }),
    rateLimiter: createHostRateLimiter(),
  };
  const sources: Source[] = [];
  if (env.HAPPENING_ENABLED)
    sources.push(
      createHappeningSource({ fetchWindow: (from) => fetchHappeningWindow(http, { from }) }),
    );
  if (env.MAIZEPAGES_ENABLED)
    sources.push(
      createMaizepagesSource({
        http,
        logger,
        validators: {
          get: (url) => getHttpValidators(db, url),
          save: (url, validators) => saveHttpValidators(db, url, validators, new Date()),
        },
      }),
    );
  return sources;
}

export function ingestDeps(
  db: Database,
  sources: readonly Source[],
  logger: Logger,
  llm: LlmDeps | null,
  notify?: { delivery: Delivery; webOrigin: string },
): IngestDeps {
  return {
    db,
    sources,
    logger,
    classify: (now) => classifyPendingEvents({ db, logger, now, llm }),
    ...(notify && {
      notify: (now: Date) => runInstantAlerts({ db, logger, now, ...notify }),
    }),
  };
}

/** Hourly at :23 (off the top of the hour). ingestIfDue decides which sources are due. */
export function ingestJob(deps: IngestDeps): Job {
  return {
    name: 'ingest',
    schedule: '23 * * * *',
    runOnStart: true,
    run: () => ingestIfDue(deps),
  };
}

/** 7:30 AM Ann Arbor time. Not run on start: a restart must not send an extra digest. */
export function digestJob(
  db: Database,
  logger: Logger,
  delivery: Delivery,
  webOrigin: string,
): Job {
  return {
    name: 'morning-digest',
    schedule: '30 7 * * *',
    run: () => runDigest({ db, logger, delivery, webOrigin, now: new Date() }),
  };
}
