import { describe, expect, it } from 'vitest';
import { base64UrlToBytes, detectPushSupport } from './push';

const base = {
  hasServiceWorker: true,
  hasPushManager: true,
  hasNotification: true,
  standalone: false,
};
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
const CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140.0 Safari/537.36';

describe('detectPushSupport', () => {
  it('supports modern desktop browsers', () => {
    expect(detectPushSupport({ ...base, userAgent: CHROME })).toEqual({ kind: 'supported' });
  });

  it('asks iPhone users to add the app to their Home Screen first', () => {
    expect(detectPushSupport({ ...base, userAgent: IPHONE })).toEqual({
      kind: 'ios-needs-install',
    });
    expect(detectPushSupport({ ...base, userAgent: IPHONE, standalone: true })).toEqual({
      kind: 'supported',
    });
  });

  it('reports unsupported browsers', () => {
    expect(detectPushSupport({ ...base, hasPushManager: false, userAgent: CHROME })).toEqual({
      kind: 'unsupported',
    });
  });
});

describe('base64UrlToBytes', () => {
  it('decodes base64url without padding', () => {
    expect([...base64UrlToBytes('AQID_-8')]).toEqual([1, 2, 3, 255, 239]);
  });
});
