import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import { migrate as migratePostgres } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import type { Database, DbHandle } from './client.js';
import { databaseEnvSchema, loadRootEnvFile } from './env.js';
import type { UpsertEventInput } from './queries/events.js';
import * as schema from './schema.js';

const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

/**
 * A fresh, fully migrated database for one test. For tests only.
 *
 * Default: in-memory PGlite (no Docker needed).
 * TEST_DB=postgres: a throwaway database on the server in DATABASE_URL, dropped on close.
 * Use that mode (`pnpm test:pg`) to catch driver differences PGlite hides.
 */
export function createTestDb(): Promise<DbHandle> {
  return process.env['TEST_DB'] === 'postgres' ? createPostgresTestDb() : createPgliteTestDb();
}

// Migrate once per test process, then start each test from a copy of that data dir.
let migratedSnapshot: Promise<File | Blob> | undefined;

function pgliteSnapshot(): Promise<File | Blob> {
  migratedSnapshot ??= (async () => {
    const template = new PGlite();
    await migratePglite(drizzlePglite(template, { schema }), { migrationsFolder });
    const snapshot = await template.dumpDataDir('none');
    await template.close();
    return snapshot;
  })();
  return migratedSnapshot;
}

async function createPgliteTestDb(): Promise<DbHandle> {
  const client = new PGlite({ loadDataDir: await pgliteSnapshot() });
  return { db: drizzlePglite(client, { schema }), close: () => client.close() };
}

async function createPostgresTestDb(): Promise<DbHandle> {
  loadRootEnvFile();
  const { DATABASE_URL } = databaseEnvSchema.parse(process.env);
  const name = `maize_test_${randomUUID().replaceAll('-', '')}`;

  const admin = postgres(DATABASE_URL, { max: 1, onnotice: () => undefined });
  await admin.unsafe(`create database "${name}"`);

  const url = new URL(DATABASE_URL);
  url.pathname = `/${name}`;
  const client = postgres(url.toString(), { max: 4, onnotice: () => undefined });
  const db = drizzlePostgres(client, { schema });
  await migratePostgres(db, { migrationsFolder });

  return {
    db,
    close: async () => {
      await client.end();
      await admin.unsafe(`drop database "${name}"`);
      await admin.end();
    },
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let sequence = 0;

/** A minimal valid upsertEvent input with a unique source_event_id. */
export function eventInput(overrides: Partial<UpsertEventInput> = {}): UpsertEventInput {
  sequence += 1;
  return {
    source: 'happening',
    sourceEventId: `test-${sequence}`,
    occurrenceId: '0',
    title: `Test event ${sequence}`,
    startsAt: new Date('2026-10-01T16:00:00Z'),
    ...overrides,
  };
}

/** Inserts a classification for the event's current content. Defaults to a publishable llm verdict. */
export async function insertClassification(
  db: Database,
  event: Pick<schema.EventRow, 'id' | 'contentHash'>,
  overrides: Partial<schema.NewClassificationRow> = {},
): Promise<schema.ClassificationRow> {
  const [row] = await db
    .insert(schema.classifications)
    .values({
      eventId: event.id,
      contentHash: event.contentHash,
      method: 'llm',
      model: 'claude-haiku-4-5',
      hasFreeFood: true,
      confidence: 0.9,
      audience: 'open',
      audienceEvidence: 'Open to all',
      ...overrides,
    })
    .returning();
  if (!row) throw new Error('insert returned no row');
  return row;
}
