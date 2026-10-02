import { createHash, randomBytes } from 'node:crypto';

/** 32 random bytes, base64url (43 chars). Used for magic links and session cookies. */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Tokens are stored only as SHA-256 hex. Unsalted is fine: the input is 256 random bits. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
