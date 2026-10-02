import { databaseEnvSchema } from '@maize-bites/db';
import { z } from 'zod';

const emptyAsUndefined = (value: unknown) => (value === '' ? undefined : value);

export const workerEnvSchema = databaseEnvSchema.extend({
  /** Sent in the feed User-Agent so the events.umich.edu admins can reach us. Ingestion is off without it. */
  INGEST_CONTACT_EMAIL: z.preprocess(emptyAsUndefined, z.email().optional()),
  /** Enables the LLM classifier stage. Without it, rules still run and candidates wait. */
  ANTHROPIC_API_KEY: z.preprocess(emptyAsUndefined, z.string().min(1).optional()),
  /** Hard cap on Anthropic API requests per ingestion run (retries included). */
  LLM_MAX_CALLS_PER_RUN: z.coerce.number().int().min(0).max(2000).default(100),
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
