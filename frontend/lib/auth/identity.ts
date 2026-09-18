// Inspector-ID identity helpers.
//
// PackIntel authenticates officers with an Inspector ID instead of an email
// address. Supabase Auth still needs an email-shaped identifier internally, so
// every Inspector ID maps deterministically to a synthetic, non-routable
// address under a reserved domain. The address is never delivered to; it exists
// only as the Auth subject key. The human-facing Inspector ID remains the
// credential the officer types and is stored in profiles.inspector_employee_id.

export const INSPECTOR_ID_EMAIL_DOMAIN = 'inspectors.packintel.local';

// Allowed Inspector ID characters. Kept to the RFC-valid email local-part set so
// the derived synthetic address never needs lossy sanitization (which could
// collide two distinct IDs onto one address).
const INSPECTOR_ID_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{1,62})$/;

// Canonical form used for storage and uniqueness (case-insensitive IDs).
export function normalizeInspectorId(raw: string): string {
  return raw.trim().toUpperCase();
}

export function isValidInspectorId(raw: string): boolean {
  return INSPECTOR_ID_PATTERN.test(raw.trim());
}

export function inspectorIdValidationError(raw: string): string | null {
  const value = raw.trim();
  if (!value) return 'Please enter your Inspector ID.';
  if (!INSPECTOR_ID_PATTERN.test(value)) {
    return 'Inspector ID must be 2–63 characters using letters, numbers, dot, dash or underscore.';
  }
  return null;
}

// An input that already contains an "@" is treated as a full email address.
// This keeps pre-existing accounts (e.g. the seeded administrator) able to sign
// in while new officers use an Inspector ID.
export function looksLikeEmail(input: string): boolean {
  return input.includes('@');
}

export function inspectorIdToEmail(inspectorId: string): string {
  return `${normalizeInspectorId(inspectorId).toLowerCase()}@${INSPECTOR_ID_EMAIL_DOMAIN}`;
}

// Resolves the Supabase Auth email for a sign-in identifier that may be either
// an Inspector ID or a full official email address.
export function toAuthEmail(identifier: string): string {
  const value = identifier.trim();
  return looksLikeEmail(value) ? value.toLowerCase() : inspectorIdToEmail(value);
}
