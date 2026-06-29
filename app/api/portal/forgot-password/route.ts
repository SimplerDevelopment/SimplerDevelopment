import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import { resend } from '@/lib/email';
import { hashToken } from '@/lib/security/token-hash';
import { checkRateLimit, getClientIp } from '@/lib/security/rate-limit';

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'noreply@simplerdevelopment.com';
const BASE_URL = process.env.NEXTAUTH_URL || 'https://simplerdevelopment.com';

export async function POST(req: Request) {
  // 5 requests per 15 minutes per IP — prevents automated reset-token harvesting
  if (!(await checkRateLimit(`${getClientIp(req)}:forgot-password`, 5, 15 * 60 * 1000))) {
    return NextResponse.json(
      { success: false, error: 'Too many requests. Please try again later.' },
      { status: 429 },
    );
  }

  const { email } = await req.json();
  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 });
  }

  // Always return success to prevent email enumeration
  const successResponse = NextResponse.json({
    success: true,
    message: 'If an account with that email exists, a password reset link has been sent.',
  });

  const [user] = await db
    .select({ id: users.id, name: users.name, active: users.active })
    .from(users)
    .where(eq(users.email, email.toLowerCase().trim()))
    .limit(1);

  if (!user || !user.active) return successResponse;

  // Generate token (64 hex chars). The raw token is emailed to the user;
  // only the SHA-256 hash is persisted so a DB compromise can't be used to
  // take over accounts. See lib/security/token-hash.ts for rationale.
  const rawToken = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await db.update(users).set({
    passwordResetToken: hashToken(rawToken),
    passwordResetExpires: expires,
  }).where(eq(users.id, user.id));

  const resetUrl = `${BASE_URL}/portal/reset-password?token=${rawToken}`;

  try {
    const result = await resend.emails.send({
      from: `Simpler Development <${FROM_EMAIL}>`,
      to: email.toLowerCase().trim(),
      subject: 'Reset your password — Simpler Development',
      html: `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8" /></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="padding:32px 40px;">
              <h1 style="margin:0 0 16px;font-size:24px;color:#111;">Reset your password</h1>
              <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#333;">
                Hi${user.name ? ` ${user.name}` : ''},
              </p>
              <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#333;">
                We received a request to reset your password for the Simpler Development portal. Click the button below to set a new password.
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px;">
                <tr>
                  <td style="border-radius:6px;background:#2563eb;">
                    <a href="${resetUrl}" style="display:inline-block;padding:12px 24px;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;">
                      Reset Password
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;font-size:14px;color:#666;">
                This link expires in 1 hour. If you didn't request this, you can safely ignore this email.
              </p>
              <p style="margin:0;font-size:12px;color:#999;word-break:break-all;">
                ${resetUrl}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 40px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">Simpler Development</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
    });
    if (result.error) {
      console.error('[portal] Resend error for password reset:', JSON.stringify(result.error));
    } else {
      console.log('[portal] Password reset email sent to', email.toLowerCase().trim(), 'messageId:', result.data?.id);
    }
  } catch (err) {
    console.error('[portal] Failed to send password reset email:', err);
  }

  return successResponse;
}
