import { ingestionRuns, seedBuildings, type Database, type DbHandle } from '@maize-bites/db';
import { createTestDb } from '@maize-bites/db/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseEnv } from '../env.js';
import { createPinoLogger, toJobLogger } from '../logger.js';
import { fetchHappeningWindow } from '../sources/happening/client.js';
import {
  HAPPENING_HOST,
  createHappeningSource,
  happeningIntegrationHeader,
} from '../sources/happening/index.js';
import type { HttpOptions } from '../sources/http/client.js';
import { createMaizepagesSource } from '../sources/maizepages/index.js';
import { maizepagesIcs } from '../test/fixture.js';
import { runIngestion } from './ingest.js';
import { sourcesFromEnv } from './index.js';

const TOKEN = 'test-token-not-real-123';
const SITE = 'https://maizebites.example';
const NOW = new Date('2026-10-09T16:00:00Z');
const DATABASE_URL = 'postgres://maize:change-me@localhost:5432/maize_bites';

let handle: DbHandle;
let db: Database;
beforeEach(async () => {
  handle = await createTestDb();
  db = handle.db;
  await seedBuildings(db);
});
afterEach(async () => {
  await handle.close();
});

/** Captures everything logged, as the JSON lines the worker would write. */
function capture() {
  const lines: string[] = [];
  const logger = toJobLogger(
    createPinoLogger(
      { NODE_ENV: 'production', LOG_LEVEL: 'info' },
      { write: (line: string) => lines.push(line) },
    ),
  );
  return { logger, lines, all: () => lines.join('') };
}

describe('sourcesFromEnv and the integration header', () => {
  const env = (extra: Record<string, string>) =>
    parseEnv({
      DATABASE_URL,
      INGEST_CONTACT_EMAIL: 'me@umich.edu',
      HAPPENING_ENABLED: 'true',
      MAIZEPAGES_ENABLED: 'true',
      ...extra,
    });

  it('runs both sources when the token and site URL are set', () => {
    const { logger, all } = capture();
    const sources = sourcesFromEnv(
      db,
      env({ UMICH_INTEGRATION_TOKEN: TOKEN, PUBLIC_SITE_URL: SITE }),
      logger,
    );
    expect(sources.map((s) => s.id)).toEqual(['happening', 'maizepages']);
    expect(all()).toBe('');
  });

  it.each([
    ['the token', { PUBLIC_SITE_URL: SITE }],
    ['the site URL', { UMICH_INTEGRATION_TOKEN: TOKEN }],
    ['both', {}],
    ['a blank token', { UMICH_INTEGRATION_TOKEN: '', PUBLIC_SITE_URL: SITE }],
  ])(
    'disables Happening with one log line when %s is missing; Maize Pages still runs',
    (_name, extra) => {
      const { logger, lines, all } = capture();

      const sources = sourcesFromEnv(db, env(extra), logger);

      expect(sources.map((s) => s.id)).toEqual(['maizepages']);
      expect(lines).toHaveLength(1);
      expect(all()).toContain(
        'Happening is enabled but UMICH_INTEGRATION_TOKEN or PUBLIC_SITE_URL is not set; the Happening source is disabled',
      );
      expect(all()).not.toContain(TOKEN);
    },
  );

  it('says nothing about the token when Happening is switched off', () => {
    const { logger, all } = capture();
    const sources = sourcesFromEnv(db, env({ HAPPENING_ENABLED: 'false' }), logger);
    expect(sources.map((s) => s.id)).toEqual(['maizepages']);
    expect(all()).toBe('');
  });
});

describe('when Happening turns the header down', () => {
  it('records a clear error once, does not retry, and Maize Pages still ingests', async () => {
    const { logger, all } = capture();
    const happeningFetch = vi.fn((..._args: Parameters<typeof fetch>) =>
      Promise.resolve(new Response('', { status: 403, headers: { 'cf-mitigated': 'challenge' } })),
    );
    const sleep = vi.fn(() => Promise.resolve());
    const http: HttpOptions = {
      userAgent: 'MaizeBites/0.1 (test)',
      fetchFn: happeningFetch,
      sleep,
      logger,
      hostHeaders: { [HAPPENING_HOST]: happeningIntegrationHeader(TOKEN, SITE) },
    };
    const happening = createHappeningSource({
      fetchWindow: (from) => fetchHappeningWindow(http, { from }),
    });
    const maizepages = createMaizepagesSource({
      http: {
        userAgent: 'MaizeBites/0.1 (test)',
        fetchFn: () => Promise.resolve(new Response(maizepagesIcs)),
        logger,
      },
      logger,
      validators: { get: () => Promise.resolve(null), save: () => Promise.resolve() },
    });

    const results = await runIngestion({
      db,
      logger,
      now: () => NOW,
      sources: [happening, maizepages],
    });

    // One request, no retry, no backoff.
    expect(happeningFetch).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();

    const message =
      'fetch failed: Happening rejected the integration header; check the token (HTTP 403, Cloudflare challenge)';
    expect(results[0]).toMatchObject({
      source: 'happening',
      complete: false,
      errors: 1,
      errorMessages: [message],
    });
    expect(results[1]).toMatchObject({
      source: 'maizepages',
      complete: true,
      created: 27,
      errors: 0,
    });

    const runs = await db.select().from(ingestionRuns).orderBy(ingestionRuns.source);
    expect(runs.map((r) => [r.source, r.complete, r.errorMessages])).toEqual([
      ['happening', false, [message]],
      ['maizepages', true, []],
    ]);

    // The header went out, and nothing we logged or stored repeats the token.
    expect(happeningFetch.mock.calls[0]?.[1]?.headers).toMatchObject({
      'x-umich-integration': `${TOKEN} ${SITE}`,
    });
    expect(all()).toContain('Happening rejected the integration header');
    expect(all()).not.toContain(TOKEN);
    expect(JSON.stringify(runs)).not.toContain(TOKEN);
  });

  it('says the same for a plain 403 or 401, and leaves other failures as they were', async () => {
    const attempt = async (response: Response) => {
      const http: HttpOptions = {
        userAgent: 'MaizeBites/0.1 (test)',
        fetchFn: () => Promise.resolve(response),
        maxAttempts: 1,
        logger: { warn: vi.fn() },
      };
      const source = createHappeningSource({
        fetchWindow: (from) => fetchHappeningWindow(http, { from }),
      });
      return source.fetch(NOW).catch((e: unknown) => (e as Error).message);
    };
    expect(await attempt(new Response('', { status: 403 }))).toBe(
      'Happening rejected the integration header; check the token (HTTP 403)',
    );
    expect(await attempt(new Response('', { status: 401 }))).toMatch(
      /rejected the integration header.*HTTP 401/,
    );
    expect(await attempt(new Response('', { status: 500 }))).toMatch(/→ HTTP 500$/);
  });
});

describe('log redaction', () => {
  it('censors the integration header if request headers are ever logged', () => {
    const lines: string[] = [];
    const pino = createPinoLogger(
      { NODE_ENV: 'production', LOG_LEVEL: 'info' },
      { write: (line: string) => lines.push(line) },
    );
    const headers = { 'user-agent': 'MaizeBites/0.1', 'x-umich-integration': `${TOKEN} ${SITE}` };

    pino.info({ headers }, 'top level');
    pino.info({ req: { headers } }, 'nested');

    expect(lines.join('')).not.toContain(TOKEN);
    expect(lines.join('')).toContain('"x-umich-integration":"[redacted]"');
    expect(lines.join('')).toContain('MaizeBites/0.1');
  });
});
