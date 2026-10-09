import { listBuildings, type Database } from '@maize-bites/db';
import type { Building } from '@maize-bites/shared';
import { Router } from 'express';

// Mounted at /api/buildings. Public: the tip form's building picker.
export function buildingsRouter(db: Database): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    const rows = await listBuildings(db);
    const body: { buildings: Building[] } = {
      buildings: rows.map(({ id, name, aliases, campus }) => ({ id, name, aliases, campus })),
    };
    res.set('Cache-Control', 'public, max-age=3600').json(body);
  });

  return router;
}
