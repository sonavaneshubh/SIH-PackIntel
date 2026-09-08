import { createClient } from '@supabase/supabase-js';

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
// Sanitize Supabase URL to ensure no trailing '/rest/v1' path breaks Auth endpoints
const supabaseUrl = rawUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export const hasServiceRole = Boolean(serviceRoleKey);

// Human-readable reason the admin (service-role) layer cannot run, or null
// when configured. Called from server API handlers so misconfiguration
// surfaces as a clear HTTP error instead of a misleading 4xx or a throw.
export function adminConfigError(): string | null {
  if (typeof window !== 'undefined') {
    return 'Supabase service-role access is only available on the server.';
  }
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const key = serviceRoleKey.trim();
  if (!url) {
    return 'NEXT_PUBLIC_SUPABASE_URL is not configured.';
  }
  if (!key) {
    return 'SUPABASE_SERVICE_ROLE_KEY is not configured. Add it to .env.local (server-side only; never as NEXT_PUBLIC_*).';
  }
  // Supabase service-role keys are JWTs: three dot-separated segments.
  if (key.split('.').length !== 3) {
    return 'SUPABASE_SERVICE_ROLE_KEY does not look like a valid Supabase JWT (expected three dot-separated segments). Copy the "service_role" key from Supabase Dashboard → Settings → API.';
  }
  return null;
}

export function getAdminSupabase() {
  if (typeof window !== 'undefined') {
    throw new Error('getAdminSupabase() must only be called on the server');
  }
  const configProblem = adminConfigError();
  if (configProblem) {
    throw new Error(configProblem);
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}