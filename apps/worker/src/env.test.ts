import { describe, expect, it } from 'vitest';
import { parseEnv } from './env.js';

const DATABASE_URL = 'postgres://u:p@localhost:5432/db';

describe('parseEnv', () => {
  it('accepts a postgres DATABASE_URL and optional contact email', () => {
    expect(parseEnv({ DATABASE_URL })).toEqual({
      DATABASE_URL,
      LLM_MAX_CALLS_PER_RUN: 100,
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
});
