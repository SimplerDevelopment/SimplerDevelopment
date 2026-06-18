import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { headers } from 'next/headers';
import { randomBytes } from 'crypto';

// CSRF state cookie settings
const STATE_COOKIE = 'gh_oauth_state';
const STATE_TTL_SECONDS = 600; // 10 minutes — enough to complete the OAuth round-trip

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  if (!clientId) return NextResponse.json({ success: false, message: 'GitHub OAuth not configured' }, { status: 500 });

  const headersList = await headers();
  const host = headersList.get('host') || 'localhost:3005';
  const protocol = headersList.get('x-forwarded-proto') || 'http';
  const origin = `${protocol}://${host}`;
  const redirectUri = `${origin}/api/portal/github/callback`;

  // Generate a cryptographically random CSRF state nonce.
  // Stored in an httpOnly, Secure, SameSite=Lax cookie so only the
  // originating browser can present it back in the callback.
  const stateNonce = randomBytes(32).toString('hex');

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'repo read:user',
    state: stateNonce,
  });

  const response = NextResponse.redirect(`https://github.com/login/oauth/authorize?${params}`);

  // Write the state nonce into a short-lived, httpOnly cookie.
  // The callback route reads and validates this before proceeding.
  response.cookies.set(STATE_COOKIE, stateNonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: STATE_TTL_SECONDS,
    path: '/api/portal/github',
  });

  return response;
}
