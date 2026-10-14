import { describe, expect, it, vi } from 'vitest';
import {
  PAGE_VIEW_URL,
  describeChange,
  externalReferrer,
  formatCount,
  niceMax,
  pageKey,
  pageViewFor,
  prefersNoTracking,
  sendPageView,
} from './analytics';

/** jsdom's Blob has no text(); FileReader works. */
const readBlob = (blob: Blob) =>
  new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(typeof reader.result === 'string' ? reader.result : '');
    };
    reader.readAsText(blob);
  });

describe('prefersNoTracking', () => {
  it('honours Do Not Track and Global Privacy Control', () => {
    expect(prefersNoTracking({ doNotTrack: '1' })).toBe(true);
    expect(prefersNoTracking({ doNotTrack: null, globalPrivacyControl: true })).toBe(true);
    expect(prefersNoTracking({ doNotTrack: '0', globalPrivacyControl: false })).toBe(false);
    expect(prefersNoTracking({ doNotTrack: null })).toBe(false);
  });
});

describe('pageKey', () => {
  it('changes with the path or the open event, not with filters', () => {
    expect(pageKey('/', '?tab=today')).toBe(pageKey('/', '?tab=week&campus=north'));
    expect(pageKey('/', '?event=a')).not.toBe(pageKey('/', '?event=b'));
    expect(pageKey('/about', '')).not.toBe(pageKey('/', ''));
  });
});

describe('externalReferrer', () => {
  it('keeps another site’s host and drops our own', () => {
    expect(externalReferrer('https://www.reddit.com/r/uofm/comments/x', 'maizebites.app')).toBe(
      'reddit.com',
    );
    expect(externalReferrer('https://maizebites.app/about', 'maizebites.app')).toBeNull();
    expect(externalReferrer('', 'maizebites.app')).toBeNull();
  });
});

describe('pageViewFor', () => {
  it('buckets the width and skips admin pages', () => {
    expect(pageViewFor({ pathname: '/', search: '?tab=today' }, 'reddit.com', 390)).toEqual({
      path: '/?tab=today',
      referrer: 'reddit.com',
      screen: 'small',
    });
    expect(pageViewFor({ pathname: '/admin', search: '' }, null, 1400)).toBeNull();
  });
});

describe('sendPageView', () => {
  const view = { path: '/', referrer: null, screen: 'large' as const };

  it('uses sendBeacon with a JSON body', async () => {
    const sendBeacon = vi.fn(() => true);
    sendPageView(view, { sendBeacon });
    expect(sendBeacon).toHaveBeenCalledWith(PAGE_VIEW_URL, expect.any(Blob));
    const [, blob] = sendBeacon.mock.calls[0] as unknown as [string, Blob];
    expect(blob.type).toBe('application/json');
    expect(JSON.parse(await readBlob(blob))).toEqual(view);
  });

  it('falls back to a keepalive fetch without sendBeacon', () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    vi.stubGlobal('fetch', fetchMock);
    sendPageView(view, {});
    expect(fetchMock).toHaveBeenCalledWith(
      PAGE_VIEW_URL,
      expect.objectContaining({ method: 'POST', keepalive: true }),
    );
    vi.unstubAllGlobals();
  });
});

describe('dashboard formatting', () => {
  it('describes changes against the previous period', () => {
    expect(describeChange({ value: 42, previous: 40 })).toEqual({ direction: 'up', text: '+5%' });
    expect(describeChange({ value: 40, previous: 50 })).toEqual({
      direction: 'down',
      text: '−20%',
    });
    expect(describeChange({ value: 5, previous: 0 })).toEqual({ direction: 'up', text: 'new' });
    expect(describeChange({ value: 0, previous: 0 }).text).toBe('no change');
  });

  it('rounds the axis and compacts big numbers', () => {
    expect(niceMax(0)).toBe(4);
    expect(niceMax(5)).toBe(6);
    expect(niceMax(37)).toBe(40);
    expect(niceMax(120)).toBe(200);
    expect(formatCount(1284)).toBe('1,284');
    expect(formatCount(12_900)).toBe('12.9K');
    expect(formatCount(38.44)).toBe('38.4');
  });
});
