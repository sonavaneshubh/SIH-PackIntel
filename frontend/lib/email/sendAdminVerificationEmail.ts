const RESEND_API = 'https://api.resend.com/emails';

export interface AdminVerificationEmailPayload {
  to: string;
  reviewUrl: string;
  tokenExpiresAt: string;
  inspector: {
    fullName: string;
    email: string;
    userId: string;
    registeredAt?: string;
    employeeId?: string | null;
    designation?: string | null;
    department?: string | null;
    organization?: string | null;
    location?: string | null;
  };
}

export interface AdminVerificationEmailResult {
  delivered: boolean;
  reason?: 'not-configured' | 'error';
  message?: string;
}

const SUBJECT = 'New User Registration – PackIntel';

export function isEmailConfigured(): boolean {
  return Boolean(
    process.env.RESEND_API_KEY &&
      process.env.ADMIN_VERIFICATION_EMAIL &&
      process.env.EMAIL_FROM
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function row(label: string, value: string | null | undefined): string {
  if (!value) return '';
  return `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:600;color:#0f172a;white-space:nowrap;width:220px;">${escapeHtml(label)}</td><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#334155;">${escapeHtml(value)}</td></tr>`;
}

function formatDateTime(value: string | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-IN', { dateStyle: 'full', timeStyle: 'short' });
}

export function buildAdminVerificationEmailHtml({
  inspector,
  reviewUrl,
  tokenExpiresAt,
}: AdminVerificationEmailPayload): string {
  const registeredAt = formatDateTime(inspector.registeredAt);
  const expires = formatDateTime(tokenExpiresAt);
  const name = escapeHtml(inspector.fullName.trim() || 'A new user');
  return `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;max-width:100%;">
        <tr><td style="background:#0e7490;padding:20px 24px;color:#ffffff;">
          <div style="font-size:20px;font-weight:700;letter-spacing:.5px;">PackIntel</div>
          <div style="font-size:13px;opacity:.85;">New User Registration — Notification</div>
        </td></tr>
        <tr><td style="padding:24px;">
          <h1 style="margin:0 0 16px;font-size:18px;font-weight:700;color:#0f172a;">New User Registration</h1>
          <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.6;">Hello PackIntel Admin,</p>
          <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.6;">A new user has successfully registered on the PackIntel platform.</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;margin:0 0 20px;">
            ${row('Name', inspector.fullName)}
            ${row('Email', inspector.email)}
            ${row('User ID', inspector.userId)}
            ${row('Registration Date and Time', registeredAt)}
            ${row('Inspector ID', inspector.employeeId)}
            ${row('Designation', inspector.designation)}
            ${row('Department', inspector.department)}
            ${row('Organization', inspector.organization)}
            ${row('Location', inspector.location)}
          </table>
          <div style="background:#ecfeff;border:1px solid #a5f3fc;border-radius:8px;padding:14px 16px;margin:0 0 20px;color:#155e75;font-size:13px;">
            The user has successfully completed the registration process. A review link is valid for 24 hours (expires ${escapeHtml(expires)}). You must be signed in with an admin account to approve or reject the registration. If the link expires, request a new one from the admin Settings page.
          </div>
          <p style="margin:20px 0 12px;text-align:center;">
            <a href="${escapeHtml(reviewUrl)}" style="display:inline-block;background:#0e7490;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:15px;font-weight:600;">Review ${name}</a>
          </p>
          <p style="margin:0;color:#64748b;font-size:12px;text-align:center;">If the button does not work, copy and paste this link into your browser:<br/><span style="word-break:break-all;color:#155e75;">${escapeHtml(reviewUrl)}</span></p>
          <p style="margin:20px 0 0;color:#334155;font-size:15px;line-height:1.6;">Please review the user account from the PackIntel administration system if further action is required.</p>
          <p style="margin:20px 0 0;color:#334155;font-size:15px;line-height:1.6;">Regards,<br/>PackIntel System<br/>Automated Notification</p>
        </td></tr>
        <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:14px 24px;color:#64748b;font-size:12px;text-align:center;">
          This is an automated notification from PackIntel.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function buildAdminVerificationEmailText({
  inspector,
  reviewUrl,
  tokenExpiresAt,
}: AdminVerificationEmailPayload): string {
  const lines: string[] = [];
  lines.push('New User Registration – PackIntel');
  lines.push('');
  lines.push('Hello PackIntel Admin,');
  lines.push('');
  lines.push('A new user has successfully registered on the PackIntel platform.');
  lines.push('');
  lines.push('User Details:');
  lines.push(`  Name: ${inspector.fullName || '-'}`);
  lines.push(`  Email: ${inspector.email || '-'}`);
  lines.push(`  User ID: ${inspector.userId || '-'}`);
  const registeredAt = formatDateTime(inspector.registeredAt);
  if (registeredAt) lines.push(`  Registration Date: ${registeredAt}`);
  if (inspector.employeeId) lines.push(`  Inspector ID: ${inspector.employeeId}`);
  if (inspector.designation) lines.push(`  Designation: ${inspector.designation}`);
  if (inspector.department) lines.push(`  Department: ${inspector.department}`);
  if (inspector.organization) lines.push(`  Organization: ${inspector.organization}`);
  if (inspector.location) lines.push(`  Location: ${inspector.location}`);
  lines.push('');
  lines.push('The user has successfully completed the registration process.');
  lines.push('');
  lines.push('Please review the user account from the PackIntel administration system if further action is required.');
  lines.push('');
  const expires = formatDateTime(tokenExpiresAt);
  lines.push(`Review link: ${reviewUrl}${expires ? ` (valid for 24 hours; expires ${expires})` : ' (valid for 24 hours)'}`);
  lines.push('');
  lines.push('Regards,');
  lines.push('PackIntel System');
  lines.push('Automated Notification');
  lines.push('');
  lines.push('This is an automated notification from PackIntel.');
  return lines.join('\n');
}

export async function sendAdminVerificationEmail(
  payload: AdminVerificationEmailPayload
): Promise<AdminVerificationEmailResult> {
  if (typeof window !== 'undefined') {
    return { delivered: false, reason: 'error', message: 'Email sending is only available on the server.' };
  }

  if (!isEmailConfigured()) {
    return { delivered: false, reason: 'not-configured', message: 'Email provider not configured (RESEND_API_KEY, ADMIN_VERIFICATION_EMAIL, EMAIL_FROM).' };
  }

  const from = process.env.EMAIL_FROM || '';
  const body: Record<string, string> = {
    from,
    to: payload.to,
    subject: SUBJECT,
    html: buildAdminVerificationEmailHtml(payload),
    text: buildAdminVerificationEmailText(payload),
  };

  try {
    const response = await fetch(RESEND_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return {
        delivered: false,
        reason: 'error',
        message: `Email provider returned ${response.status}: ${text.slice(0, 300)}`,
      };
    }
    return { delivered: true };
  } catch (error) {
    return {
      delivered: false,
      reason: 'error',
      message: error instanceof Error ? error.message : 'Unknown email delivery error',
    };
  }
}