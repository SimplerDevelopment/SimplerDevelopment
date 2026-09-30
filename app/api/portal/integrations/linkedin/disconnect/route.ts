import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { markRevoked } from '@/lib/linkedin/connections';

/**
 * Disconnect the calling portal user's LinkedIn grant.
 *
 * LinkedIn exposes no programmatic delegated-token revoke endpoint, so we only
 * mark the local row revoked and scrub it from the active connection. The token
 * will expire naturally. This mirrors the Microsoft disconnect pattern.
 *
 * The row is preserved for audit/history rather than deleted.
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

  await markRevoked(client.id, userId);

  return NextResponse.json({ success: true, data: { disconnected: true } });
}
