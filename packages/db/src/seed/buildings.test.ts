import { CAMPUSES } from '@maize-bites/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DbHandle } from '../client.js';
import { buildings } from '../schema.js';
import { createTestDb } from '../testing.js';
import { BUILDINGS } from './buildings.js';
import { seedBuildings } from './seed-buildings.js';

// Generous box around Ann Arbor's campuses; catches swapped lat/lng and sign errors.
const ANN_ARBOR = { south: 42.25, north: 42.31, west: -83.77, east: -83.69 };

describe('BUILDINGS seed data', () => {
  it('has around 40+ buildings on every campus', () => {
    expect(BUILDINGS.length).toBeGreaterThanOrEqual(40);
    expect(new Set(BUILDINGS.map((b) => b.campus))).toEqual(new Set(CAMPUSES));
  });

  it('has coordinates inside Ann Arbor', () => {
    for (const b of BUILDINGS) {
      expect(b.lat, b.name).toBeGreaterThan(ANN_ARBOR.south);
      expect(b.lat, b.name).toBeLessThan(ANN_ARBOR.north);
      expect(b.lng, b.name).toBeGreaterThan(ANN_ARBOR.west);
      expect(b.lng, b.name).toBeLessThan(ANN_ARBOR.east);
    }
  });

  it('has no name or alias that maps to two buildings (case-insensitive)', () => {
    const owner = new Map<string, string>();
    for (const b of BUILDINGS) {
      for (const key of [b.name, ...b.aliases].map((s) => s.toLowerCase())) {
        const existing = owner.get(key);
        expect(
          existing === undefined || existing === b.name,
          `"${key}" is used by ${existing} and ${b.name}`,
        ).toBe(true);
        owner.set(key, b.name);
      }
    }
  });
});

describe('seedBuildings', () => {
  let handle: DbHandle;

  beforeEach(async () => {
    handle = await createTestDb();
  });

  afterEach(async () => {
    await handle.close();
  });

  it('inserts every building and is idempotent', async () => {
    await seedBuildings(handle.db);
    await seedBuildings(handle.db);

    const rows = await handle.db.select().from(buildings);
    expect(rows).toHaveLength(BUILDINGS.length);
  });

  it('updates existing rows by name', async () => {
    const [union] = BUILDINGS;
    if (!union) throw new Error('empty seed');
    await seedBuildings(handle.db, [union]);
    await seedBuildings(handle.db, [{ ...union, lat: 42.2752, aliases: ['Union'] }]);

    const rows = await handle.db.select().from(buildings);
    expect(rows).toEqual([
      expect.objectContaining({ name: union.name, lat: 42.2752, aliases: ['Union'] }),
    ]);
  });
});
