import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { googleCalendarTokens } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { google } from 'googleapis';
import { headers, cookies } from 'next/headers';
import { timingSafeEqual } from 'crypto';

const STATE_COOKIE = 'booking_google_oauth_state';

/** Constant-time comparison to prevent timing-oracle attacks on the nonce. */
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
  const host = headersList.get('host') || 'localhost:3000';
  const protocol = headersList.get('x-forwarded-proto') || 'https';
  const origin = `${protocol}://${host}`;

  const errorRedirect = () => {
    const res = NextResponse.redirect(`${origin}/portal/tools/booking?google=error`);
    res.cookies.delete(STATE_COOKIE);
    return res;
  };

  const session = await auth();
  if (!session?.user?.id) {
    return errorRedirect();
  }

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) {
    return errorRedirect();
  }

  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const stateParam = searchParams.get('state');

  if (!code) {
    return errorRedirect();
  }

  // --- CSRF state validation ---
  // The nonce minted in the auth route must match what Google echoed back.
  // Absent/forged/expired state → reject before exchanging the code.
  const cookieStore = await cookies();
  const stateCookie = cookieStore.get(STATE_COOKIE)?.value;
  if (!stateParam || !stateCookie || !safeEqual(stateParam, stateCookie)) {
    return errorRedirect();
  }
  // --- end CSRF check ---

  const redirectUri = `${origin}/api/portal/tools/booking/google/callback`;

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri,
  );

  try {
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.access_token || !tokens.refresh_token) {
      return errorRedirect();
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

    const successRes = NextResponse.redirect(`${origin}/portal/tools/booking?google=connected`);
    successRes.cookies.delete(STATE_COOKIE);
    return successRes;
  } catch {
    return errorRedirect();
  }
}
