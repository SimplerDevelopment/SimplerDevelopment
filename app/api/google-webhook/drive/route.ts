import { NextResponse, type NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { googleWorkspaceUserConnections } from '@/lib/db/schema';
import { refreshIfExpired } from '@/lib/google/oauth';
import { getTenantWorkspaceCredentialsByClientId } from '@/lib/google/tenant-credentials';
import {
  syncDriveChangesForConnection,
  findMeetRecordingsFolderId,
} from '@/lib/google/drive-changes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Drive watch push receiver.
 *
 * URL: /api/google-webhook/drive  (registered as `address` in subscribeDriveChanges)
 *
 * Google Drive HTTP push channels POST here whenever any file changes for the
 * user whose connection owns the channel. Notifications carry only headers
 * (no body that tells us WHAT changed) — the actual change set comes from
 * calling drive.changes.list, which our syncDriveChangesForConnection
 * already does.
 *
 * Auth: per-channel secret token in the X-Goog-Channel-Token header,
 * validated against the value we wrote into google_workspace_user_connections
 * .drive_channel_token at subscribe time.
 *
 * Resource states (X-Goog-Resource-State):
 *   - sync   : initial confirmation, no real change. Ack with 200.
 *   - change : something changed. Run sync.
 *   - exists : same as change for our purposes.
 *   - trash, untrash, remove, update : same — run sync.
 *
 * Response policy:
 *   - 200 once we've ack'd the notification (sync is best-effort, errors are
 *     logged; the cron is the safety net).
 *   - 401 if the token doesn't match (Google will retry then drop).
 *   - 404 if the channel id isn't known (likely a leftover after an unsub).
 */
export async function POST(req: NextRequest) {
  const channelId = req.headers.get('x-goog-channel-id');
  const channelToken = req.headers.get('x-goog-channel-token');
  const resourceState = req.headers.get('x-goog-resource-state') ?? '';

  if (!channelId) {
    return NextResponse.json({ error: 'missing_channel_id' }, { status: 400 });
  }

  const [conn] = await db.select().from(googleWorkspaceUserConnections)
    .where(eq(googleWorkspaceUserConnections.driveChannelId, channelId))
    .limit(1);

  if (!conn) {
    return NextResponse.json({ error: 'unknown_channel' }, { status: 404 });
  }
  if (!channelToken || channelToken !== conn.driveChannelToken) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 401 });
  }

  // Initial sync handshake — Google fires this once on subscription. No work
  // to do; just ack so the channel is considered active.
  if (resourceState === 'sync') {
    return NextResponse.json({ ok: true, state: 'sync_ack' });
  }

  // Dispatch the same sync the cron runs. Best-effort — errors are logged
  // but we always ack to avoid Google's retry loop hitting us with the same
  // notification repeatedly.
  try {
    const tenant = await getTenantWorkspaceCredentialsByClientId(conn.clientId);
    if (!tenant || tenant.status === 'revoked') {
      return NextResponse.json({ ok: true, state: 'tenant_unavailable' });
    }

    let { accessToken, refreshToken, expiresAt } = conn;
    const refreshed = await refreshIfExpired({ accessToken, refreshToken, expiresAt }, tenant.oauth);
    if (refreshed.refreshed) {
      accessToken = refreshed.accessToken;
      expiresAt = refreshed.expiresAt;
      if (refreshed.refreshToken) refreshToken = refreshed.refreshToken;
      await db.update(googleWorkspaceUserConnections)
        .set({ accessToken, refreshToken, expiresAt, updatedAt: new Date() })
        .where(eq(googleWorkspaceUserConnections.id, conn.id));
    }

    if (!conn.driveStartPageToken) {
      console.warn(`[drive-webhook] connection=${conn.id} has no driveStartPageToken; skipping`);
      return NextResponse.json({ ok: true, state: 'no_watermark' });
    }

    const folderId = await findMeetRecordingsFolderId({
      credentials: tenant.oauth,
      connection: { accessToken, refreshToken, expiresAt },
    });

    const result = await syncDriveChangesForConnection({
      credentials: tenant.oauth,
      connection: {
        id: conn.id,
        accessToken,
        refreshToken,
        expiresAt,
        driveStartPageToken: conn.driveStartPageToken,
      },
      clientId: conn.clientId,
      userId: conn.userId,
      meetRecordingsFolderId: folderId,
    });

    return NextResponse.json({
      ok: true,
      state: resourceState,
      ingested: result.ingested,
      scanned: result.scanned,
    });
  } catch (err) {
    console.error(`[drive-webhook] connection=${conn.id} sync failed:`, err);
    return NextResponse.json({ ok: true, state: 'error_logged' });
  }
}
