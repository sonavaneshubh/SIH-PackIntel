import { NextRequest, NextResponse } from 'next/server';
import { getAdminSupabase, adminConfigError } from '@/lib/supabase/admin';
import { hashVerificationToken, isTokenExpired } from '@/lib/verification/security';
import { isConfiguredAdminEmail } from '@/lib/verification/adminAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function ok(body: Record<string, unknown>): NextResponse {
  return NextResponse.json(body, { status: 200 });
}

function fail(message: string, status: number): NextResponse {
  return NextResponse.json({ success: false, error: message }, { status });
}

// Email action links (ACCEPT / REJECT) call this endpoint directly. It
// completes the approval/rejection and returns a minimal response — it never
// redirects and never renders a page, so the admin's browser is never taken to
// a review page, a custom error page, or any other route.
export async function GET(request: NextRequest) {
  const configProblem = adminConfigError();
  if (configProblem) {
    return fail('Server configuration error. Please contact your system administrator.', 500);
  }

  const { searchParams } = request.nextUrl;
  const token = (searchParams.get('token') || '').trim();
  const action = (searchParams.get('action') || '').trim();

  if (!token || token.length < 20) {
    return fail('This verification link is invalid.', 400);
  }

  if (action !== 'approve' && action !== 'reject') {
    return fail('The requested action is not valid. Expected "approve" or "reject".', 400);
  }

  const admin = getAdminSupabase();
  const tokenHash = hashVerificationToken(token);

  const { data: profile, error: queryError } = await admin
    .from('profiles')
    .select('id, email, full_name, verification_status, verification_token_hash, verification_token_expires_at, verification_token_used_at')
    .eq('verification_token_hash', tokenHash)
    .maybeSingle();

  if (queryError) {
    console.error('[verify-action] Profile query failed: %s', queryError.message);
    return fail('A server error occurred. Please try again.', 500);
  }

  if (!profile) {
    return fail('This verification link is invalid or has already been used.', 400);
  }

  if (isTokenExpired(profile.verification_token_expires_at)) {
    return fail('This verification link has expired.', 410);
  }

  if (profile.verification_token_used_at) {
    return fail('This verification link has already been used.', 410);
  }

  if (profile.verification_status !== 'pending') {
    const statusText =
      profile.verification_status === 'approved'
        ? 'This inspector has already been approved.'
        : 'This inspector has already been rejected.';
    return fail(statusText, 409);
  }

  if (isConfiguredAdminEmail(profile.email)) {
    console.warn('[verify-action] Blocked self-approval attempt for admin email: %s', profile.email);
    return fail('Administrators cannot approve or reject their own registration through this mechanism.', 400);
  }

  const newStatus = action === 'approve' ? 'approved' : 'rejected';
  const now = new Date().toISOString();

  const { error: updateError } = await admin
    .from('profiles')
    .update({
      verification_status: newStatus,
      verified_at: now,
      verified_by: null,
      rejection_reason: action === 'reject' ? 'Rejected via email action link' : null,
      verification_token_used_at: now,
    })
    .eq('id', profile.id)
    .eq('verification_status', 'pending');

  if (updateError) {
    console.error('[verify-action] Profile update failed for %s: %s', profile.id, updateError.message);
    return fail('A server error occurred while recording the decision. Please try again.', 500);
  }

  // Best-effort sync so the user's next JWT carries the updated status. A
  // failure here must not fail the approval; the profiles table remains the
  // source of truth for the pending page (which polls getMyProfile()).
  const { error: metaError } = await admin.auth.admin.updateUserById(profile.id, {
    user_metadata: { verification_status: newStatus },
  });

  if (metaError) {
    console.error('[verify-action] Auth metadata sync failed for %s: %s', profile.id, metaError.message);
  }

  if (action === 'approve') {
    return ok({ success: true, message: 'Inspector approved successfully.' });
  }

  return ok({ success: true, message: 'Inspector rejected successfully.' });
}