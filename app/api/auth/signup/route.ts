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
    } catch (err) {
      // Account exists; the login page offers a resend. Don't fail the signup.
      console.error('[signup] verification email failed:', err);
    }

    return NextResponse.json({ success: true, data: { verificationSent: true } });
  } catch (err) {
    if (err instanceof SignupError) {
      return NextResponse.json({ success: false, message: err.message }, { status: err.status });
    }
    console.error('[signup] failed:', err);
    return NextResponse.json({ success: false, message: 'Signup failed — try again.' }, { status: 500 });
  }
}
