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

/**
 * Neon suspends a compute only once nothing is using it, so a pool must not sit on connections:
 * idle ones close after 30 s, and none lives past 10 minutes. Both are in seconds.
 */
export function connectionOptions(maxConnections = 10) {
  return { max: maxConnections, idle_timeout: 30, max_lifetime: 10 * 60 };
}

export function createDb(databaseUrl: string, options: { maxConnections?: number } = {}): DbHandle {
  const client = postgres(databaseUrl, connectionOptions(options.maxConnections));
  return {
    db: drizzle(client, { schema }),
    close: () => client.end(),
  };
}
