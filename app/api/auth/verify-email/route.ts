// GET /api/auth/verify-email?token=… — consumes the emailed verification
// token and bounces to login. Public by nature (clicked from an email).

import { NextResponse } from 'next/server';
import { verifyEmailToken } from '@/lib/signup/service';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get('token') ?? '';
  const verified = await verifyEmailToken(token);

  const dest = verified
    ? '/portal/login?verified=1&callbackUrl=%2Fportal%2Fonboarding'
    : '/portal/signup?error=verification-expired';
  return NextResponse.redirect(new URL(dest, url.origin));
}
