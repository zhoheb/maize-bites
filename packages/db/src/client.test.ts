import { describe, expect, it } from 'vitest';
import { connectionOptions } from './client.js';

describe('connectionOptions', () => {
  it('closes idle connections after 30 s and retires all of them within 10 minutes', () => {
    expect(connectionOptions()).toEqual({ max: 10, idle_timeout: 30, max_lifetime: 600 });
    expect(connectionOptions(2)).toMatchObject({ max: 2, idle_timeout: 30, max_lifetime: 600 });
  });
});
