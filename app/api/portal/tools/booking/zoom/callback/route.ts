import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { zoomTokens } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { headers, cookies } from 'next/headers';
import { timingSafeEqual } from 'crypto';
import { exchangeZoomCode } from '@/lib/zoom';

const STATE_COOKIE = 'booking_zoom_oauth_state';

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
    const res = NextResponse.redirect(`${origin}/portal/tools/booking?zoom=error`);
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
  // The nonce minted in the auth route must match what Zoom echoed back.
  // Absent/forged/expired state → reject before exchanging the code.
  const cookieStore = await cookies();
  const stateCookie = cookieStore.get(STATE_COOKIE)?.value;
  if (!stateParam || !stateCookie || !safeEqual(stateParam, stateCookie)) {
    return errorRedirect();
  }
  // --- end CSRF check ---

  const redirectUri = `${origin}/api/portal/tools/booking/zoom/callback`;

  try {
    const tokens = await exchangeZoomCode(code, redirectUri);
    if (!tokens) {
      return errorRedirect();
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

    const successRes = NextResponse.redirect(`${origin}/portal/tools/booking?zoom=connected`);
    successRes.cookies.delete(STATE_COOKIE);
    return successRes;
  } catch {
    return errorRedirect();
  }
}
