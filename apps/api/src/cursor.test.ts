import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { decodeCursor, encodeCursor } from './cursor.js';

describe('cursor', () => {
  it('round-trips', () => {
    const cursor = {
      startsAt: new Date('2026-10-01T16:00:00Z'),
      id: '6f1c1b7e-8d8a-4f3e-9d61-2b3c6f0e9a11',
    };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it.each(['not-base64!!', Buffer.from('{"s":"x","id":"y"}').toString('base64url'), ''])(
    'rejects %j with a ZodError',
    (value) => {
      expect(() => decodeCursor(value)).toThrow(ZodError);
    },
  );
});
