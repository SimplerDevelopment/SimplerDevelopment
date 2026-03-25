import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { githubConnections } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { headers } from 'next/headers';

export async function GET(req: Request) {
  const headersList = await headers();
  const host = headersList.get('host') || 'localhost:3005';
  const protocol = headersList.get('x-forwarded-proto') || 'http';
  const origin = `${protocol}://${host}`;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(`${origin}/portal/websites?github=error`);
  }

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) {
    return NextResponse.redirect(`${origin}/portal/websites?github=error`);
  }

  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(`${origin}/portal/websites?github=error`);
  }

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
      return NextResponse.redirect(`${origin}/portal/websites?github=error`);
    }

    // Fetch GitHub user info
    const userRes = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: 'application/vnd.github+json' },
    });

    const ghUser = await userRes.json();

    if (!ghUser.id || !ghUser.login) {
      return NextResponse.redirect(`${origin}/portal/websites?github=error`);
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

    return NextResponse.redirect(`${origin}/portal/websites?github=connected`);
  } catch {
    return NextResponse.redirect(`${origin}/portal/websites?github=error`);
  }
}
