import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { googleWebsiteTokens, clientWebsites } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { createOAuth2Client } from '@/lib/google-website-oauth';
import { headers } from 'next/headers';

export async function GET(req: Request) {
  const headersList = await headers();
  const host = headersList.get('host') || 'localhost:3000';
  const protocol = headersList.get('x-forwarded-proto') || 'https';
  const origin = `${protocol}://${host}`;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(`${origin}/portal/dashboard`);
  }

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) {
    return NextResponse.redirect(`${origin}/portal/dashboard`);
  }

  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const siteId = searchParams.get('state');

  if (!code || !siteId) {
    return NextResponse.redirect(`${origin}/portal/dashboard?google=error`);
  }

  const websiteId = parseInt(siteId, 10);

  // Verify site belongs to this client
  const [site] = await db
    .select()
    .from(clientWebsites)
    .where(and(eq(clientWebsites.id, websiteId), eq(clientWebsites.clientId, client.id)))
    .limit(1);

  if (!site) {
    return NextResponse.redirect(`${origin}/portal/dashboard?google=error`);
  }

  const redirectUri = `${origin}/api/portal/google/callback`;
  const oauth2Client = createOAuth2Client(redirectUri);

  try {
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.access_token || !tokens.refresh_token) {
      return NextResponse.redirect(`${origin}/portal/websites/${websiteId}/settings?google=error`);
    }

    const expiresAt = new Date(tokens.expiry_date || Date.now() + 3600 * 1000);

    // Upsert tokens for this website
    const existing = await db
      .select({ id: googleWebsiteTokens.id })
      .from(googleWebsiteTokens)
      .where(eq(googleWebsiteTokens.websiteId, websiteId))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(googleWebsiteTokens)
        .set({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt,
          updatedAt: new Date(),
        })
        .where(eq(googleWebsiteTokens.websiteId, websiteId));
    } else {
      await db.insert(googleWebsiteTokens).values({
        websiteId,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt,
      });
    }

    return NextResponse.redirect(`${origin}/portal/websites/${websiteId}/settings?google=connected`);
  } catch {
    return NextResponse.redirect(`${origin}/portal/websites/${websiteId}/settings?google=error`);
  }
}
