import type { EventCursor } from '@maize-bites/db';
import { z } from 'zod';

// Opaque to clients: base64url(JSON) of the last row's sort key.

const cursorPayloadSchema = z.object({
  s: z.iso.datetime({ offset: true }),
  id: z.uuid(),
});

export function encodeCursor(cursor: EventCursor): string {
  const payload: z.infer<typeof cursorPayloadSchema> = {
    s: cursor.startsAt.toISOString(),
    id: cursor.id,
  };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

/** Throws a ZodError (→ 400) for anything that isn't a cursor we issued. */
export function decodeCursor(value: string): EventCursor {
  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    json = null;
  }
  const { s, id } = z.object({ cursor: cursorPayloadSchema }).parse({ cursor: json }).cursor;
  return { startsAt: new Date(s), id };
}
