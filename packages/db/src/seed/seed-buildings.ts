import { sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import { buildings } from '../schema.js';
import { BUILDINGS, type BuildingSeed } from './buildings.js';

/** Idempotent: upserts by name, so edits to the seed list overwrite existing rows. */
export async function seedBuildings(
  db: Database,
  seeds: readonly BuildingSeed[] = BUILDINGS,
): Promise<number> {
  if (seeds.length === 0) return 0;
  const rows = await db
    .insert(buildings)
    .values([...seeds])
    .onConflictDoUpdate({
      target: buildings.name,
      set: {
        aliases: sql`excluded.aliases`,
        campus: sql`excluded.campus`,
        lat: sql`excluded.lat`,
        lng: sql`excluded.lng`,
      },
    })
    .returning({ id: buildings.id });
  return rows.length;
}
