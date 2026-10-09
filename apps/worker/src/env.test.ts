import { describe, expect, it } from 'vitest';
import { parseEnv } from './env.js';

const DATABASE_URL = 'postgres://u:p@localhost:5432/db';

describe('parseEnv', () => {
  it('accepts a postgres DATABASE_URL and optional contact email', () => {
    expect(parseEnv({ DATABASE_URL })).toEqual({
      DATABASE_URL,
      NODE_ENV: 'development',
      LOG_LEVEL: 'info',
      HAPPENING_ENABLED: true,
      MAIZEPAGES_ENABLED: false,
      LLM_MAX_CALLS_PER_RUN: 100,
      EVENT_RETENTION_DAYS: 30,
      PRUNE_INTERVAL_MINUTES: 60,
      WEB_ORIGIN: 'http://localhost:5173',
      EMAIL_FROM: 'Maize Bites <onboarding@resend.dev>',
    });
    expect(
      parseEnv({ DATABASE_URL, INGEST_CONTACT_EMAIL: 'me@umich.edu' }).INGEST_CONTACT_EMAIL,
    ).toBe('me@umich.edu');
  });

  it('treats an empty contact email as unset', () => {
    expect(
      parseEnv({ DATABASE_URL, INGEST_CONTACT_EMAIL: '' }).INGEST_CONTACT_EMAIL,
    ).toBeUndefined();
  });

  it('rejects an invalid contact email', () => {
    expect(() => parseEnv({ DATABASE_URL, INGEST_CONTACT_EMAIL: 'not-an-email' })).toThrow(
      /INGEST_CONTACT_EMAIL/,
    );
  });

  it('reads the LLM key and per-run call cap', () => {
    const env = parseEnv({
      DATABASE_URL,
      ANTHROPIC_API_KEY: 'sk-test',
      LLM_MAX_CALLS_PER_RUN: '25',
    });
    expect(env).toMatchObject({ ANTHROPIC_API_KEY: 'sk-test', LLM_MAX_CALLS_PER_RUN: 25 });
    expect(parseEnv({ DATABASE_URL, ANTHROPIC_API_KEY: '' }).ANTHROPIC_API_KEY).toBeUndefined();
    expect(() => parseEnv({ DATABASE_URL, LLM_MAX_CALLS_PER_RUN: '-1' })).toThrow(
      /LLM_MAX_CALLS_PER_RUN/,
    );
  });

  it('requires DATABASE_URL', () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
  });

  it('reads the retention window and prune interval', () => {
    expect(
      parseEnv({ DATABASE_URL, EVENT_RETENTION_DAYS: '14', PRUNE_INTERVAL_MINUTES: '30' }),
    ).toMatchObject({ EVENT_RETENTION_DAYS: 14, PRUNE_INTERVAL_MINUTES: 30 });
    expect(() => parseEnv({ DATABASE_URL, EVENT_RETENTION_DAYS: '0' })).toThrow(
      /EVENT_RETENTION_DAYS/,
    );
    expect(() => parseEnv({ DATABASE_URL, PRUNE_INTERVAL_MINUTES: '45' })).toThrow(
      /PRUNE_INTERVAL_MINUTES/,
    );
  });

  it('reads the per-source flags, treating blank as the default', () => {
    const flags = (source: Record<string, string>) => {
      const env = parseEnv({ DATABASE_URL, ...source });
      return [env.HAPPENING_ENABLED, env.MAIZEPAGES_ENABLED];
    };
    expect(flags({})).toEqual([true, false]);
    expect(flags({ HAPPENING_ENABLED: '', MAIZEPAGES_ENABLED: '' })).toEqual([true, false]);
    expect(flags({ HAPPENING_ENABLED: 'false', MAIZEPAGES_ENABLED: 'true' })).toEqual([
      false,
      true,
    ]);
    expect(flags({ HAPPENING_ENABLED: '0', MAIZEPAGES_ENABLED: '1' })).toEqual([false, true]);
    expect(() => parseEnv({ DATABASE_URL, MAIZEPAGES_ENABLED: 'yes' })).toThrow(
      /MAIZEPAGES_ENABLED/,
    );
  });
});
