import { databaseEnvSchema } from '@maize-bites/db';
import { base64UrlKeySchema } from '@maize-bites/shared';
import { z } from 'zod';

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

export const apiEnvSchema = databaseEnvSchema
  .extend({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    /**
     * Set by hosts that choose the port for you (Render, Heroku, Fly). When present it wins
     * over API_PORT; see `listenPort`.
     */
    PORT: z.preprocess(emptyAsUndefined, z.coerce.number().int().min(1).max(65535).optional()),
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
    EMAIL_FROM: z.string().min(3).default('Maize Bites <noreply@zachhoheb.dev>'),
    /** Web Push. The public key is served to browsers; the private key lives in the worker. */
    VAPID_PUBLIC_KEY: z.preprocess(pastedKey, base64UrlKeySchema(65).optional()),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && !env.RESEND_API_KEY) {
      ctx.addIssue({ code: 'custom', path: ['RESEND_API_KEY'], message: 'required in production' });
    }
  });
export type ApiEnv = z.infer<typeof apiEnvSchema>;

/** The port to listen on: the host's PORT when it sets one, else API_PORT. */
export function listenPort(env: Pick<ApiEnv, 'PORT' | 'API_PORT'>): number {
  return env.PORT ?? env.API_PORT;
}

export function parseEnv(source: NodeJS.ProcessEnv): ApiEnv {
  const result = apiEnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid api environment:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
