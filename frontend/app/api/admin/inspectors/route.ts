import { NextRequest, NextResponse } from 'next/server';
import { getAdminSupabase, adminConfigError } from '@/lib/supabase/admin';
import { authorizeAdminCaller } from '@/lib/verification/adminAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Admin-only inspector directory. Reads through the service-role client so the
// listing does not depend on the self-referential "Admins can view all
// profiles" RLS policy (which can trip PostgreSQL's policy recursion guard).
export async function GET(request: NextRequest) {
  const configProblem = adminConfigError();
  if (configProblem) {
    return NextResponse.json({ ok: false, error: configProblem }, { status: 500 });
  }

  const admin = getAdminSupabase();

  const authz = await authorizeAdminCaller(admin, request.headers.get('authorization'));
  if (authz.error) {
    return NextResponse.json({ ok: false, error: authz.error.message }, { status: authz.error.status });
  }

  const { data, error } = await admin
    .from('profiles')
    .select(
      'id, full_name, email, designation, department, organization, location, phone, inspector_employee_id, employee_id, role, verification_status, created_at'
    )
    .or('role.in.(inspector),role.is.null')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    console.error('[admin-inspectors] Failed to load profiles: %s', error.message);
    return NextResponse.json({ ok: false, error: 'Failed to load inspectors.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, inspectors: data || [] });
}
