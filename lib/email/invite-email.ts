import { resend } from './index';

const BASE_URL = process.env.NEXTAUTH_URL || 'https://simplerdevelopment.com';
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'portal@simplerdevelopment.com';

interface InviteEmailData {
  recipientEmail: string;
  recipientName: string;
  companyName: string;
  inviterName: string;
  role: string;
  inviteToken: string;
}

export async function sendInviteEmail(data: InviteEmailData) {
  const inviteUrl = `${BASE_URL}/portal/invite/${data.inviteToken}`;

  const roleLabel = {
    owner: 'Owner',
    admin: 'Admin',
    member: 'Team Member',
    viewer: 'Viewer',
  }[data.role] || 'Team Member';

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;background:#ffffff;">
      <div style="padding:40px 32px;text-align:center;background:#f8fafc;border-bottom:1px solid #e2e8f0;">
        <h1 style="margin:0;font-size:24px;font-weight:700;color:#0f172a;">You've been invited</h1>
        <p style="margin:8px 0 0;font-size:15px;color:#64748b;">to join <strong>${data.companyName}</strong> on Simpler Development</p>
      </div>
      <div style="padding:32px;">
        <p style="font-size:15px;color:#334155;line-height:1.6;">
          Hi ${data.recipientName},
        </p>
        <p style="font-size:15px;color:#334155;line-height:1.6;">
          <strong>${data.inviterName}</strong> has invited you to join <strong>${data.companyName}</strong> as ${roleLabel === 'Owner' || roleLabel === 'Admin' ? 'an' : 'a'} <strong>${roleLabel}</strong>.
        </p>
        <p style="font-size:15px;color:#334155;line-height:1.6;">
          Click the button below to set up your password and access the portal.
        </p>
        <div style="text-align:center;margin:32px 0;">
          <a href="${inviteUrl}" style="display:inline-block;padding:14px 32px;background:#3b82f6;color:#ffffff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600;">
            Accept Invitation
          </a>
        </div>
        <p style="font-size:13px;color:#94a3b8;line-height:1.5;">
          This invitation expires in 7 days. If the button doesn't work, copy and paste this link into your browser:
        </p>
        <p style="font-size:13px;color:#3b82f6;word-break:break-all;">
          ${inviteUrl}
        </p>
      </div>
      <div style="padding:24px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
        <p style="margin:0;font-size:12px;color:#94a3b8;">
          Simpler Development &middot; Design, Dev & Automation
        </p>
      </div>
    </div>
  `;

  return resend.emails.send({
    from: `Simpler Development <${FROM_EMAIL}>`,
    to: data.recipientEmail,
    subject: `${data.inviterName} invited you to ${data.companyName}`,
    html,
  });
}
