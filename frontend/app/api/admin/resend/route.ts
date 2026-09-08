import { NextRequest, NextResponse } from 'next/server';
import { getAdminSupabase, adminConfigError } from '@/lib/supabase/admin';
import { authorizeAdminCaller } from '@/lib/verification/adminAuth';
import {
  generateVerificationToken,
  hashVerificationToken,
  tokenExpiresAt,
} from '@/lib/verification/security';
import {
  sendAdminVerificationEmail,
  isEmailConfigured,
} from '@/lib/email/sendAdminVerificationEmail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ResendBody {
  profileId?: string;
}

function buildReviewUrl(request: NextRequest, token: string): string {
  const forwardedProto = request.headers.get('x-forwarded-proto') || 'http';
  const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host');
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || (forwardedHost ? `${forwardedProto}://${forwardedHost}` : 'http://localhost:3000');
  return `${baseUrl.replace(/\/+$/, '')}/admin/inspector-verification/${token}`;
}

function buildActionUrl(request: NextRequest, token: string, action: 'approve' | 'reject'): string {
  const forwardedProto = request.headers.get('x-forwarded-proto') || 'http';
  const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host');
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || (forwardedHost ? `${forwardedProto}://${forwardedHost}` : 'http://localhost:3000');
  return `${baseUrl.replace(/\/+$/, '')}/api/signup/verify-action?token=${encodeURIComponent(token)}&action=${action}`;
}

export async function POST(request: NextRequest) {
  const configProblem = adminConfigError();
  if (configProblem) {
    return NextResponse.json({ ok: false, error: configProblem }, { status: 500 });
  }

  const admin = getAdminSupabase();

  const authz = await authorizeAdminCaller(admin, request.headers.get('authorization'));
  if (authz.error) {
    return NextResponse.json({ ok: false, error: authz.error.message }, { status: authz.error.status });
  }

  let body: ResendBody = {};
  try {
    body = (await request.json().catch(() => ({}))) as ResendBody;
  } catch {
    body = {};
  }

  const profileId = typeof body.profileId === 'string' ? body.profileId.trim() : '';
  if (!profileId) {
    return NextResponse.json({ ok: false, error: 'Missing profile id.' }, { status: 400 });
  }

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, created_at, email, full_name, designation, department, organization, location, phone, inspector_employee_id, verification_status')
    .eq('id', profileId)
    .maybeSingle();

  if (profileError || !profile) {
    return NextResponse.json({ ok: false, error: 'Inspector profile not found.' }, { status: 404 });
  }

  if (profile.verification_status !== 'pending') {
    return NextResponse.json(
      { ok: false, error: 'Only pending inspector registrations can be re-notified.' },
      { status: 409 }
    );
  }

  const adminEmail = (process.env.ADMIN_VERIFICATION_EMAIL || '').trim().toLowerCase();
  if (!adminEmail) {
    return NextResponse.json(
      { ok: false, delivered: false, error: 'ADMIN_VERIFICATION_EMAIL is not configured.' },
      { status: 500 }
    );
  }

  const token = generateVerificationToken();
  const tokenHash = hashVerificationToken(token);
  const expiresAt = tokenExpiresAt();

  const { error: updateError } = await admin
    .from('profiles')
    .update({
      verification_token_hash: tokenHash,
      verification_token_expires_at: expiresAt,
      verification_token_used_at: null,
    })
    .eq('id', profileId);

  if (updateError) {
    return NextResponse.json({ ok: false, error: 'Failed to issue a new verification link.' }, { status: 500 });
  }

  if (!isEmailConfigured()) {
    const actionApprove = buildActionUrl(request, token, 'approve');
    const actionReject = buildActionUrl(request, token, 'reject');
    console.warn(
      '[admin-resend] Email not configured. Approve/Reject links for %s (profileId %s): APPROVE=%s REJECT=%s',
      profile.email,
      profileId,
      actionApprove,
      actionReject
    );
    return NextResponse.json({ ok: true, delivered: false });
  }

  const result = await sendAdminVerificationEmail({
    to: adminEmail,
    reviewUrl: buildReviewUrl(request, token),
    actionApproveUrl: buildActionUrl(request, token, 'approve'),
    actionRejectUrl: buildActionUrl(request, token, 'reject'),
    tokenExpiresAt: expiresAt,
    inspector: {
      fullName: profile.full_name || '',
      email: profile.email || '',
      userId: profile.id,
      registeredAt: profile.created_at || '',
      employeeId: profile.inspector_employee_id,
      designation: profile.designation,
      department: profile.department,
      organization: profile.organization,
      location: profile.location,
      phone: profile.phone,
    },
  });

  if (!result.delivered) {
    console.error('[admin-resend] Email delivery failed for %s: %s', profile.email, result.message || 'unknown');
    return NextResponse.json({ ok: true, delivered: false });
  }

  return NextResponse.json({ ok: true, delivered: true });
}