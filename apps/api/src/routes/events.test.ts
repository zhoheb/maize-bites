import { apiErrorSchema, eventDetailSchema, listEventsResponseSchema } from '@maize-bites/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CENTRAL_BBOX, NORTH_BBOX, at, createTestApi, type TestApi } from '../test/seed.js';

// Read-only suites share one seeded database.
let api: TestApi;
beforeAll(async () => {
  api = await createTestApi();
});
afterAll(async () => {
  await api.handle.close();
});

async function titles(path: string, query: Record<string, string | string[]> = {}) {
  const res = await request(api.app).get(path).query(query);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return listEventsResponseSchema.parse(res.body).events.map((e) => e.title);
}

const PIZZA = 'Pizza at the Union';
const BOBA = 'CSE boba social';
const BAGELS = 'Bagels on the Diag';
const BREAKFAST = 'Grand rounds breakfast';
const DINNER = 'Next week dinner';
const ENDED = 'Ended lunch';

describe('GET /api/events', () => {
  it('returns published events that have not ended, soonest first, in the shared format', async () => {
    const res = await request(api.app).get('/api/events');

    expect(res.status).toBe(200);
    const body = listEventsResponseSchema.parse(res.body);
    expect(body.events.map((e) => e.title)).toEqual([PIZZA, BOBA, BAGELS, BREAKFAST, DINNER]);
    expect(body.nextCursor).toBeNull();
    expect(body.events[0]).toMatchObject({
      room: 'Pendleton Room',
      building: { name: 'Michigan Union', campus: 'central' },
      lat: 42.27517, // from the building
      foodItems: ['pizza'],
      mealType: 'lunch',
      dietary: ['vegetarian'],
      audience: 'open',
    });
  });

  describe('single filters', () => {
    it.each([
      [{ campus: 'north' }, [BOBA]],
      [{ campus: 'central' }, [PIZZA, DINNER]], // the Diag bagels have coordinates but no building
      [{ campus: 'central,medical' }, [PIZZA, BREAKFAST, DINNER]],
      [{ campus: ['medical', 'north'] }, [BOBA, BREAKFAST]],
      [{ dietary: 'vegetarian' }, [PIZZA, BOBA]],
      [{ dietary: 'vegan,gluten_free' }, [BAGELS]],
      [{ open_only: 'true' }, [PIZZA, BAGELS, DINNER]],
      [{ open_only: 'false' }, [PIZZA, BOBA, BAGELS, BREAKFAST, DINNER]],
      [{ meal_type: 'snacks' }, [BOBA, BAGELS]],
      [{ meal_type: 'breakfast' }, [BREAKFAST]],
      [{ to: at(5).toISOString() }, [PIZZA, BOBA, BAGELS]],
      [{ from: at(-4).toISOString() }, [ENDED, PIZZA, BOBA, BAGELS, BREAKFAST, DINNER]],
      [{ from: at(1).toISOString() }, [BOBA, BAGELS, BREAKFAST, DINNER]],
      [{ bbox: CENTRAL_BBOX }, [PIZZA, BAGELS, DINNER]],
      [{ bbox: NORTH_BBOX }, [BOBA]],
    ])('%j', async (query, expected) => {
      expect(await titles('/api/events', query)).toEqual(expected);
    });
  });

  describe('filter combinations', () => {
    it.each([
      [{ campus: 'central', open_only: 'true', to: at(24).toISOString() }, [PIZZA]],
      [{ campus: 'north', dietary: 'vegetarian' }, [BOBA]],
      [{ bbox: NORTH_BBOX, meal_type: 'snacks' }, [BOBA]],
      [{ open_only: 'true', dietary: 'vegan' }, [BAGELS]],
      [{ bbox: CENTRAL_BBOX, open_only: 'true', meal_type: 'dinner' }, [DINNER]],
      [{ from: at(-4).toISOString(), to: at(0).toISOString(), meal_type: 'lunch' }, [ENDED, PIZZA]],
      [{ campus: 'north', open_only: 'true' }, []],
    ])('%j', async (query, expected) => {
      expect(await titles('/api/events', query)).toEqual(expected);
    });
  });

  describe('cursor pagination', () => {
    it('walks every page without gaps or repeats', async () => {
      const pages: string[][] = [];
      let cursor: string | null = null;
      do {
        const query: Record<string, string> = { limit: '2', ...(cursor ? { cursor } : {}) };
        const body = listEventsResponseSchema.parse(
          (await request(api.app).get('/api/events').query(query)).body,
        );
        pages.push(body.events.map((e) => e.title));
        cursor = body.nextCursor;
      } while (cursor);

      expect(pages).toEqual([[PIZZA, BOBA], [BAGELS, BREAKFAST], [DINNER]]);
    });

    it('keeps filters applied across pages', async () => {
      const first = listEventsResponseSchema.parse(
        (await request(api.app).get('/api/events').query({ campus: 'central', limit: '1' })).body,
      );
      const second = listEventsResponseSchema.parse(
        (
          await request(api.app)
            .get('/api/events')
            .query({ campus: 'central', limit: '1', cursor: first.nextCursor ?? '' })
        ).body,
      );
      expect([...first.events, ...second.events].map((e) => e.title)).toEqual([PIZZA, DINNER]);
      expect(second.nextCursor).toBeNull();
    });
  });

  describe('400 on bad input', () => {
    it.each([
      [{ campus: 'dearborn' }, 'campus.0'],
      [{ campus: '' }, 'campus'],
      [{ dietary: 'paleo' }, 'dietary.0'],
      [{ open_only: 'yes' }, 'open_only'],
      [{ meal_type: 'brunch' }, 'meal_type'],
      [{ bbox: '1,2,3' }, 'bbox'],
      [{ bbox: '-83.73,42.27,-83.75,42.28' }, 'bbox'],
      [{ bbox: 'a,b,c,d' }, 'bbox.0'],
      [{ from: 'tomorrow' }, 'from'],
      [{ to: '2026-10-01' }, 'to'],
      [{ limit: '0' }, 'limit'],
      [{ limit: '101' }, 'limit'],
      [{ limit: 'ten' }, 'limit'],
      [{ cursor: 'garbage' }, 'cursor'],
    ])('%j → issue at %s', async (query, path) => {
      const res = await request(api.app).get('/api/events').query(query);

      expect(res.status).toBe(400);
      const { error } = apiErrorSchema.parse(res.body);
      expect(error.code).toBe('invalid_request');
      expect(error.issues?.map((i) => i.path)).toContain(path);
    });
  });
});

describe('GET /api/events/now', () => {
  it('returns events live now or starting within 3 hours', async () => {
    expect(await titles('/api/events/now')).toEqual([PIZZA, BOBA]);
  });

  it('applies the same filters', async () => {
    expect(await titles('/api/events/now', { campus: 'north' })).toEqual([BOBA]);
    expect(await titles('/api/events/now', { open_only: 'true' })).toEqual([PIZZA]);
    expect(await titles('/api/events/now', { dietary: 'vegetarian', bbox: CENTRAL_BBOX })).toEqual([
      PIZZA,
    ]);
  });

  it('ignores from/to (the window is fixed)', async () => {
    expect(
      await titles('/api/events/now', { from: at(-10).toISOString(), to: at(200).toISOString() }),
    ).toEqual([PIZZA, BOBA]);
  });

  it('paginates', async () => {
    const body = listEventsResponseSchema.parse(
      (await request(api.app).get('/api/events/now').query({ limit: '1' })).body,
    );
    expect(body.events.map((e) => e.title)).toEqual([PIZZA]);
    expect(await titles('/api/events/now', { limit: '1', cursor: body.nextCursor ?? '' })).toEqual([
      BOBA,
    ]);
  });

  it('rejects bad filters', async () => {
    const res = await request(api.app).get('/api/events/now').query({ campus: 'mars' });
    expect(res.status).toBe(400);
    expect(apiErrorSchema.parse(res.body).error.code).toBe('invalid_request');
  });
});

describe('GET /api/events/:id', () => {
  it('returns detail with classification and report counts', async () => {
    const res = await request(api.app).get(`/api/events/${api.seeded.pizza.id}`);

    expect(res.status).toBe(200);
    const detail = eventDetailSchema.parse(res.body);
    expect(detail).toMatchObject({
      id: api.seeded.pizza.id,
      title: PIZZA,
      url: 'https://events.umich.edu/event/1',
      classification: { method: 'llm', confidence: 0.9, evidence: 'free pizza' },
      reportCounts: { food_gone: 3, still_food: 1, not_free: 0, wrong_info: 0 },
      likelyGone: true,
    });
  });

  it('is not likely gone below the threshold', async () => {
    const detail = eventDetailSchema.parse(
      (await request(api.app).get(`/api/events/${api.seeded.boba.id}`)).body,
    );
    expect(detail.reportCounts.food_gone).toBe(1);
    expect(detail.likelyGone).toBe(false);
  });

  it('still serves published events that already ended', async () => {
    expect((await request(api.app).get(`/api/events/${api.seeded.ended.id}`)).status).toBe(200);
  });

  it.each(['reviewBand', 'manualHidden', 'removed', 'rulesOnly'] as const)(
    '404s for an unpublished event (%s)',
    async (key) => {
      const res = await request(api.app).get(`/api/events/${api.seeded[key].id}`);
      expect(res.status).toBe(404);
      expect(apiErrorSchema.parse(res.body).error).toMatchObject({
        code: 'not_found',
        message: 'Event not found',
      });
    },
  );

  it('404s for an unknown id', async () => {
    expect(
      (await request(api.app).get('/api/events/00000000-0000-4000-8000-000000000000')).status,
    ).toBe(404);
  });

  it('400s for a malformed id', async () => {
    const res = await request(api.app).get('/api/events/not-a-uuid');
    expect(res.status).toBe(400);
    expect(apiErrorSchema.parse(res.body).error.issues).toEqual([
      { path: 'id', message: expect.any(String) as unknown },
    ]);
  });
});

describe('GET /api/events/:id/ics', () => {
  it('returns a calendar file for the event', async () => {
    const res = await request(api.app).get(`/api/events/${api.seeded.pizza.id}/ics`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/calendar; charset=utf-8');
    expect(res.headers['content-disposition']).toBe(
      `attachment; filename="maize-bites-${api.seeded.pizza.id}.ics"`,
    );
    const body = res.text;
    expect(body.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(body.endsWith('END:VCALENDAR\r\n')).toBe(true);
    const unfolded = body.replace(/\r\n /g, '');
    expect(unfolded).toContain(`UID:${api.seeded.pizza.id}@maizebites\r\n`);
    expect(unfolded).toContain('DTSTAMP:20261001T160000Z\r\n');
    expect(unfolded).toContain('DTSTART:20261001T153000Z\r\n');
    expect(unfolded).toContain('DTEND:20261001T163000Z\r\n');
    expect(unfolded).toContain('SUMMARY:Pizza at the Union\r\n');
    expect(unfolded).toContain('LOCATION:Michigan Union\\, Pendleton Room\r\n');
    expect(unfolded).toContain('GEO:42.27517;-83.74151\r\n');
    expect(unfolded).toContain('DESCRIPTION:Free food: pizza\\n\\n');
    for (const line of body.split('\r\n')) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
  });

  it('404s for unpublished events and 400s for bad ids', async () => {
    expect((await request(api.app).get(`/api/events/${api.seeded.removed.id}/ics`)).status).toBe(
      404,
    );
    expect((await request(api.app).get('/api/events/nope/ics')).status).toBe(400);
  });
});
