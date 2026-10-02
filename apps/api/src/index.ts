import { createDb, loadRootEnvFile, sql } from '@maize-bites/db';
import { createMailer } from '@maize-bites/email';
import { createApp } from './app.js';
import { parseEnv } from './env.js';
import { createLogger } from './logger.js';

loadRootEnvFile();
const env = parseEnv(process.env);
const logger = createLogger(env);

const { db, close } = createDb(env.DATABASE_URL);
await db.execute(sql`select 1`);
logger.info('connected to postgres');

if (!env.RESEND_API_KEY)
  logger.warn('RESEND_API_KEY not set: emails (sign-in links) are printed to this log');

const app = createApp({
  db,
  logger,
  webOrigin: env.WEB_ORIGIN,
  mailer: createMailer({ apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM, logger }),
  // Browsers only allow Secure cookies over https (and http://localhost in Chrome/Firefox).
  cookieSecure: env.NODE_ENV !== 'development',
  vapidPublicKey: env.VAPID_PUBLIC_KEY ?? null,
  trustProxy: env.TRUST_PROXY,
});
const server = app.listen(env.API_PORT, () => {
  logger.info(
    { port: env.API_PORT, webOrigin: env.WEB_ORIGIN },
    `listening on http://localhost:${env.API_PORT}`,
  );
});

function shutdown(signal: NodeJS.Signals): void {
  logger.info({ signal }, 'shutting down');
  server.close(() => {
    void close().then(() => process.exit(0));
  });
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
