import { describe, expect, it } from 'vitest';
import {
  NOT_FOUND_PATH,
  deviceFor,
  isAdminPath,
  normalizePath,
  referrerHost,
  screenBucketFor,
} from './analytics.js';
import { addDays, localDateOf } from './time.js';

describe('normalizePath', () => {
  it.each([
    ['/', '/'],
    ['/?tab=today&campus=north', '/'],
    ['/?event=0b6f2f1e-4a0c-4c1e-9a43-6f1f9d1c2b3a', '/events/:id'],
    ['/events/0b6f2f1e-4a0c-4c1e-9a43-6f1f9d1c2b3a', '/events/:id'],
    ['/events/abc/', '/events/:id'],
    ['/about/', '/about'],
    ['/auth/verify?token=secret', '/auth/verify'],
    ['/admin', '/admin'],
    ['/events', NOT_FOUND_PATH],
    ['/wp-login.php', NOT_FOUND_PATH],
    ['/someone@umich.edu', NOT_FOUND_PATH],
  ])('%s → %s', (raw, expected) => {
    expect(normalizePath(raw)).toBe(expected);
  });

  it('never keeps a query string', () => {
    expect(normalizePath('/alerts?email=a@umich.edu')).toBe('/alerts');
  });
});

describe('isAdminPath', () => {
  it('matches /admin and below only', () => {
    expect(isAdminPath('/admin')).toBe(true);
    expect(isAdminPath('/admin/x')).toBe(true);
    expect(isAdminPath('/administrator')).toBe(false);
  });
});

describe('referrerHost', () => {
  it('keeps a lowercased hostname without www', () => {
    expect(referrerHost('WWW.Reddit.com')).toBe('reddit.com');
    expect(referrerHost('l.instagram.com')).toBe('l.instagram.com');
  });
  it('drops anything that is not a bare host', () => {
    expect(referrerHost('https://reddit.com/r/uofm')).toBeNull();
    expect(referrerHost('')).toBeNull();
    expect(referrerHost(null)).toBeNull();
  });
});

describe('screen buckets', () => {
  it('buckets widths and maps phones to mobile', () => {
    expect(screenBucketFor(390)).toBe('small');
    expect(screenBucketFor(800)).toBe('medium');
    expect(screenBucketFor(1440)).toBe('large');
    expect(deviceFor('small')).toBe('mobile');
    expect(deviceFor('medium')).toBe('desktop');
  });
});

describe('localDateOf / addDays', () => {
  it('uses the Ann Arbor calendar day', () => {
    expect(localDateOf(new Date('2026-10-15T03:30:00Z'))).toBe('2026-10-14');
    expect(localDateOf(new Date('2026-10-15T04:30:00Z'))).toBe('2026-10-15');
  });
  it('adds days across months and years', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });
});
