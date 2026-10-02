import { apiErrorSchema } from '@maize-bites/shared';
import type { z } from 'zod';

/** A non-2xx API response, carrying the server's error code and request id when present. */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId: string | null,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export interface RequestOptions {
  params?: Record<string, string | undefined>;
  signal?: AbortSignal;
  /** Statuses whose body is still a valid `schema` payload (e.g. health's 503). */
  acceptStatuses?: readonly number[];
  fetchFn?: typeof fetch;
}

/** GET a JSON endpoint and validate the body at the boundary. */
export async function getJson<S extends z.ZodType>(
  path: string,
  schema: S,
  {
    params = {},
    signal,
    acceptStatuses = [],
    fetchFn = (...a) => fetch(...a),
  }: RequestOptions = {},
): Promise<z.output<S>> {
  const search = new URLSearchParams(
    Object.entries(params).filter((e): e is [string, string] => e[1] !== undefined),
  ).toString();
  const res = await fetchFn(search ? `${path}?${search}` : path, {
    signal: signal ?? null,
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
  });
  const body: unknown = await res.json().catch(() => null);

  if (!res.ok && !acceptStatuses.includes(res.status)) {
    const parsed = apiErrorSchema.safeParse(body);
    throw parsed.success
      ? new ApiRequestError(
          res.status,
          parsed.data.error.code,
          parsed.data.error.message,
          parsed.data.error.requestId,
        )
      : new ApiRequestError(res.status, 'unknown', `Request failed (HTTP ${res.status})`, null);
  }
  return schema.parse(body);
}
