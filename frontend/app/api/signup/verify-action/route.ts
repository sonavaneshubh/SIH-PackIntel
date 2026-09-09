import { NextRequest, NextResponse } from 'next/server';
import { getAdminSupabase, adminConfigError } from '@/lib/supabase/admin';
import { hashVerificationToken, isTokenExpired } from '@/lib/verification/security';
import { isConfiguredAdminEmail } from '@/lib/verification/adminAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function renderResultPage(title: string, message: string, success: boolean, status?: number): NextResponse {
  const icon = success ? 'check_circle' : 'error';
  const iconColor = success ? '#16a34a' : '#dc2626';
  const bgColor = success ? '#f0fdf4' : '#fef2f2';
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} – PackIntel</title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background: #f1f5f9;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }
    .card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      max-width: 480px;
      width: 100%;
      overflow: hidden;
      box-shadow: 0 4px 24px rgba(0,0,0,0.06);
    }
    .header {
      background: #0e7490;
      padding: 20px 24px;
      color: #ffffff;
    }
    .header h1 { font-size: 18px; font-weight: 700; letter-spacing: 0.5px; }
    .header p { font-size: 13px; opacity: 0.85; margin-top: 2px; }
    .body { padding: 32px 24px; text-align: center; }
    .icon-circle {
      width: 56px; height: 56px;
      border-radius: 50%;
      display: inline-flex; align-items: center; justify-content: center;
      margin-bottom: 16px;
      background: ${bgColor};
    }
    .icon-circle span { font-size: 32px; color: ${iconColor}; }
    .body h2 { font-size: 18px; font-weight: 700; color: #0f172a; margin-bottom: 8px; }
    .body p { font-size: 14px; color: #64748b; line-height: 1.6; }
    .actions { margin-top: 20px; display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; }
    .actions a {
      display: inline-block;
      padding: 10px 20px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      text-decoration: none;
      transition: opacity 0.15s ease;
    }
    .actions a.primary { background: #0e7490; color: #ffffff; }
    .actions a.secondary { background: #f1f5f9; color: #0f172a; border: 1px solid #e2e8f0; }
    .actions a:hover { opacity: 0.85; }
    .footer {
      background: #f8fafc;
      border-top: 1px solid #e2e8f0;
      padding: 14px 24px;
      text-align: center;
      font-size: 12px;
      color: #94a3b8;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>PackIntel</h1>
      <p>Inspector Verification</p>
    </div>
    <div class="body">
      <div class="icon-circle">
        <span class="material-symbols-outlined">${icon}</span>
      </div>
      <h2>${title}</h2>
      <p>${message}</p>
      <div class="actions">
        <a class="primary" href="/settings?tab=verification">Open Admin Settings</a>
        <a class="secondary" href="/dashboard">Go to Dashboard</a>
      </div>
    </div>
    <div class="footer">&copy; 2024–2026 PackIntel &bull; Department of Consumer Affairs, Government of India</div>
  </div>
</body>
</html>`;
  return new NextResponse(html, {
    status: status ?? (success ? 200 : 400),
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function ok(title: string, message: string): NextResponse {
  return renderResultPage(title, message, true);
}

function fail(title: string, message: string, status: number): NextResponse {
  return renderResultPage(title, message, false, status);
}

// Email action links (ACCEPT / REJECT) call this endpoint directly. It
// completes the approval/rejection and renders a visible result page so the
// admin sees a clear success or error message in their browser.
export async function GET(request: NextRequest) {
  const configProblem = adminConfigError();
  if (configProblem) {
    return fail('Server Configuration Error', 'Please contact your system administrator.', 500);
  }

  const { searchParams } = request.nextUrl;
  const token = (searchParams.get('token') || '').trim();
  const action = (searchParams.get('action') || '').trim();

  if (!token || token.length < 20) {
    return fail('Invalid Link', 'This verification link is invalid. Please request a new one from the admin Settings page.', 400);
  }

  if (action !== 'approve' && action !== 'reject') {
    return fail('Invalid Action', 'The requested action is not valid. Expected "approve" or "reject".', 400);
  }

  const admin = getAdminSupabase();
  const tokenHash = hashVerificationToken(token);

  const { data: profile, error: queryError } = await admin
    .from('profiles')
    .select('id, email, full_name, verification_status, verification_token_hash, verification_token_expires_at, verification_token_used_at')
    .eq('verification_token_hash', tokenHash)
    .maybeSingle();

  if (queryError) {
    console.error('[verify-action] Profile query failed: %s', queryError.message);
    return fail('Server Error', 'A server error occurred. Please try again.', 500);
  }

  if (!profile) {
    return fail('Invalid Link', 'This verification link is invalid or has already been used.', 400);
  }

  if (isTokenExpired(profile.verification_token_expires_at)) {
    return fail('Link Expired', 'This verification link has expired. Request a new one from the admin Settings page.', 410);
  }

  if (profile.verification_token_used_at) {
    return fail('Link Already Used', 'This verification link has already been used. No further action is needed.', 410);
  }

  if (profile.verification_status !== 'pending') {
    const statusText =
      profile.verification_status === 'approved'
        ? 'This inspector has already been approved.'
        : 'This inspector has already been rejected.';
    return fail('Already Reviewed', statusText, 409);
  }

  if (isConfiguredAdminEmail(profile.email)) {
    console.warn('[verify-action] Blocked self-approval attempt for admin email: %s', profile.email);
    return fail('Action Blocked', 'Administrators cannot approve or reject their own registration through this mechanism.', 400);
  }

  const newStatus = action === 'approve' ? 'approved' : 'rejected';
  const now = new Date().toISOString();

  const { error: updateError } = await admin
    .from('profiles')
    .update({
      verification_status: newStatus,
      verified_at: now,
      verified_by: null,
      rejection_reason: action === 'reject' ? 'Rejected via email action link' : null,
      verification_token_used_at: now,
    })
    .eq('id', profile.id)
    .eq('verification_status', 'pending');

  if (updateError) {
    console.error('[verify-action] Profile update failed for %s: %s', profile.id, updateError.message);
    return fail('Update Failed', 'A server error occurred while recording the decision. Please try again.', 500);
  }

  // Best-effort sync so the user's next JWT carries the updated status. A
  // failure here must not fail the approval; the profiles table remains the
  // source of truth for the pending page (which polls getMyProfile()).
  const { error: metaError } = await admin.auth.admin.updateUserById(profile.id, {
    user_metadata: { verification_status: newStatus },
  });

  if (metaError) {
    console.error('[verify-action] Auth metadata sync failed for %s: %s', profile.id, metaError.message);
  }

  if (action === 'approve') {
    return ok('Inspector Approved', `${profile.full_name || 'The inspector'} has been approved successfully. They can now sign in and access inspection tools.`);
  }

  return ok('Inspector Rejected', `${profile.full_name || 'The inspector'} has been rejected. They will see the rejection reason on sign in.`);
}