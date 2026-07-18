import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { googleWorkspaceUserConnections } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { getTenantWorkspaceCredentialsByClientId } from '@/lib/google/tenant-credentials';

/**
 * Connection status for the calling portal user.
 *
 * Shape:
 *   {
 *     tier:          'standard' | 'enterprise',
 *     tenantStatus:  'pending' | 'configured' | 'active' | 'revoked' | null,
 *     connection:    null | { googleAccountEmail, scopes, expiresAt, lastSyncAt, createdAt }
 *   }
 *
 * Standard tier (no tenant credentials row) → tier='standard', tenantStatus=null,
 * connection=null. Caller should not present a Connect button.
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

  const tenant = await getTenantWorkspaceCredentialsByClientId(client.id);
  if (!tenant) {
    return NextResponse.json({ tier: 'standard', tenantStatus: null, connection: null });
  }

  const rows = await db
    .select({
      googleAccountEmail: googleWorkspaceUserConnections.googleAccountEmail,
      scopes: googleWorkspaceUserConnections.scopes,
      expiresAt: googleWorkspaceUserConnections.expiresAt,
      lastSyncAt: googleWorkspaceUserConnections.lastSyncAt,
      createdAt: googleWorkspaceUserConnections.createdAt,
    })
    .from(googleWorkspaceUserConnections)
    .where(
      and(
        eq(googleWorkspaceUserConnections.clientId, client.id),
        eq(googleWorkspaceUserConnections.userId, userId),
        isNull(googleWorkspaceUserConnections.revokedAt)
      )
    )
    .limit(1);

  return NextResponse.json({
    tier: 'enterprise',
    tenantStatus: tenant.status,
    connection: rows[0] ?? null,
  });
}
