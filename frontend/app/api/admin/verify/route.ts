import { NextRequest, NextResponse } from 'next/server';
import { getAdminSupabase, adminConfigError } from '@/lib/supabase/admin';
import { authorizeAdminCaller } from '@/lib/verification/adminAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AdminAction = 'approve' | 'reject' | 'suspend' | 'reactivate';
type VerificationStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

interface VerifyBody {
  profileId?: string;
  action?: AdminAction;
  rejectionReason?: string;
}

// Allowed source states for each administrator action. A transition from any
// other state is rejected so concurrent admins cannot, for example, approve a
// record that another admin just suspended.
const ALLOWED_FROM: Record<AdminAction, VerificationStatus[]> = {
  approve: ['pending', 'rejected', 'suspended'],
  reject: ['pending', 'approved', 'suspended'],
  suspend: ['approved'],
  reactivate: ['suspended'],
};

const RESULT_STATUS: Record<AdminAction, VerificationStatus> = {
  approve: 'approved',
  reject: 'rejected',
  suspend: 'suspended',
  reactivate: 'approved',
};

interface TargetRow {
  id: string;
  email: string | null;
  full_name: string | null;
  designation: string | null;
  department: string | null;
  organization: string | null;
  location: string | null;
  inspector_employee_id: string | null;
  verification_status: string | null;
}

function sanitizeProfile(row: TargetRow) {
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
  if (!action || !(action in ALLOWED_FROM)) {
    return NextResponse.json(
      { ok: false, error: 'Action must be one of approve, reject, suspend or reactivate.' },
      { status: 400 }
    );
  }

  const profileId = typeof body.profileId === 'string' ? body.profileId.trim() : '';
  if (!profileId) {
    return NextResponse.json({ ok: false, error: 'A profile id is required.' }, { status: 400 });
  }

  const rejectionReason =
    action === 'reject' && typeof body.rejectionReason === 'string'
      ? body.rejectionReason.trim().slice(0, 500)
      : null;
  if (action === 'reject' && !rejectionReason) {
    return NextResponse.json({ ok: false, error: 'A rejection reason is required.' }, { status: 400 });
  }

  const { data, error } = await admin
    .from('profiles')
    .select('id, email, full_name, designation, department, organization, location, inspector_employee_id, verification_status')
    .eq('id', profileId)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ ok: false, error: 'Inspector profile not found.' }, { status: 404 });
  }

  const target = data as TargetRow;
  const current = (target.verification_status as VerificationStatus) || 'pending';
  if (!ALLOWED_FROM[action].includes(current)) {
    return NextResponse.json(
      {
        ok: false,
        error: `Cannot ${action} an inspector whose status is "${current}".`,
        verificationStatus: current,
      },
      { status: 409 }
    );
  }

  const newStatus = RESULT_STATUS[action];

  const { error: updateError } = await admin
    .from('profiles')
    .update({
      verification_status: newStatus,
      rejection_reason: action === 'reject' ? rejectionReason : null,
      verified_at: action === 'approve' || action === 'reactivate' ? new Date().toISOString() : null,
      verified_by: caller.userId,
    })
    .eq('id', target.id);

  if (updateError) {
    return NextResponse.json({ ok: false, error: 'Failed to record the decision.' }, { status: 500 });
  }

  // Mirror the state into auth.users.user_metadata so the user's JWT carries the
  // updated status, and ban/unban the Auth user so a suspended or rejected
  // account can neither sign in again nor refresh its existing session token.
  const isActive = newStatus === 'approved';
  const { error: metaError } = await admin.auth.admin.updateUserById(target.id, {
    user_metadata: { verification_status: newStatus },
    ban_duration: isActive ? 'none' : '876000h',
  });
  if (metaError) {
    console.error('[admin-verify] Failed to sync auth user state for %s: %s', target.id, metaError.message);
  }

  return NextResponse.json({
    ok: true,
    decision: action,
    profile: { ...sanitizeProfile(target), verificationStatus: newStatus },
    verifiedBy: caller.email,
  });
}
