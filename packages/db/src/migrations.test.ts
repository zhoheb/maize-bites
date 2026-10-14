import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DbHandle } from './client.js';
import { sql } from 'drizzle-orm';
import { pushSubscriptions, users } from './schema.js';
import { createTestDb } from './testing.js';

let handle: DbHandle;
beforeEach(async () => {
  handle = await createTestDb();
});
afterEach(async () => {
  await handle.close();
});

const migration = (name: string) =>
  readFileSync(new URL(`../drizzle/${name}.sql`, import.meta.url), 'utf8');

describe('0007_normalize_push_keys', () => {
  it('rewrites standard base64 keys as URL-safe base64 and leaves good rows alone', async () => {
    const { db } = handle;
    const [user] = await db.insert(users).values({ email: 'a@umich.edu' }).returning();
    if (!user) throw new Error('seed user missing');
    await db.insert(pushSubscriptions).values([
      { userId: user.id, endpoint: 'https://push.test/std', p256dh: 'ab+c/d==', auth: 'x/y+==' },
      { userId: user.id, endpoint: 'https://push.test/ok', p256dh: 'ab-c_d', auth: 'x_y-' },
    ]);

    await db.execute(sql.raw(migration('0007_normalize_push_keys')));
    await db.execute(sql.raw(migration('0007_normalize_push_keys')));

    const rows = await db
      .select({ p256dh: pushSubscriptions.p256dh, auth: pushSubscriptions.auth })
      .from(pushSubscriptions);
    expect(rows).toEqual([
      { p256dh: 'ab-c_d', auth: 'x_y-' },
      { p256dh: 'ab-c_d', auth: 'x_y-' },
    ]);
  });
});
