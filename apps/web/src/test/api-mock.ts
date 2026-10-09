import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, type ReactElement } from 'react';
import { MemoryRouter } from 'react-router';
import { vi } from 'vitest';

type Handler = (body: unknown) => { status?: number; body?: unknown };

export interface MockApi {
  /** Requests made, as "METHOD /path" with the parsed JSON body. */
  calls: { key: string; body: unknown }[];
  bodiesFor: (key: string) => unknown[];
}

/**
 * Replaces global fetch with a table of "METHOD /path" → response. An unlisted request fails the
 * test with a 500 so a missing mock is obvious. Restore with vi.unstubAllGlobals().
 */
export function mockApi(routes: Record<string, Handler | object>): MockApi {
  const calls: MockApi['calls'] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const key = `${init?.method ?? 'GET'} ${url.split('?')[0] ?? url}`;
      const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      calls.push({ key, body });
      const route = routes[key];
      if (route === undefined) {
        return Promise.resolve(
          Response.json(
            { error: { code: 'internal_error', message: `no mock for ${key}`, requestId: 't' } },
            { status: 500 },
          ),
        );
      }
      const { status = 200, body: responseBody } =
        typeof route === 'function' ? (route as Handler)(body) : { body: route };
      return Promise.resolve(
        status === 204 ? new Response(null, { status }) : Response.json(responseBody, { status }),
      );
    }),
  );
  return { calls, bodiesFor: (key) => calls.filter((c) => c.key === key).map((c) => c.body) };
}

export const apiError = (status: number, code: string, message: string) => ({
  status,
  body: { error: { code, message, requestId: 'test' } },
});

/** Renders with a fresh query cache (no retries) inside a router. */
export function renderApp(ui: ReactElement, route = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const user = userEvent.setup();
  const view = render(
    createElement(
      QueryClientProvider,
      { client },
      createElement(MemoryRouter, { initialEntries: [route] }, ui),
    ),
  );
  return { user, client, ...view };
}

export const SIGNED_IN = { user: { email: 'wolverine@umich.edu', isAdmin: false } };
export const ADMIN = { user: { email: 'admin@umich.edu', isAdmin: true } };
export const SIGNED_OUT = () => apiError(401, 'unauthorized', 'Sign in to continue');

export const BUILDINGS = {
  buildings: [
    {
      id: '0b0e8f3a-2c1d-4e5f-8a9b-1c2d3e4f5a6b',
      name: 'Duderstadt Center',
      aliases: ['The Dude', 'Media Union'],
      campus: 'north',
    },
    {
      id: '1c1e8f3a-2c1d-4e5f-8a9b-1c2d3e4f5a6c',
      name: 'Michigan League',
      aliases: ['League'],
      campus: 'central',
    },
    {
      id: '2d2e8f3a-2c1d-4e5f-8a9b-1c2d3e4f5a6d',
      name: 'Michigan Union',
      aliases: ['Union'],
      campus: 'central',
    },
  ],
};
