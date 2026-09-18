// Mints a real Supabase session after PackIntel has independently verified an
// Inspector ID + one-time code.
//
// Supabase is the session/session-refresh provider, so RLS, the server
// middleware JWT check and the FastAPI bearer-token authorization keep working
// unchanged. We do not invent a parallel session system.
//
// Flow: admin.generateLink(magiclink) → hashed_token → POST /auth/v1/verify
// → { access_token, refresh_token } handed back to the browser.

import type { SupabaseClient } from '@supabase/supabase-js';

export interface MintedSession {
  accessToken: string;
  refreshToken: string;
  expiresIn?: number;
}

function authUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  return raw.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
}

export async function mintSessionForEmail(
  admin: SupabaseClient,
  email: string
): Promise<MintedSession | null> {
  const url = authUrl();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!url || !anonKey) return null;

  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (error || !data) return null;

  const tokenHash = (data as { properties?: { hashed_token?: string } }).properties?.hashed_token;
  if (!tokenHash) return null;

  const response = await fetch(`${url}/auth/v1/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
    },
    body: JSON.stringify({ type: 'magiclink', token_hash: tokenHash }),
  });
  if (!response.ok) return null;

  const payload = (await response.json().catch(() => null)) as
    | { access_token?: string; refresh_token?: string; expires_in?: number }
    | null;
  if (!payload?.access_token || !payload?.refresh_token) return null;

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresIn: payload.expires_in,
  };
}
