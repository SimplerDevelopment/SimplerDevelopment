import { NextResponse } from 'next/server';
import { eq, and, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { microsoftTeamsUserConnections } from '@/lib/db/schema';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';

/**
 * Connection status for the calling portal user.
 *
 * Shape:
 *   {
 *     configured: boolean,                       // env vars present on this deploy
 *     connection: null | {
 *       microsoftAccountEmail, microsoftTenantId,
 *       scopes, expiresAt, lastSyncAt, createdAt,
 *       subscriptionId, subscriptionExpiration,  // null until PR 2
 *     }
 *   }
 *
 * Used by the portal UI to render the connect/disconnect button + show watch
 * state.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = parseInt(session.user.id, 10);

  const client = await getPortalClient(userId);
  if (!client) {
    return NextResponse.json({ error: 'No client for this user' }, { status: 404 });
  }

  const configured =
    !!process.env.MICROSOFT_TEAMS_CLIENT_ID && !!process.env.MICROSOFT_TEAMS_CLIENT_SECRET;

  const [row] = await db
    .select({
      microsoftAccountEmail: microsoftTeamsUserConnections.microsoftAccountEmail,
      microsoftTenantId: microsoftTeamsUserConnections.microsoftTenantId,
      scopes: microsoftTeamsUserConnections.scopes,
      expiresAt: microsoftTeamsUserConnections.expiresAt,
      lastSyncAt: microsoftTeamsUserConnections.lastSyncAt,
      createdAt: microsoftTeamsUserConnections.createdAt,
      subscriptionId: microsoftTeamsUserConnections.subscriptionId,
      subscriptionExpiration: microsoftTeamsUserConnections.subscriptionExpiration,
    })
    .from(microsoftTeamsUserConnections)
    .where(
      and(
        eq(microsoftTeamsUserConnections.clientId, client.id),
        eq(microsoftTeamsUserConnections.userId, userId),
        isNull(microsoftTeamsUserConnections.revokedAt),
      ),
    )
    .limit(1);

  return NextResponse.json({
    success: true,
    data: { configured, connection: row ?? null },
  });
}
