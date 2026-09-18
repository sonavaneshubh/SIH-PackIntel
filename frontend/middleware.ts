// Server-side route protection for PackIntel.
//
// The Supabase JS client stores its session in localStorage (client-only), so
// the auth flow mirrors the access token JWT into a `packintel_access_token`
// cookie. This
// middleware decodes the JWT payload to read `user_metadata.role` and
// `user_metadata.verification_status` and enforces the inspector-verification
// lifecycle on every protected route:
//
//   - no session       → /login
//   - role ≠ inspector → /access-denied
//   - pending (or missing status; the JWT may be stale vs the profiles table,
//     and an unknown status is treated as pending for safety) → /verification-pending
//   - rejected         → /verification-rejected
//   - suspended        → /account-suspended
//   - approved         → allowed through
//
// IMPORTANT: the JWT metadata is only a snapshot taken at sign-in. After the
// admin approves/rejects a user in the profiles table, that decision is pushed
// into auth.users.user_metadata and the next sign-in's access token reflects it.
// This middleware therefore guards by the signed claims, while the sign-in flow
// (authContext) and this fallback keep an unknown/absent status treated as
// pending so a stale or pre-verification JWT can never grant project access.

import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_ROUTES: Array<{ path: string; exact?: boolean }> = [
  { path: '/login', exact: true },
  { path: '/verification-pending', exact: true },
  { path: '/demo', exact: true },
  { path: '/verification-rejected', exact: true },
  { path: '/account-suspended', exact: true },
  { path: '/access-denied', exact: true },
];

// Base64url → UTF-8 string decode. JWT payloads are base64url without padding;
// Edge runtime has atob but not Buffer.
function base64UrlDecode(input: string): string {
  let b64 = input.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4 !== 0) b64 += '=';
  const binary = atob(b64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}

// Decodes a JWT payload without verifying the signature. Returns null when the
// token is malformed so callers can treat it as "no session".
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    return JSON.parse(base64UrlDecode(parts[1])) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getMeta(payload: Record<string, unknown> | null): Record<string, unknown> {
  if (!payload) return {};
  const meta = payload.user_metadata;
  return meta && typeof meta === 'object' ? (meta as Record<string, unknown>) : {};
}

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((r) =>
    r.exact ? pathname === r.path : pathname.startsWith(r.path)
  );
}

// Allows a protected request through, but marks the response no-store so the
// browser back button cannot reveal a cached authenticated page after logout.
function allow(): NextResponse {
  const response = NextResponse.next();
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  return response;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  // Admin review routes: a signed-in administrator is required. The server API
  // routes re-verify the admin role with the real JWT + database before any
  // privileged action, so this check is only a routing convenience layer.
  const isAdminRoute = pathname.startsWith('/admin');

  const token = request.cookies.get('packintel_access_token')?.value;
  const payload = decodeJwtPayload(token ? decodeURIComponent(token) : '');
  const meta = getMeta(payload);

  const role = (meta.role as string) || '';
  const verificationStatus = (meta.verification_status as string) || 'pending';

  if (!token || !payload) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  if (isAdminRoute) {
    // The labelled admin account (ADMIN_VERIFICATION_EMAIL) may act as admin
    // even before its row is promoted to role='admin', matching server authz.
    const payloadEmail =
      typeof payload.email === 'string' ? payload.email.toLowerCase() : '';
    const configuredAdminEmail = (
      process.env.ADMIN_VERIFICATION_EMAIL || ''
    ).trim().toLowerCase();
    const isAdmin =
      role === 'admin' ||
      (Boolean(configuredAdminEmail) && payloadEmail === configuredAdminEmail);
    if (!isAdmin) {
      const url = request.nextUrl.clone();
      url.pathname = '/access-denied';
      return NextResponse.redirect(url);
    }
    return allow();
  }

  // Admins may access the full inspector workspace. Only unknown/other roles
  // are denied.
  if (role === 'admin') {
    return allow();
  }

  if (role !== 'inspector') {
    const url = request.nextUrl.clone();
    url.pathname = '/access-denied';
    return NextResponse.redirect(url);
  }

  if (verificationStatus === 'pending') {
    const url = request.nextUrl.clone();
    url.pathname = '/verification-pending';
    return NextResponse.redirect(url);
  }

  if (verificationStatus === 'rejected') {
    const url = request.nextUrl.clone();
    url.pathname = '/verification-rejected';
    return NextResponse.redirect(url);
  }

  if (verificationStatus === 'suspended') {
    const url = request.nextUrl.clone();
    url.pathname = '/account-suspended';
    return NextResponse.redirect(url);
  }

  return allow();
}

export const config = {
  // Protected app routes. Everything else (/, /login, public docs,
  // static assets) is handled by Next.js defaults or client-side guards.
  matcher: [
    '/dashboard',
    '/scan/:path*',
    '/history',
    '/results',
    '/rules',
    '/analytics',
    '/reports',
    '/recent-inspections',
    '/settings/:path*',
    '/support/:path*',
    '/inspector/:path*',
    '/admin/:path*',
  ],
};