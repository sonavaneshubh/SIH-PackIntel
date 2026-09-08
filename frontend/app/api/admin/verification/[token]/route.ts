import { NextRequest, NextResponse } from 'next/server';
import { getAdminSupabase, adminConfigError } from '@/lib/supabase/admin';
import { authorizeAdminCaller } from '@/lib/verification/adminAuth';
import { hashVerificationToken, isTokenExpired } from '@/lib/verification/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const configProblem = adminConfigError();
  if (configProblem) {
    return NextResponse.json({ ok: false, error: configProblem }, { status: 500 });
  }

  const admin = getAdminSupabase();

  const authz = await authorizeAdminCaller(admin, request.headers.get('authorization'));
  if (authz.error) {
    return NextResponse.json({ ok: false, error: authz.error.message }, { status: authz.error.status });
  }

  const { token } = await context.params;
  if (!token || token.length < 20) {
    return NextResponse.json({ ok: false, error: 'Verification link is invalid.' }, { status: 400 });
  }

  const tokenHash = hashVerificationToken(token);
  const { data: profile, error } = await admin
    .from('profiles')
    .select('id, email, full_name, designation, department, organization, location, phone, inspector_employee_id, verification_status, verification_token_expires_at, verified_at, verified_by, rejection_reason')
    .eq('verification_token_hash', tokenHash)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: 'Could not resolve verification request.' }, { status: 500 });
  }
  if (!profile) {
    return NextResponse.json({ ok: false, error: 'This verification link is invalid.' }, { status: 400 });
  }

  if (isTokenExpired(profile.verification_token_expires_at)) {
    return NextResponse.json(
      { ok: false, error: 'This verification link has expired. Use the resend option to issue a new email.' },
      { status: 410 }
    );
  }

  return NextResponse.json({
    ok: true,
    profile: {
      id: profile.id,
      email: profile.email,
      fullName: profile.full_name,
      designation: profile.designation,
      department: profile.department,
      organization: profile.organization,
      location: profile.location,
      phone: profile.phone,
      employeeId: profile.inspector_employee_id,
      verificationStatus: profile.verification_status,
      tokenExpiresAt: profile.verification_token_expires_at,
    },
  });
}