import type { Database } from '@maize-bites/db';
import type { Mailer } from '@maize-bites/email';
import type { RateLimits } from './rate-limit.js';

/** Everything route handlers need, injected so tests can swap any piece. */
export interface ApiContext {
  db: Database;
  now: () => Date;
  mailer: Mailer;
  /** Public origin of the web app: CORS, CSRF checks, and links in emails. */
  webOrigin: string;
  /** Secure flag on the session cookie. Off only for plain-http local development. */
  cookieSecure: boolean;
  /** VAPID public key for Web Push, or null if push isn't configured. */
  vapidPublicKey: string | null;
  rateLimits: RateLimits;
}
