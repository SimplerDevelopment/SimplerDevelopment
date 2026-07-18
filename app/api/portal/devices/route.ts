/**
 * POST   /api/portal/devices  { token, platform? }  — register/refresh this
 *                                                      device's Expo push token
 * DELETE /api/portal/devices  { token }              — revoke on sign-out
 *
 * Bearer-aware (mobile) + NextAuth (web) via authorizePortal. Any signed-in
 * member may register their own device — the token rebinds to the current
 * user/client on conflict, so a reassigned device stops receiving the prior
 * user's approval pushes.
 */
import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { devicePushTokens } from '@/lib/db/schema';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';

const TOKEN_RE = /^ExponentPushToken\[.+\]$|^ExpoPushToken\[.+\]$/;

export async function POST(req: Request) {
  const authResult = await authorizePortal({ action: 'read' });
  if (isAuthError(authResult)) return authResult.response;
  const { client, userId } = authResult;

  const body = await req.json().catch(() => ({}) as { token?: unknown; platform?: unknown });
  const token = typeof body.token === 'string' ? body.token.trim() : '';
  const platform =
    body.platform === 'ios' || body.platform === 'android' ? body.platform : null;

  if (!token || !TOKEN_RE.test(token)) {
    return NextResponse.json(
      { success: false, message: 'A valid Expo push token is required' },
      { status: 400 },
    );
  }

  const now = new Date();
  await db
    .insert(devicePushTokens)
    .values({ clientId: client.id, userId, token, platform, lastSeenAt: now })
    .onConflictDoUpdate({
      target: devicePushTokens.token,
      set: { clientId: client.id, userId, platform, lastSeenAt: now, revokedAt: null },
    });

  return NextResponse.json({ success: true });
}

export async function DELETE(req: Request) {
  const authResult = await authorizePortal({ action: 'read' });
  if (isAuthError(authResult)) return authResult.response;
  const { client } = authResult;

  const body = await req.json().catch(() => ({}) as { token?: unknown });
  const token = typeof body.token === 'string' ? body.token.trim() : '';
  if (!token) {
    return NextResponse.json({ success: false, message: 'token is required' }, { status: 400 });
  }

  await db
    .update(devicePushTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(devicePushTokens.token, token), eq(devicePushTokens.clientId, client.id)));

  return NextResponse.json({ success: true });
}
