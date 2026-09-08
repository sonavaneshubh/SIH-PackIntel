import { NextRequest, NextResponse } from 'next/server';
import { getAdminSupabase, adminConfigError } from '@/lib/supabase/admin';
import { authorizeAdminCaller } from '@/lib/verification/adminAuth';
import { hashVerificationToken, isTokenExpired } from '@/lib/verification/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface VerifyBody {
  token?: string;
  profileId?: string;
  action?: 'approve' | 'reject';
  rejectionReason?: string;
}

function sanitizeProfile(row: {
  id: string;
  email: string | null;
  full_name: string | null;
  designation: string | null;
  department: string | null;
  organization: string | null;
  location: string | null;
  inspector_employee_id: string | null;
  verification_status: string | null;
}) {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    designation: row.designation,
    department: row.department,
    organization: row.organization,
    location: row.location,
    employeeId: row.inspector_employee_id,
    verificationStatus: row.verification_status,
  };
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
  const caller = authz.caller as NonNullable<typeof authz.caller>;

  let body: VerifyBody = {};
  try {
    body = (await request.json().catch(() => ({}))) as VerifyBody;
  } catch {
    body = {};
  }

  const action = body.action;
  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ ok: false, error: 'Action must be "approve" or "reject".' }, { status: 400 });
  }

  const token = typeof body.token === 'string' ? body.token.trim() : '';
  const profileId = typeof body.profileId === 'string' ? body.profileId.trim() : '';
  if (!token && !profileId) {
    return NextResponse.json({ ok: false, error: 'A verification token or profile id is required.' }, { status: 400 });
  }

  const rejectionReason =
    action === 'reject' && typeof body.rejectionReason === 'string'
      ? body.rejectionReason.trim().slice(0, 500)
      : null;
  if (action === 'reject' && !rejectionReason) {
    return NextResponse.json({ ok: false, error: 'A rejection reason is required.' }, { status: 400 });
  }

  type TargetRow = {
    id: string;
    email: string | null;
    full_name: string | null;
    designation: string | null;
    department: string | null;
    organization: string | null;
    location: string | null;
    inspector_employee_id: string | null;
    verification_status: string | null;
    verification_token_hash: string | null;
    verification_token_expires_at: string | null;
  };

  let target: TargetRow | null = null;

  if (token) {
    const tokenHash = hashVerificationToken(token);
    const { data, error } = await admin
      .from('profiles')
      .select('id, email, full_name, designation, department, organization, location, inspector_employee_id, verification_status, verification_token_hash, verification_token_expires_at')
      .eq('verification_token_hash', tokenHash)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: 'Could not resolve verification request.' }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ ok: false, error: 'This verification link is invalid.' }, { status: 400 });
    }
    if (isTokenExpired(data.verification_token_expires_at)) {
      return NextResponse.json({ ok: false, error: 'This verification link has expired.' }, { status: 410 });
    }
    target = data as TargetRow;
  } else {
    const { data, error } = await admin
      .from('profiles')
      .select('id, email, full_name, designation, department, organization, location, inspector_employee_id, verification_status, verification_token_hash, verification_token_expires_at')
      .eq('id', profileId)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ ok: false, error: 'Inspector profile not found.' }, { status: 404 });
    }
    target = data as TargetRow;
  }

  if (target.verification_status !== 'pending') {
    return NextResponse.json(
      {
        ok: false,
        error:
          target.verification_status === 'approved'
            ? 'This inspector has already been approved.'
            : 'This inspector has already been rejected.',
        verificationStatus: target.verification_status,
      },
      { status: 409 }
    );
  }

  const newStatus = action === 'approve' ? 'approved' : 'rejected';

  const { error: updateError } = await admin
    .from('profiles')
    .update({
      verification_status: newStatus,
      verified_at: new Date().toISOString(),
      verified_by: caller.userId,
      rejection_reason: rejectionReason,
      verification_token_used_at: new Date().toISOString(),
    })
    .eq('id', target.id);

  if (updateError) {
    return NextResponse.json({ ok: false, error: 'Failed to record the decision.' }, { status: 500 });
  }

  // Sync verification_status into auth.users.user_metadata so the user's JWT
  // carries the updated status. The middleware decodes the JWT to enforce
  // route-level verification_state checks; without this sync the JWT would
  // still read "pending" after approval, keeping the user locked on
  // /verification-pending until their next full re-login.
  const { error: metaError } = await admin.auth.admin.updateUserById(target.id, {
    user_metadata: {
      verification_status: newStatus,
    },
  });

  if (metaError) {
    console.error('[admin-verify] Failed to sync auth user_metadata for %s: %s', target.id, metaError.message);
  }

  return NextResponse.json({
    ok: true,
    decision: action,
    profile: sanitizeProfile(target),
    verifiedBy: caller.email,
  });
}