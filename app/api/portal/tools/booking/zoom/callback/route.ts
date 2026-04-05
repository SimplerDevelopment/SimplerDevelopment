import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { zoomTokens } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { headers } from 'next/headers';
import { exchangeZoomCode } from '@/lib/zoom';

export async function GET(req: Request) {
  const headersList = await headers();
  const host = headersList.get('host') || 'localhost:3000';
  const protocol = headersList.get('x-forwarded-proto') || 'https';
  const origin = `${protocol}://${host}`;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(`${origin}/portal/tools/booking?zoom=error`);
  }

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) {
    return NextResponse.redirect(`${origin}/portal/tools/booking?zoom=error`);
  }

  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(`${origin}/portal/tools/booking?zoom=error`);
  }

  const redirectUri = `${origin}/api/portal/tools/booking/zoom/callback`;

  try {
    const tokens = await exchangeZoomCode(code, redirectUri);
    if (!tokens) {
      return NextResponse.redirect(`${origin}/portal/tools/booking?zoom=error`);
    }

    const expiresAt = new Date(Date.now() + tokens.expiresIn * 1000);

    // Upsert: update if client already has tokens, otherwise insert
    const existing = await db.select({ id: zoomTokens.id })
      .from(zoomTokens)
      .where(eq(zoomTokens.clientId, client.id))
      .limit(1);

    if (existing.length > 0) {
      await db.update(zoomTokens)
        .set({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt,
          updatedAt: new Date(),
        })
        .where(eq(zoomTokens.clientId, client.id));
    } else {
      await db.insert(zoomTokens).values({
        clientId: client.id,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt,
      });
    }

    return NextResponse.redirect(`${origin}/portal/tools/booking?zoom=connected`);
  } catch {
    return NextResponse.redirect(`${origin}/portal/tools/booking?zoom=error`);
  }
}
