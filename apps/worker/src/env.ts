import { databaseEnvSchema } from '@maize-bites/db';
import { z } from 'zod';
import { isSupportedInterval } from './scheduler.js';

const emptyAsUndefined = (value: unknown) => (value === '' ? undefined : value);

/** "true"/"false" (or 1/0). Blank means the default. */
const flag = (defaultValue: boolean) =>
  z.preprocess(
    emptyAsUndefined,
    z
      .enum(['true', 'false', '1', '0'])
      .default(defaultValue ? 'true' : 'false')
      .transform((value) => value === 'true' || value === '1'),
  );

export const workerEnvSchema = databaseEnvSchema.extend({
  /** Sent in the feed User-Agent so a site's admins can reach us. Ingestion is off without it. */
  INGEST_CONTACT_EMAIL: z.preprocess(emptyAsUndefined, z.email().optional()),
  /** Happening @ Michigan (events.umich.edu JSON feed). */
  HAPPENING_ENABLED: flag(true),
  /** Maize Pages public events (maizepages.umich.edu ICS/RSS feeds). */
  MAIZEPAGES_ENABLED: flag(false),
  /** Enables the LLM classifier stage. Without it, rules still run and candidates wait. */
  ANTHROPIC_API_KEY: z.preprocess(emptyAsUndefined, z.string().min(1).optional()),
  /** Hard cap on Anthropic API requests per ingestion run (retries included). */
  LLM_MAX_CALLS_PER_RUN: z.coerce.number().int().min(0).max(2000).default(100),
  /** Events that ended more than this many days ago are deleted (with their classifications). */
  EVENT_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(30),
  /** How often the prune job runs. Must divide 60, or be whole hours that divide 24. */
  PRUNE_INTERVAL_MINUTES: z.coerce
    .number()
    .int()
    .refine(isSupportedInterval, 'must divide 60, or be whole hours that divide 24')
    .default(60),
  /** Public web origin, for links in alerts. */
  WEB_ORIGIN: z.url().default('http://localhost:5173'),
  /** Resend API key. Without it, alert emails are printed to the log (development). */
  RESEND_API_KEY: z.preprocess(emptyAsUndefined, z.string().startsWith('re_').optional()),
  EMAIL_FROM: z.string().min(3).default('Maize Bites <onboarding@resend.dev>'),
  /** Web Push (VAPID). Generate with `pnpm --filter worker vapid:keys`. */
  VAPID_PUBLIC_KEY: z.preprocess(emptyAsUndefined, z.string().min(80).optional()),
  VAPID_PRIVATE_KEY: z.preprocess(emptyAsUndefined, z.string().min(40).optional()),
  VAPID_SUBJECT: z.preprocess(
    emptyAsUndefined,
    z
      .string()
      .regex(/^(mailto:|https:)/)
      .optional(),
  ),
});
export type WorkerEnv = z.infer<typeof workerEnvSchema>;

export function parseEnv(source: NodeJS.ProcessEnv): WorkerEnv {
  const result = workerEnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid worker environment:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
