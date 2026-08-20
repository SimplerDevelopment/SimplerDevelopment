import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { oauthAccessTokens, oauthClients } from '@/lib/db/schema';
import { and, desc, eq } from 'drizzle-orm';
import { getPortalClient, getPortalRole } from '@/lib/portal-client';

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

/** Revoke a single OAuth access token.
 *
 *  An OAuth grant is a PERSONAL consent artifact: the member signed in as
 *  themselves and approved the app for their own account. So a plain member may
 *  only revoke their own grants -- previously this filtered on `clientId` alone,
 *  which let any member of the portal cut off a colleague's Claude/MCP
 *  connection. (`userId` was already parsed here and simply never used.)
 *
 *  Owners and admins keep the cross-member power deliberately: offboarding and
 *  incident response need it. Role is re-read from the database rather than
 *  trusted from the session, matching `resolveApprovalAuthority` -- a stale JWT
 *  must not grant authority over a client the user has since left.
 *
 *  Note this is an INTRA-tenant boundary. Cross-tenant safety is already handled
 *  by `getPortalClient` scoping to the caller's own client, so `bun test:tenancy`
 *  never exercised this; the gap lived entirely inside one tenant. */
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

  const role = await getPortalRole(userId, client.id);
  const actsForWholeClient = role === 'owner' || role === 'admin';

  const revoked = await db
    .update(oauthAccessTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(oauthAccessTokens.id, id),
        eq(oauthAccessTokens.clientId, client.id),
        // drizzle's `and()` drops undefined, so this predicate simply vanishes
        // for owners/admins instead of needing two query shapes.
        actsForWholeClient ? undefined : eq(oauthAccessTokens.userId, userId),
      ),
    )
    .returning({ id: oauthAccessTokens.id });

  // Report the miss instead of a silent success: without this, a member trying
  // to revoke someone else's grant got `{success:true}` while nothing changed,
  // which reads as "revoked" in the UI and hides the boundary entirely.
  if (revoked.length === 0) {
    return NextResponse.json({ success: false, message: 'Token not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
