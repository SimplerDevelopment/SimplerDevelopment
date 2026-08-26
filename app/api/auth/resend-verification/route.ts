// POST /api/auth/resend-verification — re-issues a verification token for an
// unverified self-serve account and re-sends the verification email.
//
// Security contract:
//   - Always returns 200 { success: true } regardless of whether the email
//     exists, is already verified, or is unknown — no account-existence oracle.
//   - Only acts when the account exists, has role='client', and is NOT yet
//     verified (emailVerifiedAt IS NULL). Verified or admin/agency accounts are
//     silently ignored.
//
// Rate-limit note:
//   Uses the shared `checkRateLimit`, which is Upstash-backed and therefore
//   GLOBAL across instances where Upstash is configured, and degrades to the
//   same per-instance in-memory counter where it is not.
//
//   This route used to keep its own in-memory Map, with a comment calling the
//   per-instance ceiling intentional because "true per-IP rate-limiting would
//   require an external store (Redis/KV)". That store now exists, so the
//   ceiling had stopped being a deliberate trade and become an unbounded one:
//   on a multi-instance host the effective limit was 3 * <instance count>,
//   which is an email-bombing vector aimed at whatever address the caller
//   names. (Not a credential-guess vector — the token is 256-bit.) AUTH79-017.

import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { sendEmail } from '@/lib/email';
import { checkRateLimit } from '@/lib/security/rate-limit';

const VERIFICATION_TTL_MS = 1000 * 60 * 60 * 24; // 24h
const WINDOW_MS = 60 * 60 * 1000; // 1 hour window
const MAX_PER_WINDOW = 3; // max resend attempts per IP+email per window

/** Keyed on IP+email so neither one alone is the whole budget: an attacker
 *  rotating IPs still can't bomb one address, and one NAT'd office can't
 *  exhaust everyone else's allowance. */
async function rateLimited(ip: string, email: string): Promise<boolean> {
  return !(await checkRateLimit(`resend-verification:${ip}::${email}`, MAX_PER_WINDOW, WINDOW_MS));
}

// Always-success response — caller cannot distinguish found/not-found.
const OK = NextResponse.json({ success: true, data: { sent: true } });

export async function POST(req: Request) {
  const ip = (req.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim();

  let body: { email?: unknown };
  try {
    body = await req.json();
  } catch {
    // Malformed body — return success to keep the oracle closed.
    return OK;
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return OK;
  }

  if (await rateLimited(ip, email)) {
    // Still 200 — the rate limit is soft abuse prevention, not a security wall.
    return OK;
  }

  // Look up an unverified client account.
  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
    })
    .from(users)
    .where(
      and(
        eq(users.email, email),
        eq(users.role, 'client'),
        isNull(users.emailVerifiedAt),
      ),
    )
    .limit(1);

  if (!user) {
    // No matching unverified account — return silently.
    return OK;
  }

  // Reissue a fresh token.
  const verificationToken = randomBytes(32).toString('hex');
  await db
    .update(users)
    .set({
      emailVerificationToken: verificationToken,
      emailVerificationExpires: new Date(Date.now() + VERIFICATION_TTL_MS),
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));

  // Send the verification email (non-fatal — same pattern as signup route).
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://simplerdevelopment.com';
  const verifyUrl = `${origin}/api/auth/verify-email?token=${verificationToken}`;

  // Dev convenience: surface the link in the server console so a developer can
  // click through without a configured email provider. Never in production —
  // the token is a credential, and the response is intentionally a no-oracle
  // constant so the client never learns whether the account exists.
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[resend-verification] dev verify link for ${user.email}: ${verifyUrl}`);
  }

  try {
    await sendEmail({
      from: process.env.RESEND_FROM_EMAIL ?? 'SimplerDevelopment <noreply@simplerdevelopment.com>',
      to: user.email,
      subject: 'Verify your email — new link',
      html: [
        `<p>Hi${user.name ? ` ${user.name.trim()}` : ''} — here is a fresh verification link:</p>`,
        `<p><a href="${verifyUrl}" style="color:#6366f1;font-weight:600;">Verify my email →</a></p>`,
        `<p style="color:#6b7280;font-size:12px;">This link expires in 24 hours. If you didn't request this, you can safely ignore it.</p>`,
      ].join('\n'),
    });
  } catch (err) {
    // Structured for log-based alerting (mirrors the signup route). The
    // client still gets the constant OK — we don't break the no-oracle
    // contract just because delivery failed.
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'resend_verification.email_failed',
        email: user.email,
        reason: err instanceof Error ? err.message : String(err),
      }),
    );
  }

  return OK;
}
