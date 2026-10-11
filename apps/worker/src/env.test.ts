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
      CLASSIFIER_MODE: 'llm',
      LLM_MAX_CALLS_PER_RUN: 100,
      EVENT_RETENTION_DAYS: 30,
      PRUNE_INTERVAL_MINUTES: 60,
      WEB_ORIGIN: 'http://localhost:5173',
      EMAIL_FROM: 'Maize Bites <noreply@zachhoheb.dev>',
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

  it('reads CLASSIFIER_MODE, defaulting to llm', () => {
    const mode = (value?: string) =>
      parseEnv({ DATABASE_URL, ...(value === undefined ? {} : { CLASSIFIER_MODE: value }) })
        .CLASSIFIER_MODE;
    expect(mode()).toBe('llm');
    expect(mode('')).toBe('llm');
    expect(mode('llm')).toBe('llm');
    expect(mode('rules')).toBe('rules');
    expect(() => mode('RULES')).toThrow(/CLASSIFIER_MODE/);
    expect(() => mode('off')).toThrow(/CLASSIFIER_MODE/);
  });

  it('does not need an Anthropic key in rules mode, or forbid one', () => {
    expect(parseEnv({ DATABASE_URL, CLASSIFIER_MODE: 'rules' }).ANTHROPIC_API_KEY).toBeUndefined();
    expect(
      parseEnv({ DATABASE_URL, CLASSIFIER_MODE: 'rules', ANTHROPIC_API_KEY: 'sk-ant-test' })
        .CLASSIFIER_MODE,
    ).toBe('rules');
  });

  it('reads the Happening integration settings, both optional at parse time', () => {
    const env = parseEnv({
      DATABASE_URL,
      UMICH_INTEGRATION_TOKEN: 'test-token-not-real-123',
      PUBLIC_SITE_URL: 'https://maizebites.example',
    });
    expect(env.UMICH_INTEGRATION_TOKEN).toBe('test-token-not-real-123');
    expect(env.PUBLIC_SITE_URL).toBe('https://maizebites.example');

    // Missing or blank is not an error here: the worker starts and disables Happening instead.
    const blank = parseEnv({ DATABASE_URL, UMICH_INTEGRATION_TOKEN: '', PUBLIC_SITE_URL: '' });
    expect(blank.UMICH_INTEGRATION_TOKEN).toBeUndefined();
    expect(blank.PUBLIC_SITE_URL).toBeUndefined();
    expect(blank.HAPPENING_ENABLED).toBe(true);
  });

  it('rejects a malformed site URL or token', () => {
    const bad = (extra: Record<string, string>) => () => parseEnv({ DATABASE_URL, ...extra });
    expect(bad({ PUBLIC_SITE_URL: 'http://maizebites.example' })).toThrow(/PUBLIC_SITE_URL/);
    expect(bad({ PUBLIC_SITE_URL: 'https://maizebites.example/' })).toThrow(
      /must not end with a slash/,
    );
    expect(bad({ PUBLIC_SITE_URL: 'maizebites.example' })).toThrow(/PUBLIC_SITE_URL/);
    expect(bad({ UMICH_INTEGRATION_TOKEN: 'two words' })).toThrow(/UMICH_INTEGRATION_TOKEN/);
    expect(bad({ UMICH_INTEGRATION_TOKEN: 'short' })).toThrow(/UMICH_INTEGRATION_TOKEN/);
  });

  it('never repeats the token in a validation error', () => {
    const attempt = () =>
      parseEnv({ DATABASE_URL, UMICH_INTEGRATION_TOKEN: 'secret value with spaces 123' });
    expect(attempt).toThrow(/UMICH_INTEGRATION_TOKEN/);
    try {
      attempt();
    } catch (error) {
      expect(String(error)).not.toContain('secret value');
    }
  });
});
