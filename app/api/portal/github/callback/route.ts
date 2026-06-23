import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { githubConnections } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { headers, cookies } from 'next/headers';
import { timingSafeEqual } from 'crypto';

const STATE_COOKIE = 'gh_oauth_state';

/** Constant-time string comparison to prevent timing-oracle attacks on the nonce. */
function safeEqual(a: string, b: string): boolean {
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    // Buffers had different lengths — definitely not equal
    return false;
  }
}

export async function GET(req: Request) {
  const headersList = await headers();
  const host = headersList.get('host') || 'localhost:3005';
  const protocol = headersList.get('x-forwarded-proto') || 'http';
  const origin = `${protocol}://${host}`;

  // Helper: redirect to error URL and clear the state cookie
  const errorRedirect = (reason?: string) => {
    console.warn('[github/callback] OAuth error:', reason ?? 'unknown');
    const res = NextResponse.redirect(`${origin}/portal/websites?github=error`);
    res.cookies.delete(STATE_COOKIE);
    return res;
  };

  const session = await auth();
  if (!session?.user?.id) return errorRedirect('no session');

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return errorRedirect('no client');

  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const stateParam = searchParams.get('state');

  if (!code) return errorRedirect('no code');

  // --- CSRF state validation ---
  // Read the nonce we stored in the connect route. If it is absent, expired,
  // or does not match what GitHub echoed back, reject — this is a CSRF attempt.
  const cookieStore = await cookies();
  const stateCookie = cookieStore.get(STATE_COOKIE)?.value;

  if (!stateParam || !stateCookie || !safeEqual(stateParam, stateCookie)) {
    return errorRedirect('csrf state mismatch');
  }
  // --- end CSRF check ---

  try {
    // Exchange code for access token
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: process.env.GITHUB_OAUTH_CLIENT_ID,
        client_secret: process.env.GITHUB_OAUTH_CLIENT_SECRET,
        code,
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      return errorRedirect('no access_token in response');
    }

    // Fetch GitHub user info
    const userRes = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: 'application/vnd.github+json' },
    });

    const ghUser = await userRes.json();

    if (!ghUser.id || !ghUser.login) {
      return errorRedirect('missing github user fields');
    }

    // Upsert GitHub connection
    const existing = await db
      .select({ id: githubConnections.id })
      .from(githubConnections)
      .where(eq(githubConnections.userId, userId))
      .limit(1);

    if (existing.length > 0) {
      await db.update(githubConnections)
        .set({
          githubUserId: ghUser.id,
          githubUsername: ghUser.login,
          accessToken: tokenData.access_token,
          scope: tokenData.scope || null,
          updatedAt: new Date(),
        })
        .where(eq(githubConnections.userId, userId));
    } else {
      await db.insert(githubConnections).values({
        userId,
        githubUserId: ghUser.id,
        githubUsername: ghUser.login,
        accessToken: tokenData.access_token,
        scope: tokenData.scope || null,
      });
    }

    // Clear the CSRF cookie on success
    const successRes = NextResponse.redirect(`${origin}/portal/websites?github=connected`);
    successRes.cookies.delete(STATE_COOKIE);
    return successRes;
  } catch (err) {
    return errorRedirect(`exception: ${String(err)}`);
  }
}
