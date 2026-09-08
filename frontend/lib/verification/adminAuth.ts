import type { SupabaseClient } from '@supabase/supabase-js';

export interface AdminCaller {
  userId: string;
  email: string;
  role: string | null;
}

interface AdminAuthResult {
  caller?: AdminCaller;
  error?: { status: number; message: string };
}

export function isConfiguredAdminEmail(email: string | null | undefined): boolean {
  const adminEmail = (process.env.ADMIN_VERIFICATION_EMAIL || '').trim().toLowerCase();
  return Boolean(adminEmail && email && email.trim().toLowerCase() === adminEmail);
}

export async function authorizeAdminCaller(
  admin: SupabaseClient,
  authorization?: string | null
): Promise<AdminAuthResult> {
  const token = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length).trim() : null;
  if (!token) {
    return { error: { status: 401, message: 'Authentication required.' } };
  }

  const { data: userData, error: tokenError } = await admin.auth.getUser(token);
  if (tokenError || !userData?.user) {
    return { error: { status: 401, message: 'Authentication required.' } };
  }

  const userId = userData.user.id;

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, email, role')
    .eq('id', userId)
    .maybeSingle();

  if (profileError || !profile) {
    return { error: { status: 403, message: 'Account profile not found.' } };
  }

  const isAdmin = profile.role === 'admin' || isConfiguredAdminEmail(profile.email);
  if (!isAdmin) {
    return { error: { status: 403, message: 'Administrator access required.' } };
  }

  return {
    caller: {
      userId,
      email: profile.email || '',
      role: profile.role,
    },
  };
}