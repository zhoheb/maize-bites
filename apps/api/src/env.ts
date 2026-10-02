import { databaseEnvSchema } from '@maize-bites/db';
import { z } from 'zod';

const emptyAsUndefined = (value: unknown) => (value === '' ? undefined : value);

export const apiEnvSchema = databaseEnvSchema
  .extend({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    /** The only browser origin allowed by CORS, e.g. https://maizebites.app. No trailing slash. */
    WEB_ORIGIN: z
      .url({ protocol: /^https?$/ })
      .refine(
        (url) => URL.canParse(url) && new URL(url).origin === url,
        'must be a bare origin like https://example.com',
      ),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    /** Proxy hops in front of the API (Vercel rewrite + host load balancer), for client IPs. */
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
    /** Resend API key. Without it (development only), emails are printed to the log. */
    RESEND_API_KEY: z.preprocess(emptyAsUndefined, z.string().startsWith('re_').optional()),
    EMAIL_FROM: z.string().min(3).default('Maize Bites <onboarding@resend.dev>'),
    /** Web Push. The public key is served to browsers; the private key lives in the worker. */
    VAPID_PUBLIC_KEY: z.preprocess(emptyAsUndefined, z.string().min(80).optional()),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && !env.RESEND_API_KEY) {
      ctx.addIssue({ code: 'custom', path: ['RESEND_API_KEY'], message: 'required in production' });
    }
  });
export type ApiEnv = z.infer<typeof apiEnvSchema>;

export function parseEnv(source: NodeJS.ProcessEnv): ApiEnv {
  const result = apiEnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid api environment:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
