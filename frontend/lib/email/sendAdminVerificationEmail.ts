const RESEND_API = 'https://api.resend.com/emails';

export interface AdminVerificationEmailPayload {
  to: string;
  reviewUrl: string;
  actionApproveUrl: string;
  actionRejectUrl: string;
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
    phone?: string | null;
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
  actionApproveUrl,
  actionRejectUrl,
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
          <div style="font-size:13px;opacity:.85;">New Inspector Registration — Action Required</div>
        </td></tr>
        <tr><td style="padding:24px;">
          <h1 style="margin:0 0 16px;font-size:18px;font-weight:700;color:#0f172a;">New Inspector Registration</h1>
          <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.6;">Hello PackIntel Admin,</p>
          <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.6;">A new inspector has registered on the PackIntel platform. Please review the details below and approve or reject the registration.</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;margin:0 0 20px;">
            ${row('Name', inspector.fullName)}
            ${row('Inspector ID', inspector.employeeId)}
            ${row('Email', inspector.email)}
            ${row('Phone', inspector.phone)}
            ${row('Designation', inspector.designation)}
            ${row('Department', inspector.department)}
            ${row('Organization', inspector.organization)}
            ${row('Location', inspector.location)}
            ${row('Registered', registeredAt)}
          </table>
          <div style="background:#ecfeff;border:1px solid #a5f3fc;border-radius:8px;padding:14px 16px;margin:0 0 24px;color:#155e75;font-size:13px;">
            These action links are valid for 24 hours (expire ${escapeHtml(expires)}). If the links expire, request a new email from the admin Settings page.
          </div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
            <tr>
              <td align="center" style="padding:0 4px;">
                <a href="${escapeHtml(actionApproveUrl)}" style="display:block;background:#16a34a;color:#ffffff;text-decoration:none;padding:14px 24px;border-radius:8px;font-size:15px;font-weight:700;text-align:center;">&#10003;&ensp;ACCEPT INSPECTOR</a>
              </td>
              <td align="center" style="padding:0 4px;">
                <a href="${escapeHtml(actionRejectUrl)}" style="display:block;background:#dc2626;color:#ffffff;text-decoration:none;padding:14px 24px;border-radius:8px;font-size:15px;font-weight:700;text-align:center;">&#10007;&ensp;REJECT INSPECTOR</a>
              </td>
            </tr>
          </table>
          <p style="margin:0 0 8px;color:#64748b;font-size:12px;text-align:center;">If the buttons do not work, copy and paste one of these links into your browser:</p>
          <p style="margin:0 0 4px;color:#64748b;font-size:12px;text-align:center;"><span style="color:#16a34a;font-weight:600;">Approve:</span> <span style="word-break:break-all;color:#155e75;">${escapeHtml(actionApproveUrl)}</span></p>
          <p style="margin:0 0 16px;color:#64748b;font-size:12px;text-align:center;"><span style="color:#dc2626;font-weight:600;">Reject:</span> <span style="word-break:break-all;color:#155e75;">${escapeHtml(actionRejectUrl)}</span></p>
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
  actionApproveUrl,
  actionRejectUrl,
  tokenExpiresAt,
}: AdminVerificationEmailPayload): string {
  const lines: string[] = [];
  lines.push('New Inspector Registration – PackIntel');
  lines.push('');
  lines.push('Hello PackIntel Admin,');
  lines.push('');
  lines.push('A new inspector has registered on the PackIntel platform. Please review the details below and approve or reject the registration.');
  lines.push('');
  lines.push('Inspector Details:');
  lines.push(`  Name: ${inspector.fullName || '-'}`);
  lines.push(`  Inspector ID: ${inspector.employeeId || '-'}`);
  lines.push(`  Email: ${inspector.email || '-'}`);
  if (inspector.phone) lines.push(`  Phone: ${inspector.phone}`);
  if (inspector.designation) lines.push(`  Designation: ${inspector.designation}`);
  if (inspector.department) lines.push(`  Department: ${inspector.department}`);
  if (inspector.organization) lines.push(`  Organization: ${inspector.organization}`);
  if (inspector.location) lines.push(`  Location: ${inspector.location}`);
  const registeredAt = formatDateTime(inspector.registeredAt);
  if (registeredAt) lines.push(`  Registered: ${registeredAt}`);
  lines.push('');
  const expires = formatDateTime(tokenExpiresAt);
  lines.push(`These action links expire in 24 hours${expires ? ` (at ${expires})` : ''}.`);
  lines.push('');
  lines.push(`APPROVE: ${actionApproveUrl}`);
  lines.push(`REJECT:  ${actionRejectUrl}`);
  lines.push('');
  lines.push('Regards,');
  lines.push('PackIntel System');
  lines.push('Automated Notification');
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