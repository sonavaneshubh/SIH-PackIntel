// Server-side Supabase password authentication.
//
// Both demo login methods (Inspector ID + password, and existing demo account
// email + password) resolve to a Supabase Auth email and authenticate through
// THIS single path. It uses Supabase's own password verification via the
// token/password grant; PackIntel never sees or stores the password.
//
// We deliberately call the REST endpoint instead of the JS client so no auth
// session is persisted on the server. The returned tokens are handed to the
// browser, which adopts them with supabase.auth.setSession() — the same session
// system the one-time-code flow uses.
//
// This module only runs on the server.

export interface PasswordSession {
  accessToken: string;
  refreshToken: string;
  expiresIn?: number;
}

// 'invalid_credentials' → wrong identifier/password (or unknown account)
// 'unavailable'         → the auth provider could not be reached/misconfigured
export type PasswordSignInFailure = 'invalid_credentials' | 'unavailable';

export interface PasswordSignInResult {
  session?: PasswordSession;
  failure?: PasswordSignInFailure;
}

function authUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  return raw.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
}

export async function passwordSignIn(
  email: string,
  password: string
): Promise<PasswordSignInResult> {
  const url = authUrl();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!url || !anonKey) return { failure: 'unavailable' };

  let response: Response;
  try {
    response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
      },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    return { failure: 'unavailable' };
  }

  if (!response.ok) {
    // Provider outage is an availability problem; anything else (400/401) is a
    // credential failure and is reported generically to the client.
    if (response.status >= 500) return { failure: 'unavailable' };
    return { failure: 'invalid_credentials' };
  }

  const payload = (await response.json().catch(() => null)) as
    | { access_token?: string; refresh_token?: string; expires_in?: number }
    | null;
  if (!payload?.access_token || !payload?.refresh_token) {
    return { failure: 'invalid_credentials' };
  }

  return {
    session: {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token,
      expiresIn: payload.expires_in,
    },
  };
}
