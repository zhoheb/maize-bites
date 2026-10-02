import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

/** Driver-agnostic handle so queries run against postgres-js in apps and PGlite in tests. */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface DbHandle {
  db: Database;
  close: () => Promise<void>;
}

export function createDb(databaseUrl: string, options: { maxConnections?: number } = {}): DbHandle {
  const client = postgres(databaseUrl, { max: options.maxConnections ?? 10 });
  return {
    db: drizzle(client, { schema }),
    close: () => client.end(),
  };
}
