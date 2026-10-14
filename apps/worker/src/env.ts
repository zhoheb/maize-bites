import { databaseEnvSchema } from '@maize-bites/db';
import { base64UrlKeySchema } from '@maize-bites/shared';
import { z } from 'zod';
import { isSupportedInterval } from './scheduler.js';

const emptyAsUndefined = (value: unknown) => (value === '' ? undefined : value);

/** A pasted secret: surrounding whitespace and one pair of quotes dropped. Blank means unset. */
const pastedKey = (value: unknown) => {
  if (typeof value !== 'string') return value;
  const unquoted = value
    .trim()
    .replace(/^(["'])([\s\S]*)\1$/, '$2')
    .trim();
  return unquoted === '' ? undefined : unquoted;
};

/** "true"/"false" (or 1/0). Blank means the default. */
const flag = (defaultValue: boolean) =>
  z.preprocess(
    emptyAsUndefined,
    z
      .enum(['true', 'false', '1', '0'])
      .default(defaultValue ? 'true' : 'false')
      .transform((value) => value === 'true' || value === '1'),
  );

export const workerEnvSchema = databaseEnvSchema
  .extend({
    /** development prints readable logs; anything else prints JSON lines. */
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    /** Sent in the feed User-Agent so a site's admins can reach us. Ingestion is off without it. */
    INGEST_CONTACT_EMAIL: z.preprocess(emptyAsUndefined, z.email().optional()),
    /** Happening @ Michigan (events.umich.edu JSON feed). Needs the two values below. */
    HAPPENING_ENABLED: flag(true),
    /**
     * Secret. Issued by Student Life Technology Solutions for the events.umich.edu integration
     * header. Without it (or PUBLIC_SITE_URL) the Happening source is switched off at startup.
     */
    UMICH_INTEGRATION_TOKEN: z.preprocess(
      emptyAsUndefined,
      z
        .string()
        .regex(/^\S{8,200}$/, 'must be 8+ characters with no spaces')
        .optional(),
    ),
    /** The site's public https origin, sent with the token. No trailing slash. */
    PUBLIC_SITE_URL: z.preprocess(
      emptyAsUndefined,
      z
        .url({ protocol: /^https$/ })
        .refine((url) => !url.endsWith('/'), 'must not end with a slash')
        .optional(),
    ),
    /** Maize Pages public events (maizepages.umich.edu ICS/RSS feeds). */
    MAIZEPAGES_ENABLED: flag(false),
    /**
     * "llm": keyword rules pick candidates and Claude decides; nothing from a feed is published
     * without the model's say-so. "rules": no LLM at all; a stricter set of rules is the final
     * judge and its positives are published. Rules mode misses more and is wrong more often.
     */
    CLASSIFIER_MODE: z.preprocess(emptyAsUndefined, z.enum(['llm', 'rules']).default('llm')),
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
    EMAIL_FROM: z.string().min(3).default('Maize Bites <noreply@zachhoheb.dev>'),
    /** Web Push (VAPID). Generate with `pnpm --filter worker vapid:keys`. */
    VAPID_PUBLIC_KEY: z.preprocess(pastedKey, base64UrlKeySchema(65).optional()),
    VAPID_PRIVATE_KEY: z.preprocess(pastedKey, base64UrlKeySchema(32).optional()),
    VAPID_SUBJECT: z.preprocess(
      emptyAsUndefined,
      z
        .string()
        .regex(/^(mailto:|https:)/)
        .optional(),
    ),
  })
  .superRefine((env, ctx) => {
    if (Boolean(env.VAPID_PUBLIC_KEY) !== Boolean(env.VAPID_PRIVATE_KEY)) {
      const missing = env.VAPID_PUBLIC_KEY ? 'VAPID_PRIVATE_KEY' : 'VAPID_PUBLIC_KEY';
      ctx.addIssue({ code: 'custom', path: [missing], message: 'set both VAPID keys, or neither' });
    }
  });
export type WorkerEnv = z.infer<typeof workerEnvSchema>;

export function parseEnv(source: NodeJS.ProcessEnv): WorkerEnv {
  const result = workerEnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid worker environment:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
