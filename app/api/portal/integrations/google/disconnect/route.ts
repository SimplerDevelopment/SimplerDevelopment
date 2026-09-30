import { NextResponse } from 'next/server';
import { eq, and, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { googleWorkspaceUserConnections } from '@/lib/db/schema';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { revoke } from '@/lib/google/oauth';
import { getTenantWorkspaceCredentialsByClientId } from '@/lib/google/tenant-credentials';

/**
 * Disconnect the calling portal user's Google Workspace grant.
 *
 * Two-sided cleanup:
 *   1. Tell Google to invalidate the refresh token (best-effort — Google's revoke
 *      endpoint can fail transiently; we log and continue rather than leaving the
 *      user stuck with a "still connected on our side, but actually broken" state).
 *   2. Mark the local row revoked: scrub access/refresh tokens to empty and set
 *      revokedAt = now(). The row is kept (not deleted) so audit/history queries
 *      can still see when a user revoked.
 *
 * Idempotent: calling twice returns 200 both times. Calling for a user with no
 * connection returns 200 with already_disconnected:true.
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

  // Find the active (not yet revoked) connection. We deliberately skip already-revoked
  // rows so a second disconnect call is a clean no-op.
  const rows = await db
    .select()
    .from(googleWorkspaceUserConnections)
    .where(
      and(
        eq(googleWorkspaceUserConnections.clientId, client.id),
        eq(googleWorkspaceUserConnections.userId, userId),
        isNull(googleWorkspaceUserConnections.revokedAt)
      )
    )
    .limit(1);
  const connection = rows[0];

  if (!connection) {
    return NextResponse.json({ ok: true, alreadyDisconnected: true });
  }

  // Best-effort revoke at Google. Failures are logged but don't block local cleanup —
  // an orphaned grant on Google's side is a smaller user-facing problem than a stale
  // "connected" UI on our side.
  let revokeResult: { revoked: true; alreadyRevoked?: boolean } | null = null;
  let revokeError: string | null = null;
  try {
    const tenant = await getTenantWorkspaceCredentialsByClientId(client.id);
    if (tenant) {
      revokeResult = await revoke(connection.refreshToken, tenant.oauth);
    } else {
      revokeError = 'tenant_credentials_missing';
    }
  } catch (err) {
    revokeError = (err as Error).message;
  }

  await db
    .update(googleWorkspaceUserConnections)
    .set({
      accessToken: '',
      refreshToken: '',
      revokedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(googleWorkspaceUserConnections.id, connection.id));

  return NextResponse.json({
    ok: true,
    googleRevoked: revokeResult?.revoked ?? false,
    alreadyRevokedOnGoogle: revokeResult?.alreadyRevoked ?? false,
    ...(revokeError ? { revokeError } : {}),
  });
}
