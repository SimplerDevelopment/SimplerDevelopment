import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { google } from 'googleapis';
import { headers } from 'next/headers';
import { randomBytes } from 'crypto';

// CSRF state cookie settings (mirrors the GitHub OAuth connect route)
const STATE_COOKIE = 'booking_google_oauth_state';
const STATE_TTL_SECONDS = 600; // 10 minutes — enough to complete the OAuth round-trip

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const headersList = await headers();
  const host = headersList.get('host') || 'localhost:3000';
  const protocol = headersList.get('x-forwarded-proto') || 'https';
  const origin = `${protocol}://${host}`;
  const redirectUri = `${origin}/api/portal/tools/booking/google/callback`;

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri,
  );

  // Generate a cryptographically random CSRF state nonce, stored in an
  // httpOnly, Secure, SameSite=Lax cookie so only the originating browser
  // can present it back in the callback. The callback validates it before
  // exchanging the code (per .claude/rules/auth-surface.md).
  const stateNonce = randomBytes(32).toString('hex');

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/calendar'],
    prompt: 'consent',
    state: stateNonce,
  });

  const response = NextResponse.redirect(authUrl);
  response.cookies.set(STATE_COOKIE, stateNonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: STATE_TTL_SECONDS,
    path: '/api/portal/tools/booking/google',
  });

  return response;
}
