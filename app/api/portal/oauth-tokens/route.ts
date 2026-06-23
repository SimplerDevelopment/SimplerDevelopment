import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { oauthAccessTokens, oauthClients } from '@/lib/db/schema';
import { and, desc, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** List OAuth-issued access tokens for the active portal. Joins
 *  `oauth_clients` so the UI can show which app (Claude.ai, etc.) the token
 *  belongs to. Tokens are scoped per portal-client, so we filter by the
 *  caller's active `clients.id`. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) {
    return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });
  }

  const rows = await db
    .select({
      id: oauthAccessTokens.id,
      tokenPreview: oauthAccessTokens.tokenPreview,
      scopes: oauthAccessTokens.scopes,
      resource: oauthAccessTokens.resource,
      lastUsedAt: oauthAccessTokens.lastUsedAt,
      expiresAt: oauthAccessTokens.expiresAt,
      revokedAt: oauthAccessTokens.revokedAt,
      createdAt: oauthAccessTokens.createdAt,
      userId: oauthAccessTokens.userId,
      clientName: oauthClients.clientName,
      clientUri: oauthClients.clientUri,
    })
    .from(oauthAccessTokens)
    .innerJoin(oauthClients, eq(oauthAccessTokens.oauthClientId, oauthClients.id))
    .where(eq(oauthAccessTokens.clientId, client.id))
    .orderBy(desc(oauthAccessTokens.createdAt));

  return NextResponse.json({
    success: true,
    data: rows.map(r => ({
      ...r,
      // Surface whether *this* portal user is the one who consented.
      issuedToYou: r.userId === userId,
    })),
  });
}

/** Revoke a single OAuth access token. Tenancy-scoped to the active client. */
export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) {
    return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });
  }

  const url = new URL(req.url);
  const id = parseInt(url.searchParams.get('id') ?? '', 10);
  if (!id) return NextResponse.json({ success: false, message: 'id required' }, { status: 400 });

  await db
    .update(oauthAccessTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(oauthAccessTokens.id, id), eq(oauthAccessTokens.clientId, client.id)));

  return NextResponse.json({ success: true });
}
