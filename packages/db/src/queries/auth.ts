import { and, eq, gt, isNull, lt, or, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import { magicLinkTokens, sessions, users, type UserRow } from '../schema.js';

export async function createMagicLink(
  db: Database,
  link: { email: string; tokenHash: string; expiresAt: Date },
): Promise<void> {
  await db.insert(magicLinkTokens).values(link);
}

/**
 * Atomically marks a valid, unused, unexpired token as used and returns its email.
 * Null for unknown, expired, or already-used tokens. Safe against double-submit races.
 */
export async function consumeMagicLink(
  db: Database,
  tokenHash: string,
  now: Date,
): Promise<string | null> {
  const [row] = await db
    .update(magicLinkTokens)
    .set({ usedAt: now })
    .where(
      and(
        eq(magicLinkTokens.tokenHash, tokenHash),
        isNull(magicLinkTokens.usedAt),
        gt(magicLinkTokens.expiresAt, now),
      ),
    )
    .returning({ email: magicLinkTokens.email });
  return row?.email ?? null;
}

/**
 * Finds or creates the user. `grantAdmin` makes them an admin, new or existing (ADMIN_EMAILS);
 * without it, is_admin is left as it is, so nobody is demoted here.
 */
export async function upsertUserByEmail(
  db: Database,
  email: string,
  { grantAdmin = false }: { grantAdmin?: boolean } = {},
): Promise<UserRow> {
  const [row] = await db
    .insert(users)
    .values({ email, ...(grantAdmin ? { isAdmin: true } : {}) })
    .onConflictDoUpdate({
      target: users.email,
      set: grantAdmin
        ? { email: sql`excluded.email`, isAdmin: true }
        : { email: sql`excluded.email` },
    })
    .returning();
  if (!row) throw new Error('upsert returned no row');
  return row;
}

export async function createSession(
  db: Database,
  session: { userId: string; tokenHash: string; expiresAt: Date },
): Promise<void> {
  await db.insert(sessions).values(session);
}

/** The user for an unexpired session token hash, or null. */
export async function getSessionUser(
  db: Database,
  tokenHash: string,
  now: Date,
): Promise<UserRow | null> {
  const [row] = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now)))
    .limit(1);
  return row?.user ?? null;
}

export async function deleteSession(db: Database, tokenHash: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
}

/** Housekeeping: drop expired sessions and tokens that are expired or used. */
export async function deleteExpiredAuthRows(db: Database, now: Date): Promise<number> {
  const s = await db
    .delete(sessions)
    .where(lt(sessions.expiresAt, now))
    .returning({ id: sessions.id });
  const t = await db
    .delete(magicLinkTokens)
    .where(or(lt(magicLinkTokens.expiresAt, now), sql`${magicLinkTokens.usedAt} is not null`))
    .returning({ id: magicLinkTokens.id });
  return s.length + t.length;
}
