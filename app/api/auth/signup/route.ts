// POST /api/auth/signup — public self-serve registration (email+password path).
// Creates user (role 'client', unverified) + client (billingMode 'saas') and
// emails a verification link. The Google path lives in lib/auth.ts instead.

import { NextResponse } from 'next/server';
import { createSelfServeAccount, SignupError } from '@/lib/signup/service';
import { getResend } from '@/lib/email';

// Per-instance soft rate limit — enough to stop naive form spam; real abuse
// is gated by email verification + card-required checkout downstream.
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || entry.resetAt < now) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_PER_WINDOW;
}

export async function POST(req: Request) {
  const ip = (req.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim();
  if (rateLimited(ip)) {
    return NextResponse.json(
      { success: false, message: 'Too many signups from this address — try again later.' },
      { status: 429 },
    );
  }

  let body: { name?: string; email?: string; password?: string; company?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid request body.' }, { status: 400 });
  }

  if (!body.name || !body.email || !body.password) {
    return NextResponse.json({ success: false, message: 'Name, email, and password are required.' }, { status: 400 });
  }

  try {
    const { verificationToken } = await createSelfServeAccount({
      name: body.name,
      email: body.email,
      password: body.password,
      company: body.company,
    });

    const origin = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://simplerdevelopment.com';
    const verifyUrl = `${origin}/api/auth/verify-email?token=${verificationToken}`;

    // In local dev there's usually no RESEND_API_KEY, so the email silently
    // can't go out. Log the verify link to the server console so a developer
    // can click through without wiring up a provider. Never log it in
    // production (the token is a credential).
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[signup] dev verify link for ${body.email}: ${verifyUrl}`);
    }

    // Email delivery is best-effort: the account already exists, and the login
    // page offers a "resend verification" path. But we must NOT pretend the
    // email went out when it didn't — a swallowed failure leaves the user
    // stranded with no link and no signal. Report the real outcome so the UI
    // can surface a resend prompt, and log with enough structure to alert on.
    let verificationSent = false;
    try {
      const resend = getResend();
      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL ?? 'SimplerDevelopment <noreply@simplerdevelopment.com>',
        to: body.email.trim().toLowerCase(),
        subject: 'Verify your email to get started',
        html: [
          `<p>Welcome${body.name ? ` ${body.name.trim()}` : ''} — one click to activate your account:</p>`,
          `<p><a href="${verifyUrl}" style="color:#6366f1;font-weight:600;">Verify my email →</a></p>`,
          `<p style="color:#6b7280;font-size:12px;">This link expires in 24 hours. If you didn't sign up, ignore this email.</p>`,
        ].join('\n'),
      });
      verificationSent = true;
    } catch (err) {
      // Structured so log-based alerting can fire on signup email failures
      // (e.g. a missing/rotated RESEND_API_KEY in prod) instead of a bare
      // console string. Do not log the token-bearing verifyUrl in production.
      console.error(
        JSON.stringify({
          level: 'error',
          event: 'signup.verification_email_failed',
          email: body.email.trim().toLowerCase(),
          reason: err instanceof Error ? err.message : String(err),
        }),
      );
    }

    return NextResponse.json({ success: true, data: { verificationSent } });
  } catch (err) {
    if (err instanceof SignupError) {
      return NextResponse.json({ success: false, message: err.message }, { status: err.status });
    }
    console.error('[signup] failed:', err);
    return NextResponse.json({ success: false, message: 'Signup failed — try again.' }, { status: 500 });
  }
}
