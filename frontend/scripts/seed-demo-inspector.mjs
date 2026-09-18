// Seeds the pre-authorized PackIntel demo inspector.
//
// This creates (idempotently):
//   * a Supabase Auth user identified by the synthetic, non-routable address
//     derived from the Inspector ID (with a demo password when configured), and
//   * the matching public.profiles row with role=inspector,
//     verification_status=approved and access_type=demo.
//
// It is NOT a government-issued identity. It exists only so the SIH demo has a
// known, DB-backed inspector that the backend authorization layer can approve.
//
// Usage (from the frontend/ directory):
//   node --env-file=.env.local scripts/seed-demo-inspector.mjs
//
// Required env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Optional env: DEMO_INSPECTOR_ID (default DEMO-INS-001),
//               DEMO_INSPECTOR_NAME (default "Demo Legal Metrology Inspector"),
//               DEMO_INSPECTOR_PASSWORD (enables Inspector ID + password login)

import { createClient } from '@supabase/supabase-js';

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const inspectorId = (process.env.DEMO_INSPECTOR_ID || 'DEMO-INS-001').trim().toUpperCase();
const fullName = process.env.DEMO_INSPECTOR_NAME || 'Demo Legal Metrology Inspector';
const demoPassword = (process.env.DEMO_INSPECTOR_PASSWORD || '').trim();
const EMAIL_DOMAIN = 'inspectors.packintel.local';

if (!url || !serviceRoleKey) {
  console.error(
    'Missing configuration. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, then run:\n' +
      '  node --env-file=.env.local scripts/seed-demo-inspector.mjs'
  );
  process.exit(1);
}

if (!/^[A-Za-z0-9](?:[A-Za-z0-9._-]{1,62})$/.test(inspectorId)) {
  console.error(`Invalid DEMO_INSPECTOR_ID "${inspectorId}". Use letters, numbers, dot, dash or underscore.`);
  process.exit(1);
}

const email = `${inspectorId.toLowerCase()}@${EMAIL_DOMAIN}`;
const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findAuthUserByEmail(targetEmail) {
  // Demo scale: a single page of users is sufficient. Paginate if the project
  // grows beyond 1000 auth users.
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  return (data?.users || []).find((u) => (u.email || '').toLowerCase() === targetEmail.toLowerCase()) || null;
}

async function main() {
  let user = await findAuthUserByEmail(email);

  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      ...(demoPassword ? { password: demoPassword } : {}),
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        role: 'inspector',
        verification_status: 'approved',
        inspector_employee_id: inspectorId,
        access_type: 'demo',
      },
    });
    if (error) throw error;
    user = data.user;
    console.log(`Created auth user for ${inspectorId}`);
  } else {
    await admin.auth.admin.updateUserById(user.id, {
      email_confirm: true,
      // Only touch the password when one is configured, so re-running the seed
      // never silently clears or resets an existing demo password.
      ...(demoPassword ? { password: demoPassword } : {}),
      user_metadata: {
        ...(user.user_metadata || {}),
        full_name: user.user_metadata?.full_name || fullName,
        role: 'inspector',
        verification_status: 'approved',
        inspector_employee_id: inspectorId,
        access_type: 'demo',
      },
    });
    console.log(`Reused existing auth user for ${inspectorId}`);
  }

  const { error: profileError } = await admin.from('profiles').upsert(
    {
      id: user.id,
      email,
      full_name: fullName,
      role: 'inspector',
      verification_status: 'approved',
      access_type: 'demo',
      inspector_employee_id: inspectorId,
      organization: 'PackIntel (demo)',
      designation: 'Legal Metrology Inspector',
      is_active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );
  if (profileError) throw profileError;

  console.log('\nPre-authorized PackIntel demo inspector is ready.');
  console.log(`  Inspector ID : ${inspectorId}`);
  console.log(`  Role         : inspector`);
  console.log(`  Status       : approved (active)`);
  console.log(`  Access type  : demo`);
  console.log(`  Password     : ${demoPassword ? 'set (Inspector ID + password login enabled)' : 'not set (one-time-code login only)'}`);
  if (!demoPassword) {
    console.log('\n  Tip: set DEMO_INSPECTOR_PASSWORD in .env.local and re-run to enable password login.');
  }
  console.log('\nThis account is a PackIntel demo record, not a government-issued identity.');
}

main().catch((err) => {
  console.error('Seeding failed:', err?.message || err);
  process.exit(1);
});
