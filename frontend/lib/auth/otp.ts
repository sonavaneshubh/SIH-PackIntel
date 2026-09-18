// One-time login codes for Inspector-ID authentication.
//
// The backend generates a short numeric code after confirming the Inspector ID
// belongs to an active, authorized inspector, stores only a salted hash, and
// verifies it before minting a session. Codes are single-use, expire quickly
// and are limited to a handful of attempts.
//
// Delivery: PackIntel has no SMS/email gateway in the SIH demo, so when
// `DEMO_SHOW_OTP=true` the code is returned to the caller for on-screen
// display. This flag must stay unset in any real deployment.

import { createHash, randomInt, timingSafeEqual } from 'crypto';

export const OTP_LENGTH = 6;
export const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_SECONDS = 30;

export function generateOtp(): string {
  return String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, '0');
}

function hashWithSalt(salt: string, otp: string): string {
  return createHash('sha256').update(`${salt}:${otp}`).digest('hex');
}

// Stored form is "<salt>$<hash>". The salt never leaves the server.
export function hashOtp(otp: string): string {
  const salt = createHash('sha256')
    .update(`${Date.now()}:${Math.random()}:${otp}`)
    .digest('hex')
    .slice(0, 32);
  return `${salt}$${hashWithSalt(salt, otp)}`;
}

export function verifyOtpHash(stored: string, otp: string): boolean {
  const [salt, expected] = (stored || '').split('$');
  if (!salt || !expected) return false;
  const actual = hashWithSalt(salt, otp);
  const a = Buffer.from(actual, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function shouldRevealOtp(): boolean {
  return (process.env.DEMO_SHOW_OTP || '').trim().toLowerCase() === 'true';
}
