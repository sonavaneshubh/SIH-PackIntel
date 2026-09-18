import { NextRequest, NextResponse } from 'next/server';
import { getAdminSupabase, adminConfigError } from '@/lib/supabase/admin';
import { resolveAuthorizedInspector } from '@/lib/auth/authorization';
import { passwordSignIn } from '@/lib/auth/passwordAuth';
import { inspectorIdValidationError, looksLikeEmail, toAuthEmail } from '@/lib/auth/identity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Generic credential failure: does not reveal whether the account exists.
const INVALID = 'Invalid login credentials.';
const NOT_RECOGNIZED = 'Inspector ID not recognized or not authorized.';
const INACTIVE = 'This inspector account is currently inactive.';
const UNAVAILABLE = 'Authentication service is temporarily unavailable. Please try again.';

// Single password login endpoint for BOTH methods:
//   * Inspector ID + password  → identifier = "DEMO-INS-001"
//   * existing account + password → identifier = "user@example.com"
// The identifier is resolved to the Supabase Auth email server-side, so the
// client never needs to know the synthetic mapping. Authorization (role/status)
// is always taken from the profiles table afterwards, never from the client.
export async function POST(request: NextRequest) {
  const configProblem = adminConfigError();
  if (configProblem) {
    return NextResponse.json({ ok: false, error: UNAVAILABLE }, { status: 500 });
  }

  let body: { identifier?: string; password?: string } = {};
  try {
    body = (await request.json().catch(() => ({}))) as {
      identifier?: string;
      password?: string;
    };
  } catch {
    body = {};
  }

  const identifier = typeof body.identifier === 'string' ? body.identifier.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!identifier || !password) {
    return NextResponse.json(
      { ok: false, error: identifier ? 'Please enter your password.' : 'Please enter your Inspector ID or account.' },
      { status: 400 }
    );
  }
  if (!looksLikeEmail(identifier)) {
    const idError = inspectorIdValidationError(identifier);
    if (idError) {
      return NextResponse.json({ ok: false, error: idError }, { status: 400 });
    }
  }

  const email = toAuthEmail(identifier);
  const auth = await passwordSignIn(email, password);

  if (!auth.session) {
    if (auth.failure === 'unavailable') {
      return NextResponse.json({ ok: false, error: UNAVAILABLE }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: INVALID }, { status: 401 });
  }

  // Password is correct. Now enforce PackIntel authorization from the
  // authoritative profiles row (role + verification status).
  const admin = getAdminSupabase();
  const lookup = await resolveAuthorizedInspector(admin, identifier);
  if (lookup.failure === 'unavailable') {
    return NextResponse.json({ ok: false, error: UNAVAILABLE }, { status: 503 });
  }
  if (lookup.failure === 'not_recognized') {
    return NextResponse.json({ ok: false, error: NOT_RECOGNIZED }, { status: 403 });
  }
  if (lookup.failure === 'inactive' || !lookup.inspector) {
    return NextResponse.json({ ok: false, error: INACTIVE }, { status: 403 });
  }

  const inspector = lookup.inspector;

  return NextResponse.json({
    ok: true,
    session: {
      accessToken: auth.session.accessToken,
      refreshToken: auth.session.refreshToken,
      expiresIn: auth.session.expiresIn,
    },
    inspector: {
      role: inspector.role,
      name: inspector.name,
      inspectorId: inspector.inspectorId,
      accessType: inspector.accessType,
    },
  });
}
