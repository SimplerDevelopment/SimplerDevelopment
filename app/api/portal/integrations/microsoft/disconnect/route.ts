import { NextResponse } from 'next/server';
import { eq, and, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { microsoftTeamsUserConnections } from '@/lib/db/schema';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { getEnvMicrosoftCredentials } from '@/lib/microsoft/oauth';
import { deleteTranscriptsSubscription } from '@/lib/microsoft/transcripts-watch';

/**
 * Disconnect the calling portal user's Microsoft Teams grant.
 *
 * Microsoft's v2.0 endpoint has no programmatic refresh-token revoke API
 * (unlike Google's /revoke). To fully revoke, the user must visit
 * https://account.microsoft.com/consent. We mark the local row revoked and
 * scrub the tokens to empty so the next refresh attempt fails closed; the
 * row is preserved for audit/history rather than deleted.
 *
 * If a Graph subscription exists (PR 2), this route should also call
 * DELETE /subscriptions/{id} — left as a TODO until that lands.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = parseInt(session.user.id, 10);

  const client = await getPortalClient(userId);
  if (!client) {
    return NextResponse.json({ error: 'No client for this user' }, { status: 404 });
  }

  const [row] = await db
    .select()
    .from(microsoftTeamsUserConnections)
    .where(
      and(
        eq(microsoftTeamsUserConnections.clientId, client.id),
        eq(microsoftTeamsUserConnections.userId, userId),
        isNull(microsoftTeamsUserConnections.revokedAt),
      ),
    )
    .limit(1);

  if (!row) {
    return NextResponse.json({ success: true, data: { alreadyDisconnected: true } });
  }

  // If a Graph subscription exists, tell Graph to stop sending notifications
  // before we scrub the row's tokens. Best-effort — a failure here just leaves
  // an orphan subscription on Graph that will expire in ≤60 minutes anyway,
  // and notifications coming in for an unknown subscriptionId 404 cleanly.
  if (row.subscriptionId) {
    try {
      const credentials = getEnvMicrosoftCredentials(
        // redirectUri is unused for /subscriptions calls but the helper requires it
        'https://www.simplerdevelopment.com/api/portal/integrations/microsoft/callback',
      );
      await deleteTranscriptsSubscription({
        connection: {
          accessToken: row.accessToken,
          refreshToken: row.refreshToken,
          expiresAt: row.expiresAt,
        },
        credentials,
        subscriptionId: row.subscriptionId,
      });
    } catch (err) {
      console.warn('[microsoft-disconnect] subscription delete failed (will expire ≤60min)', err);
    }
  }

  await db
    .update(microsoftTeamsUserConnections)
    .set({
      accessToken: '',
      refreshToken: '',
      revokedAt: new Date(),
      subscriptionId: null,
      subscriptionResource: null,
      subscriptionExpiration: null,
      subscriptionClientState: null,
      updatedAt: new Date(),
    })
    .where(eq(microsoftTeamsUserConnections.id, row.id));

  return NextResponse.json({ success: true, data: { disconnected: true } });
}
