import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { oauthAccessTokens, oauthClients, users } from '@/lib/db/schema';
import { and, desc, eq } from 'drizzle-orm';
import { getPortalClient, getPortalRole } from '@/lib/portal-client';
import { credentialActsForClient } from '@/lib/portal/credential-client-scope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** List OAuth-issued access tokens, segmented by ownership.
 *
 *  An OAuth grant is a PERSONAL consent artifact, so the default view is the
 *  caller's own grants. This previously returned every grant in the portal
 *  client to every member -- one member could read which apps a colleague had
 *  connected, with what scopes, and when they last used them.
 *
 *  Owners and admins additionally get `team`: the other members' grants, for
 *  offboarding and incident response. That is a deliberate, role-gated
 *  disclosure, so the query itself is narrowed for everyone else rather than
 *  filtered after the fact -- a plain member's rows never leave Postgres.
 *
 *  Shape is `{ mine, team, canManageTeam }` rather than a flat array: the UI
 *  renders two distinct sections, and `canManageTeam` tells it whether the
 *  team section exists at all without inferring that from an empty list (a
 *  one-person client would look identical). */
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

  const role = await getPortalRole(userId, client.id);
  const canManageTeam = role === 'owner' || role === 'admin';

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
      memberName: users.name,
      memberEmail: users.email,
      clientName: oauthClients.clientName,
      clientUri: oauthClients.clientUri,
    })
    .from(oauthAccessTokens)
    .innerJoin(oauthClients, eq(oauthAccessTokens.oauthClientId, oauthClients.id))
    .innerJoin(users, eq(oauthAccessTokens.userId, users.id))
    .where(
      and(
        // Matches the grant's DEFAULT client OR any company in its consent
        // allowlist — a grant acting on this company must be visible here even
        // when it defaults to another one. PUX-052.
        credentialActsForClient(oauthAccessTokens.clientId, oauthAccessTokens.clientIds, client.id),
        // Same `and()`-drops-undefined trick as DELETE: owners/admins get the
        // whole client, everyone else is narrowed to their own grants in SQL.
        canManageTeam ? undefined : eq(oauthAccessTokens.userId, userId),
      ),
    )
    .orderBy(desc(oauthAccessTokens.createdAt));

  return NextResponse.json({
    success: true,
    data: {
      mine: rows.filter(r => r.userId === userId),
      team: rows.filter(r => r.userId !== userId),
      canManageTeam,
    },
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
        // Same allowlist-aware match as the listing above: a company that can
        // SEE a grant must be able to revoke it. PUX-052.
        credentialActsForClient(oauthAccessTokens.clientId, oauthAccessTokens.clientIds, client.id),
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
