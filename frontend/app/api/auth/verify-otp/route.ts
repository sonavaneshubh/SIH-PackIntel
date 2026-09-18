import { NextRequest, NextResponse } from 'next/server';
import { getAdminSupabase, adminConfigError } from '@/lib/supabase/admin';
import { resolveAuthorizedInspector } from '@/lib/auth/authorization';
import { OTP_LENGTH, OTP_MAX_ATTEMPTS, verifyOtpHash } from '@/lib/auth/otp';
import { mintSessionForEmail } from '@/lib/auth/supabaseSession';
import { inspectorIdValidationError, looksLikeEmail } from '@/lib/auth/identity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NOT_RECOGNIZED = 'Inspector ID not recognized or not authorized.';
const INACTIVE = 'This inspector account is currently inactive.';
const INVALID_CODE = 'The code is incorrect or has expired. Request a new code.';
const UNAVAILABLE = 'Authentication service is temporarily unavailable. Please try again.';

export async function POST(request: NextRequest) {
  const configProblem = adminConfigError();
  if (configProblem) {
    return NextResponse.json({ ok: false, error: UNAVAILABLE }, { status: 500 });
  }

  let body: { inspectorId?: string; otp?: string } = {};
  try {
    body = (await request.json().catch(() => ({}))) as { inspectorId?: string; otp?: string };
  } catch {
    body = {};
  }

  const identifier = typeof body.inspectorId === 'string' ? body.inspectorId.trim() : '';
  const otp = typeof body.otp === 'string' ? body.otp.trim() : '';

  if (!identifier) {
    return NextResponse.json({ ok: false, error: 'Please enter your Inspector ID.' }, { status: 400 });
  }
  if (!looksLikeEmail(identifier)) {
    const idError = inspectorIdValidationError(identifier);
    if (idError) {
      return NextResponse.json({ ok: false, error: idError }, { status: 400 });
    }
  }
  if (!new RegExp(`^\\d{${OTP_LENGTH}}$`).test(otp)) {
    return NextResponse.json(
      { ok: false, error: `Enter the ${OTP_LENGTH}-digit code.` },
      { status: 400 }
    );
  }

  const admin = getAdminSupabase();

  // Re-resolve authorization on every verification so a status change between
  // requesting and entering the code is always enforced.
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

  const { data: challenge, error: challengeError } = await admin
    .from('inspector_otp_challenges')
    .select('id, otp_hash, expires_at, attempts')
    .eq('profile_id', inspector.profileId)
    .is('consumed_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (challengeError) {
    console.error('[verify-otp] challenge lookup failed:', challengeError.message);
    return NextResponse.json({ ok: false, error: UNAVAILABLE }, { status: 503 });
  }
  if (!challenge) {
    return NextResponse.json({ ok: false, error: INVALID_CODE }, { status: 401 });
  }

  if (new Date(challenge.expires_at as string).getTime() < Date.now()) {
    await admin
      .from('inspector_otp_challenges')
      .update({ consumed_at: new Date().toISOString() })
      .eq('id', challenge.id);
    return NextResponse.json({ ok: false, error: INVALID_CODE }, { status: 401 });
  }

  const attempts = Number(challenge.attempts || 0);
  if (attempts >= OTP_MAX_ATTEMPTS) {
    await admin
      .from('inspector_otp_challenges')
      .update({ consumed_at: new Date().toISOString() })
      .eq('id', challenge.id);
    return NextResponse.json({ ok: false, error: INVALID_CODE }, { status: 401 });
  }

  if (!verifyOtpHash(String(challenge.otp_hash || ''), otp)) {
    const nextAttempts = attempts + 1;
    await admin
      .from('inspector_otp_challenges')
      .update({
        attempts: nextAttempts,
        ...(nextAttempts >= OTP_MAX_ATTEMPTS ? { consumed_at: new Date().toISOString() } : {}),
      })
      .eq('id', challenge.id);
    return NextResponse.json({ ok: false, error: INVALID_CODE }, { status: 401 });
  }

  // Single-use: burn the code before minting the session.
  await admin
    .from('inspector_otp_challenges')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', challenge.id);

  const minted = await mintSessionForEmail(admin, inspector.email);
  if (!minted) {
    console.error('[verify-otp] failed to mint Supabase session for %s', inspector.profileId);
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
