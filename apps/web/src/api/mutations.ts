import { apiErrorSchema } from '@maize-bites/shared';
import type { z } from 'zod';
import { ApiRequestError } from './client';

/** JSON write to the API with the session cookie. `schema` validates the response body, if any. */
export async function sendJson<S extends z.ZodType>(
  method: 'POST' | 'PUT' | 'DELETE',
  path: string,
  body: unknown,
  schema?: S,
): Promise<z.output<S> | null> {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body ?? {}),
  });
  const json: unknown = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const parsed = apiErrorSchema.safeParse(json);
    throw parsed.success
      ? new ApiRequestError(
          res.status,
          parsed.data.error.code,
          parsed.data.error.message,
          parsed.data.error.requestId,
        )
      : new ApiRequestError(res.status, 'unknown', `Request failed (HTTP ${res.status})`, null);
  }
  return schema ? schema.parse(json) : null;
}
