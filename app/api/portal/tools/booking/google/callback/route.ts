import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { googleCalendarTokens } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { google } from 'googleapis';
import { headers } from 'next/headers';

export async function GET(req: Request) {
  const headersList = await headers();
  const host = headersList.get('host') || 'localhost:3000';
  const protocol = headersList.get('x-forwarded-proto') || 'https';
  const origin = `${protocol}://${host}`;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(`${origin}/portal/tools/booking?google=error`);
  }

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) {
    return NextResponse.redirect(`${origin}/portal/tools/booking?google=error`);
  }

  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(`${origin}/portal/tools/booking?google=error`);
  }
  const redirectUri = `${origin}/api/portal/tools/booking/google/callback`;

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri,
  );

  try {
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.access_token || !tokens.refresh_token) {
      return NextResponse.redirect(`${origin}/portal/tools/booking?google=error`);
    }

    const expiresAt = new Date(tokens.expiry_date || Date.now() + 3600 * 1000);

    // Upsert: update if client already has tokens, otherwise insert
    const existing = await db.select({ id: googleCalendarTokens.id })
      .from(googleCalendarTokens)
      .where(eq(googleCalendarTokens.clientId, client.id))
      .limit(1);

    if (existing.length > 0) {
      await db.update(googleCalendarTokens)
        .set({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt,
          updatedAt: new Date(),
        })
        .where(eq(googleCalendarTokens.clientId, client.id));
    } else {
      await db.insert(googleCalendarTokens).values({
        clientId: client.id,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt,
      });
    }

    return NextResponse.redirect(`${origin}/portal/tools/booking?google=connected`);
  } catch {
    return NextResponse.redirect(`${origin}/portal/tools/booking?google=error`);
  }
}
