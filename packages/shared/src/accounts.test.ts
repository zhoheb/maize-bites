import { describe, expect, it } from 'vitest';
import { pushKeysSchema, toBase64Url } from './accounts.js';

const P256DH =
  'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM';
const AUTH = 'tBHItJI5svbpez7KI4CCXg';
const standard = (key: string) =>
  key.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (key.length % 4)) % 4);

describe('toBase64Url', () => {
  it('rewrites standard base64 as unpadded URL-safe base64', () => {
    expect(toBase64Url('ab+c/d==')).toBe('ab-c_d');
    expect(toBase64Url(` ${standard(P256DH)}\n`)).toBe(P256DH);
  });
});

describe('pushKeysSchema', () => {
  it('keeps URL-safe keys as they are', () => {
    expect(pushKeysSchema.parse({ p256dh: P256DH, auth: AUTH })).toEqual({
      p256dh: P256DH,
      auth: AUTH,
    });
  });

  it('normalizes keys sent in standard base64', () => {
    expect(standard(P256DH)).toMatch(/[+/=]/);
    expect(pushKeysSchema.parse({ p256dh: standard(P256DH), auth: standard(AUTH) })).toEqual({
      p256dh: P256DH,
      auth: AUTH,
    });
  });

  it('rejects keys of the wrong size or alphabet', () => {
    expect(pushKeysSchema.safeParse({ p256dh: 'k', auth: AUTH }).success).toBe(false);
    expect(pushKeysSchema.safeParse({ p256dh: P256DH, auth: `${AUTH}AA` }).success).toBe(false);
    expect(pushKeysSchema.safeParse({ p256dh: `${P256DH.slice(1)}!`, auth: AUTH }).success).toBe(
      false,
    );
  });
});
