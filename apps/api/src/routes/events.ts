import {
  countReportsByKind,
  getPublishedEvent,
  listPublishedEvents,
  toFoodEvent,
  type Database,
  type PublishedEventFilters,
} from '@maize-bites/db';
import {
  eventIdParamsSchema,
  FOOD_GONE_WINDOW_MS,
  listEventsQuerySchema,
  NOW_WINDOW_MS,
  nowEventsQuerySchema,
  type EventDetail,
  type ListEventsResponse,
  type NowEventsQuery,
} from '@maize-bites/shared';
import { Router, type Response } from 'express';
import type { ApiContext } from '../context.js';
import { decodeCursor, encodeCursor } from '../cursor.js';
import { HttpError } from '../errors.js';
import { buildIcs } from '../ics.js';
import { toEventDetail } from '../serializers.js';
import { reportsRouter } from './reports.js';

/** Filters shared by /events and /events/now (everything except the time window). */
function commonFilters(query: NowEventsQuery, now: Date): PublishedEventFilters {
  return {
    reportsSince: new Date(now.getTime() - FOOD_GONE_WINDOW_MS),
    campuses: query.campus,
    dietary: query.dietary,
    openOnly: query.open_only,
    mealType: query.meal_type,
    bbox: query.bbox,
    after: query.cursor === undefined ? undefined : decodeCursor(query.cursor),
    limit: query.limit,
  };
}

async function sendList(
  db: Database,
  res: Response,
  filters: PublishedEventFilters,
): Promise<void> {
  const { items, nextCursor } = await listPublishedEvents(db, filters);
  const body: ListEventsResponse = {
    events: items.map(toFoodEvent),
    nextCursor: nextCursor && encodeCursor(nextCursor),
  };
  res.json(body);
}

async function findPublished(db: Database, params: unknown, now: Date) {
  const { id } = eventIdParamsSchema.parse(params);
  const published = await getPublishedEvent(db, id, {
    reportsSince: new Date(now.getTime() - FOOD_GONE_WINDOW_MS),
  });
  if (!published) throw new HttpError(404, 'not_found', 'Event not found');
  return published;
}

export function eventsRouter(ctx: ApiContext): Router {
  const { db, now } = ctx;
  const router = Router();

  /** Free-food events. Defaults to everything that hasn't ended yet. */
  router.get('/', async (req, res) => {
    const query = listEventsQuerySchema.parse(req.query);
    await sendList(db, res, {
      ...commonFilters(query, now()),
      from: query.from === undefined ? now() : new Date(query.from),
      to: query.to === undefined ? undefined : new Date(query.to),
    });
  });

  /** Live now, or starting within NOW_WINDOW_MS. */
  router.get('/now', async (req, res) => {
    const query = nowEventsQuerySchema.parse(req.query);
    const at = now();
    await sendList(db, res, {
      ...commonFilters(query, at),
      from: at,
      to: new Date(at.getTime() + NOW_WINDOW_MS),
    });
  });

  /** Event detail with classification and report counts. Past events stay reachable. */
  router.get('/:id', async (req, res) => {
    const published = await findPublished(db, req.params, now());
    const body: EventDetail = toEventDetail(
      published,
      await countReportsByKind(db, published.event.id),
    );
    res.json(body);
  });

  /** Add-to-calendar file. */
  router.get('/:id/ics', async (req, res) => {
    const published = await findPublished(db, req.params, now());
    res
      .type('text/calendar; charset=utf-8')
      .attachment(`maize-bites-${published.event.id}.ics`)
      .send(buildIcs(toFoodEvent(published), { now: now() }));
  });

  router.use('/:id/reports', reportsRouter(ctx));

  return router;
}
