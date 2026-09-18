import { NextRequest, NextResponse } from 'next/server';
import { getAdminSupabase, adminConfigError } from '@/lib/supabase/admin';
import { resolveAuthorizedInspector } from '@/lib/auth/authorization';
import { mintSessionForEmail } from '@/lib/auth/supabaseSession';
import { normalizeInspectorId, isValidInspectorId } from '@/lib/auth/identity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const INACTIVE = 'This inspector account is currently inactive.';
const UNAVAILABLE = 'Authentication service is temporarily unavailable. Please try again.';
const NOT_PROVISIONED =
  'The demo account is not provisioned yet. Run the seed script first from the frontend/ directory: node --env-file=.env.local scripts/seed-demo-inspector.mjs';
const NOT_DEMO =
  'This account is not a demo account. Sign in with your own Inspector ID instead.';

// One-click demo sign-in used by the "Use Demo Inspector Account" button on the
// login page. It resolves the configured, pre-authorized demo inspector from the
// profiles table (the same server-side authorization every login path uses),
// enforces access_type='demo', then mints a real Supabase session. The browser
// adopts the returned session just like the OTP / password flows.
export async function POST(_request: NextRequest) {
  const configProblem = adminConfigError();
  if (configProblem) {
    return NextResponse.json({ ok: false, error: configProblem }, { status: 500 });
  }

  const rawId = (process.env.DEMO_INSPECTOR_ID || 'DEMO-INS-001').trim();
  const inspectorId = normalizeInspectorId(rawId);
  if (!isValidInspectorId(inspectorId)) {
    return NextResponse.json({ ok: false, error: UNAVAILABLE }, { status: 500 });
  }

  const admin = getAdminSupabase();

  const lookup = await resolveAuthorizedInspector(admin, inspectorId);
  if (lookup.failure === 'unavailable') {
    return NextResponse.json({ ok: false, error: UNAVAILABLE }, { status: 503 });
  }
  if (lookup.failure === 'not_recognized') {
    return NextResponse.json({ ok: false, error: NOT_PROVISIONED }, { status: 403 });
  }
  if (lookup.failure === 'inactive' || !lookup.inspector) {
    return NextResponse.json({ ok: false, error: INACTIVE }, { status: 403 });
  }

  const inspector = lookup.inspector;
  if (inspector.accessType !== 'demo') {
    return NextResponse.json({ ok: false, error: NOT_DEMO }, { status: 403 });
  }

  const minted = await mintSessionForEmail(admin, inspector.email);
  if (!minted) {
    console.error('[demo-login] failed to mint Supabase session for %s', inspector.profileId);
    return NextResponse.json({ ok: false, error: UNAVAILABLE }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    session: {
      accessToken: minted.accessToken,
      refreshToken: minted.refreshToken,
      expiresIn: minted.expiresIn,
    },
    inspector: {
      role: inspector.role,
      name: inspector.name,
      inspectorId: inspector.inspectorId,
      accessType: inspector.accessType,
    },
  });
}