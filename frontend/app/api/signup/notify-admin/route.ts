import { NextRequest, NextResponse } from 'next/server';
import { getAdminSupabase, adminConfigError } from '@/lib/supabase/admin';
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

interface NotifyBody {
  userId?: string;
  email?: string;
}

function buildReviewUrl(request: NextRequest, token: string): string {
  const forwardedProto = request.headers.get('x-forwarded-proto') || 'http';
  const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host');
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || (forwardedHost ? `${forwardedProto}://${forwardedHost}` : 'http://localhost:3000');
  return `${baseUrl.replace(/\/+$/, '')}/admin/inspector-verification/${token}`;
}

export async function POST(request: NextRequest) {
  // Misconfiguration (e.g. a placeholder SUPABASE_SERVICE_ROLE_KEY) surfaces
  // here as a clear 500 rather than a misleading 404 later in the handler.
  const configProblem = adminConfigError();
  if (configProblem) {
    console.error('[admin-notify] Config error: %s', configProblem);
    return NextResponse.json({ ok: false, error: configProblem }, { status: 500 });
  }

  const admin = getAdminSupabase();

  let body: NotifyBody = {};
  try {
    body = (await request.json().catch(() => ({}))) as NotifyBody;
  } catch {
    body = {};
  }

  const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'Missing userId.' }, { status: 400 });
  }

  // Safe temporary diagnostics. Logs only the requested id, whether the id was
  // found in auth.users, and the public project reference the admin client
  // targets — never passwords, tokens, cookies, or keys. A project-ref
  // mismatch against the browser console log is exactly the 404 cause this
  // exposes.
  const adminProjectRef = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/^https:\/\//, '').split('.')[0] || '?';
  const keySegments = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').split('.').length;
  console.log('[admin-notify] Received userId:', userId);
  console.log('[admin-notify] Config check:', {
    adminProject: adminProjectRef,
    hasServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    serviceRoleKeySegments: keySegments,
    serviceRoleKeyValid: keySegments === 3,
    hasAdminEmail: Boolean(process.env.ADMIN_VERIFICATION_EMAIL),
    hasEmailFrom: Boolean(process.env.EMAIL_FROM),
    hasResendKey: Boolean(process.env.RESEND_API_KEY),
  });

  // The canonical email lives in auth.users (supabase.auth.signUp creates the
  // auth identity; profiles.email is only a denormalized copy). Reading it via
  // the service-role admin API keeps this route working even while the
  // profiles table is being reconciled, and never exposes the key to clients.
  const { data: authData, error: authError } = await admin.auth.admin.getUserById(userId);
  const authUser = authError ? null : authData?.user ?? null;
  console.log('[admin-notify] Auth lookup:', {
    requestedUserId: userId,
    found: !!authUser,
    authUserId: authUser?.id ?? null,
    authError: authError?.message ?? null,
    adminProject: adminProjectRef,
  });

  const profileQuery = (uid: string) =>
    admin
      .from('profiles')
      .select('id, created_at, full_name, designation, department, organization, location, inspector_employee_id, verification_status')
      .eq('id', uid)
      .maybeSingle();

  let { data: profile, error: profileError } = await profileQuery(userId);
  console.log('[admin-notify] Profile lookup:', {
    requestedUserId: userId,
    found: !!profile,
    profileId: profile?.id ?? null,
    profileError: profileError?.message ?? null,
  });

  if (profileError) {
    // A query failure here is almost always an invalid service-role key or a
    // missing migration, NOT a missing profile. Report it as a 500 so the
    // cause is visible instead of a misleading "profile not found" 404.
    console.error('[admin-notify] Profiles query failed for %s: %s', userId, profileError.message);
    return NextResponse.json(
      { ok: false, error: 'Could not verify the inspector profile. Check SUPABASE_SERVICE_ROLE_KEY and that the database migrations are applied.' },
      { status: 500 }
    );
  }

  if (!profile) {
    // The auth.users -> profiles trigger normally creates the row in the same
    // transaction as the signup, so it is already committed when this route
    // runs. If the row is missing (e.g. the account was created while the
    // trigger was not yet deployed, or the trigger silently failed), create
    // it here from whatever data we have.
    const metaStr = (v: unknown): string | null =>
      typeof v === 'string' && v.trim() ? v : null;
    const emailValue =
      authUser?.email?.trim() ||
      (typeof body.email === 'string' ? body.email.trim() : '') ||
      '';

    if (authUser) {
      // Best case: we have the full auth user identity with metadata.
      console.warn('[admin-notify] Profile row missing for %s; creating from auth identity.', userId);
      const meta = authUser.user_metadata ?? {};

      const { error: createError } = await admin.from('profiles').upsert(
        {
          id: authUser.id,
          email: emailValue || 'unknown@packintel.local',
          full_name:
            metaStr(meta.full_name) ||
            metaStr(meta.name) ||
            (authUser.email ?? '').split('@')[0] ||
            'Compliance Officer',
          role: 'inspector',
          verification_status: 'pending',
          department: metaStr(meta.department),
          designation: metaStr(meta.designation),
          employee_id: metaStr(meta.employee_id),
          phone: metaStr(meta.phone),
          avatar_url: metaStr(meta.avatar_url),
          organization: metaStr(meta.organization),
          location: metaStr(meta.location),
          inspector_employee_id: metaStr(meta.inspector_employee_id),
        },
        { onConflict: 'id', ignoreDuplicates: true }
      );

      if (createError) {
        console.error('[admin-notify] Failed to create profile from auth user for %s: %s', userId, createError.message);
      }
    } else if (emailValue) {
      // Fallback: getUserById failed but the browser sent us an email.
      // Create a minimal profile so the approval workflow can proceed.
      console.warn(
        '[admin-notify] Profile row missing for %s and auth lookup failed (error: %s); creating minimal profile from request body.',
        userId,
        authError?.message ?? 'unknown'
      );

      const { error: createError } = await admin.from('profiles').upsert(
        {
          id: userId,
          email: emailValue,
          full_name: 'Compliance Officer',
          role: 'inspector',
          verification_status: 'pending',
          is_active: true,
        },
        { onConflict: 'id', ignoreDuplicates: true }
      );

      if (createError) {
        console.error('[admin-notify] Failed to create minimal profile for %s: %s', userId, createError.message);
      }
    } else {
      console.error('[admin-notify] No auth user and no email for %s; cannot create profile.', userId);
    }

    // Re-query the profile after creation attempt.
    ({ data: profile, error: profileError } = await profileQuery(userId));
    if (profileError) {
      console.error('[admin-notify] Profile re-query failed for %s: %s', userId, profileError.message);
      return NextResponse.json(
        { ok: false, error: 'Could not verify the inspector profile. Check that SUPABASE_SERVICE_ROLE_KEY matches the project and that database migrations are applied.' },
        { status: 500 }
      );
    }
    if (!profile) {
      // Still missing after all attempts. Return 202 so the frontend doesn't
      // treat this as a signup failure — the auth user WAS created, and the
      // profile can be fixed manually or on next login.
      console.error('[admin-notify] Profile still missing for %s after all creation attempts.', userId);
      return NextResponse.json(
        { ok: true, delivered: false, warning: 'Profile could not be created. The auth user exists but the profile row is missing.' },
        { status: 202 }
      );
    }
  }

  if (profile.verification_status !== 'pending') {
    return NextResponse.json({ ok: true, skipped: 'not-pending', delivered: false });
  }

  // User-facing identity, preferring the auth identity (source of truth).
  const email =
    authUser?.email?.trim() ||
    (typeof body.email === 'string' ? body.email.trim() : '') ||
    '';
  const fullName =
    profile.full_name ||
    (typeof authUser?.user_metadata?.full_name === 'string' ? authUser.user_metadata.full_name : '') ||
    (typeof authUser?.user_metadata?.name === 'string' ? authUser.user_metadata.name : '') ||
    '';
  const registeredAt = authUser?.created_at || profile.created_at || '';

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
    .eq('id', userId);

  if (updateError) {
    return NextResponse.json({ ok: false, error: 'Failed to issue a verification link.' }, { status: 500 });
  }

  if (!isEmailConfigured()) {
    // Dev safety net: surface the would-be link so the flow stays testable
    // without throwing away the registration.
    console.warn(
      '[admin-notify] Email not configured. Review link for %s (userId %s): %s',
      email || userId,
      userId,
      buildReviewUrl(request, token)
    );
    return NextResponse.json({ ok: true, delivered: false });
  }

  const result = await sendAdminVerificationEmail({
    to: adminEmail,
    reviewUrl: buildReviewUrl(request, token),
    tokenExpiresAt: expiresAt,
    inspector: {
      fullName,
      email,
      userId,
      registeredAt,
      employeeId: profile.inspector_employee_id,
      designation: profile.designation,
      department: profile.department,
      organization: profile.organization,
      location: profile.location,
    },
  });

  if (!result.delivered) {
    console.error('[admin-notify] Email delivery failed for %s: %s', email || userId, result.message || 'unknown');
    return NextResponse.json({ ok: true, delivered: false });
  }

  return NextResponse.json({ ok: true, delivered: true });
}