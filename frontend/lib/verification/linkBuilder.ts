import { NextRequest } from 'next/server';

function isLocalHost(host: string): boolean {
  const h = host.toLowerCase().replace(/:\d+$/, '');
  return h === 'localhost' || h === '::1' || h.startsWith('127.');
}

// Resolves the public base URL used to build admin email links (review page +
// accept/reject action links). On a real deployment (Vercel / Render) the
// forwarded host is the canonical public hostname, so it is preferred over
// NEXT_PUBLIC_APP_URL — this guarantees a stale `localhost` value copied from a
// local .env cannot leak into production emails and break the ACCEPT link.
export function resolveAppBaseUrl(request: NextRequest): string {
  const forwardedProto = request.headers.get('x-forwarded-proto') || 'http';
  const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host') || '';
  if (forwardedHost && !isLocalHost(forwardedHost)) {
    return `${forwardedProto}://${forwardedHost}`;
  }
  const configured = (process.env.NEXT_PUBLIC_APP_URL || '').trim();
  if (configured) {
    return configured.replace(/\/+$/, '');
  }
  return forwardedHost ? `${forwardedProto}://${forwardedHost}` : 'http://localhost:3000';
}

export function buildReviewUrl(request: NextRequest, token: string): string {
  return `${resolveAppBaseUrl(request)}/admin/inspector-verification/${token}`;
}

export function buildActionUrl(request: NextRequest, token: string, action: 'approve' | 'reject'): string {
  return `${resolveAppBaseUrl(request)}/api/signup/verify-action?token=${encodeURIComponent(token)}&action=${action}`;
}