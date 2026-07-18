import { NextResponse } from 'next/server';
import { eq, and, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { linkedinUserConnections } from '@/lib/db/schema';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';

/**
 * Connection status for the calling portal user.
 *
 * Shape:
 *   {
 *     success: true,
 *     data: {
 *       configured: boolean,          // env vars present on this deploy
 *       connection: null | {
 *         connected: true,
 *         name: string | null,        // linkedinName from the OIDC id_token
 *         scopes: string[],
 *         memberUrn: string,
 *         expiresAt: Date,
 *         createdAt: Date,
 *       }
 *     }
 *   }
 *
 * Used by the portal UI to render the connect/disconnect button.
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
    !!process.env.LINKEDIN_CLIENT_ID && !!process.env.LINKEDIN_CLIENT_SECRET;

  const [row] = await db
    .select({
      linkedinName: linkedinUserConnections.linkedinName,
      scopes: linkedinUserConnections.scopes,
      memberUrn: linkedinUserConnections.memberUrn,
      expiresAt: linkedinUserConnections.expiresAt,
      createdAt: linkedinUserConnections.createdAt,
    })
    .from(linkedinUserConnections)
    .where(
      and(
        eq(linkedinUserConnections.clientId, client.id),
        eq(linkedinUserConnections.userId, userId),
        isNull(linkedinUserConnections.revokedAt),
      ),
    )
    .limit(1);

  return NextResponse.json({
    success: true,
    data: {
      configured,
      connection: row
        ? {
            connected: true,
            name: row.linkedinName ?? null,
            scopes: row.scopes,
            memberUrn: row.memberUrn,
            expiresAt: row.expiresAt,
            createdAt: row.createdAt,
          }
        : null,
    },
  });
}
