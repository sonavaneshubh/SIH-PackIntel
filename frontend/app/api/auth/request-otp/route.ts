import { NextRequest, NextResponse } from 'next/server';
import { getAdminSupabase, adminConfigError } from '@/lib/supabase/admin';
import { resolveAuthorizedInspector } from '@/lib/auth/authorization';
import {
  generateOtp,
  hashOtp,
  OTP_TTL_MS,
  OTP_RESEND_COOLDOWN_SECONDS,
  shouldRevealOtp,
} from '@/lib/auth/otp';
import { inspectorIdValidationError, looksLikeEmail } from '@/lib/auth/identity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Deliberately generic so an unknown Inspector ID is indistinguishable from an
// ID that exists but is not an authorized inspector account.
const NOT_RECOGNIZED = 'Inspector ID not recognized or not authorized.';
const INACTIVE = 'This inspector account is currently inactive.';
const UNAVAILABLE = 'Authentication service is temporarily unavailable. Please try again.';

export async function POST(request: NextRequest) {
  const configProblem = adminConfigError();
  if (configProblem) {
    return NextResponse.json({ ok: false, error: UNAVAILABLE }, { status: 500 });
  }

  let body: { inspectorId?: string } = {};
  try {
    body = (await request.json().catch(() => ({}))) as { inspectorId?: string };
  } catch {
    body = {};
  }

  const identifier = typeof body.inspectorId === 'string' ? body.inspectorId.trim() : '';
  if (!identifier) {
    return NextResponse.json({ ok: false, error: 'Please enter your Inspector ID.' }, { status: 400 });
  }
  if (!looksLikeEmail(identifier)) {
    const idError = inspectorIdValidationError(identifier);
    if (idError) {
      return NextResponse.json({ ok: false, error: idError }, { status: 400 });
    }
  }

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

  // Simple resend throttle per inspector.
  const { data: recent } = await admin
    .from('inspector_otp_challenges')
    .select('created_at')
    .eq('profile_id', inspector.profileId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recent?.created_at) {
    const elapsed = Date.now() - new Date(recent.created_at as string).getTime();
    if (elapsed < OTP_RESEND_COOLDOWN_SECONDS * 1000) {
      const retryAfter = Math.ceil((OTP_RESEND_COOLDOWN_SECONDS * 1000 - elapsed) / 1000);
      return NextResponse.json(
        { ok: false, error: `Please wait ${retryAfter}s before requesting another code.`, retryAfterSeconds: retryAfter },
        { status: 429 }
      );
    }
  }

  // Any previously issued code becomes unusable when a new one is generated.
  await admin
    .from('inspector_otp_challenges')
    .update({ consumed_at: new Date().toISOString() })
    .eq('profile_id', inspector.profileId)
    .is('consumed_at', null);

  const otp = generateOtp();
  const { error: insertError } = await admin.from('inspector_otp_challenges').insert({
    profile_id: inspector.profileId,
    otp_hash: hashOtp(otp),
    expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
  });

  if (insertError) {
    console.error('[request-otp] failed to persist challenge:', insertError.message);
    return NextResponse.json({ ok: false, error: UNAVAILABLE }, { status: 503 });
  }

  const response: Record<string, unknown> = {
    ok: true,
    expiresInSeconds: Math.floor(OTP_TTL_MS / 1000),
    resendAfterSeconds: OTP_RESEND_COOLDOWN_SECONDS,
  };

  // Demo-only: no SMS/email gateway is configured for the SIH build, so the
  // code is surfaced to the login screen. Never enabled in a real deployment.
  if (shouldRevealOtp()) {
    response.demoOtp = otp;
  }

  return NextResponse.json(response);
}
