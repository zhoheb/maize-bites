import type { Database } from '@maize-bites/db';
import { createMailer } from '@maize-bites/email';
import { anthropicCreateMessage } from '../classifier/anthropic.js';
import { classifyPendingEvents, type LlmDeps } from '../classifier/classify-events.js';
import type { WorkerEnv } from '../env.js';
import { buildUserAgent, fetchHappeningWindow } from '../happening/client.js';
import { createDelivery, type Delivery } from '../notify/delivery.js';
import { runDigest, runInstantAlerts } from '../notify/notifier.js';
import type { Job, Logger } from '../scheduler.js';
import { ingestIfDue, type IngestDeps } from './ingest-happening.js';

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

export function happeningIngestDeps(
  db: Database,
  contactEmail: string,
  logger: Logger,
  llm: LlmDeps | null,
  notify?: { delivery: Delivery; webOrigin: string },
): IngestDeps {
  const http = { userAgent: buildUserAgent(contactEmail), logger };
  return {
    db,
    logger,
    fetchWindow: (from) => fetchHappeningWindow(http, { from }),
    classify: (now) => classifyPendingEvents({ db, logger, now, llm }),
    ...(notify && {
      notify: (now: Date) => runInstantAlerts({ db, logger, now, ...notify }),
    }),
  };
}

/** Hourly at :23 (off the top of the hour). ingestIfDue enforces the at-most-hourly rule. */
export function happeningIngestJob(deps: IngestDeps): Job {
  return {
    name: 'ingest-happening',
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
