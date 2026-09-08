import { createHash, randomBytes, createHmac, timingSafeEqual } from 'node:crypto';

export const VERIFICATION_TOKEN_TTL_HOURS = 24;

const TOKEN_BYTES = 32;

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function generateVerificationToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

export function hashVerificationToken(token: string): string {
  return sha256Hex(token);
}

export function isTokenExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return true;
  const expiry = new Date(expiresAt).getTime();
  if (Number.isNaN(expiry)) return true;
  return Date.now() > expiry;
}

export function tokenExpiresAt(from = new Date()): string {
  return new Date(from.getTime() + VERIFICATION_TOKEN_TTL_HOURS * 60 * 60 * 1000).toISOString();
}

export function timingSafeCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'hex');
  const bBuf = Buffer.from(b, 'hex');
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

// Constant-time comparison helper for generic strings (padded via HMAC trick
// so length is not leaked).
export function safeEqual(a: string, b: string): boolean {
  const hmac = createHmac('sha256', 'packintel-verify');
  const ha = hmac.update(a).digest();
  const hb = hmac.update(b).digest();
  return timingSafeEqual(ha, hb);
}