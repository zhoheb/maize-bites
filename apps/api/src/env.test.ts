import { describe, expect, it } from 'vitest';
import { parseEnv } from './env.js';

const base = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  WEB_ORIGIN: 'http://localhost:5173',
};

describe('parseEnv', () => {
  it('applies defaults', () => {
    expect(parseEnv(base)).toEqual({
      ...base,
      NODE_ENV: 'development',
      API_PORT: 3001,
      LOG_LEVEL: 'info',
      TRUST_PROXY: 0,
      EMAIL_FROM: 'Maize Bites <onboarding@resend.dev>',
    });
  });

  it('coerces API_PORT', () => {
    expect(parseEnv({ ...base, API_PORT: '4000' }).API_PORT).toBe(4000);
  });

  it('requires DATABASE_URL and WEB_ORIGIN', () => {
    expect(() => parseEnv({ WEB_ORIGIN: base.WEB_ORIGIN })).toThrow(/DATABASE_URL/);
    expect(() => parseEnv({ DATABASE_URL: base.DATABASE_URL })).toThrow(/WEB_ORIGIN/);
  });

  it('rejects non-postgres URLs', () => {
    expect(() => parseEnv({ ...base, DATABASE_URL: 'mysql://localhost/db' })).toThrow(
      /DATABASE_URL/,
    );
  });

  it.each(['https://maizebites.app/', 'https://maizebites.app/path', 'ftp://x.com', '*'])(
    'rejects WEB_ORIGIN %j (must be a bare http(s) origin)',
    (WEB_ORIGIN) => {
      expect(() => parseEnv({ ...base, WEB_ORIGIN })).toThrow(/WEB_ORIGIN/);
    },
  );

  it('requires RESEND_API_KEY in production', () => {
    expect(() => parseEnv({ ...base, NODE_ENV: 'production' })).toThrow(/RESEND_API_KEY/);
    expect(
      parseEnv({ ...base, NODE_ENV: 'production', RESEND_API_KEY: 're_123' }).RESEND_API_KEY,
    ).toBe('re_123');
  });
});
