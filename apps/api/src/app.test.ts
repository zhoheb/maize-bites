import { apiErrorSchema } from '@maize-bites/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WEB_ORIGIN, createTestApi, type TestApi } from './test/seed.js';

let api: TestApi;
beforeAll(async () => {
  api = await createTestApi();
});
afterAll(async () => {
  await api.handle.close().catch(() => undefined);
});

describe('security headers (helmet)', () => {
  it('sets hardening headers and hides the framework', async () => {
    const res = await request(api.app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toMatch(/max-age=/);
    expect(res.headers['content-security-policy']).toMatch(/default-src 'self'/);
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('CORS', () => {
  it('allows WEB_ORIGIN, with credentials and the request id exposed', async () => {
    const res = await request(api.app).get('/api/events').set('Origin', WEB_ORIGIN);
    expect(res.headers['access-control-allow-origin']).toBe(WEB_ORIGIN);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    expect(res.headers['access-control-expose-headers']).toBe('X-Request-Id');
  });

  it('gives other origins no CORS headers', async () => {
    const res = await request(api.app).get('/api/events').set('Origin', 'https://evil.example');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('answers preflight only for WEB_ORIGIN', async () => {
    const ok = await request(api.app)
      .options('/api/events')
      .set('Origin', WEB_ORIGIN)
      .set('Access-Control-Request-Method', 'GET');
    expect(ok.status).toBe(204);
    expect(ok.headers['access-control-allow-methods']).toBe('GET,POST,PUT,DELETE');

    const denied = await request(api.app)
      .options('/api/events')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'GET');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('request ids', () => {
  it('mints one per request and returns it in the header and in error bodies', async () => {
    const res = await request(api.app).get('/api/nope');
    const id = res.headers['x-request-id'];
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(apiErrorSchema.parse(res.body).error.requestId).toBe(id);
  });

  it('reuses a well-formed incoming X-Request-Id and replaces a malformed one', async () => {
    const reused = await request(api.app).get('/api/health').set('X-Request-Id', 'lb-abc.123');
    expect(reused.headers['x-request-id']).toBe('lb-abc.123');

    const replaced = await request(api.app)
      .get('/api/health')
      .set('X-Request-Id', 'bad id; drop table');
    expect(replaced.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('consistent error format', () => {
  it.each(['/api/nope', '/', '/events'])('404 for unknown route %s', async (path) => {
    const res = await request(api.app).get(path);
    expect(res.status).toBe(404);
    expect(apiErrorSchema.parse(res.body).error.code).toBe('not_found');
  });

  it.each([
    ['post', '/api/submissions'],
    ['post', '/api/events/6f1c1b7e-8d8a-4f3e-9d61-2b3c6f0e9a11/reports'],
    ['get', '/api/admin/review-queue'],
    ['post', '/api/admin/events/6f1c1b7e-8d8a-4f3e-9d61-2b3c6f0e9a11/override'],
    ['post', '/api/admin/submissions/6f1c1b7e-8d8a-4f3e-9d61-2b3c6f0e9a11'],
    ['get', '/api/admin/metrics'],
  ] as const)('501 for planned route %s %s', async (method, path) => {
    const res = await request(api.app)[method](path);
    expect(res.status).toBe(501);
    expect(apiErrorSchema.parse(res.body).error).toMatchObject({
      code: 'not_implemented',
      message: `${method.toUpperCase()} ${path} is not implemented yet`,
    });
  });

  it('400 for a malformed JSON body', async () => {
    const res = await request(api.app)
      .post('/api/submissions')
      .set('Content-Type', 'application/json')
      .send('{bad');
    expect(res.status).toBe(400);
    expect(apiErrorSchema.parse(res.body).error).toMatchObject({
      code: 'invalid_request',
      message: 'Malformed JSON body',
    });
  });

  it('500 without leaking internals when something unexpected fails', async () => {
    const broken = await createTestApi();
    await broken.handle.close();

    const res = await request(broken.app).get('/api/events');

    expect(res.status).toBe(500);
    expect(apiErrorSchema.parse(res.body).error).toMatchObject({
      code: 'internal_error',
      message: 'Something went wrong',
    });
    expect(JSON.stringify(res.body)).not.toMatch(/pglite|closed|stack/i);
  });
});
