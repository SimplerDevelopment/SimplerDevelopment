import { NextResponse } from 'next/server';
import { eq, and, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { googleWorkspaceUserConnections } from '@/lib/db/schema';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { refreshIfExpired } from '@/lib/google/oauth';
import { getTenantWorkspaceCredentialsByClientId } from '@/lib/google/tenant-credentials';
import {
  syncDriveChangesForConnection,
  getDriveStartPageToken,
  findMeetRecordingsFolderId,
  backfillMeetRecordingsFolder,
  subscribeDriveChanges,
  stopDriveChanges,
} from '@/lib/google/drive-changes';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/portal/brain/drive-sync
 *
 * Manual trigger for the same sync the cron runs — but scoped to the
 * authenticated user's tenant. Used by the Brain settings UI ("Sync now")
 * and as a fast feedback loop while building / debugging.
 *
 * Query params:
 *   ?mode=backfill    — list every Google Doc in the Meet Recordings folder
 *                       and ingest each (idempotent on driveFileId). Use after
 *                       a fresh connect to pull in historical recordings the
 *                       changes API can't see.
 *   ?mode=subscribe   — open a drive.changes.watch HTTP push channel so new
 *                       recordings sync within seconds of landing in Drive.
 *                       Stops the prior channel first if one exists.
 *   ?mode=unsubscribe — tear down the existing watch channel.
 *   ?limit=N          — cap on backfill ingest (default 50).
 */
export async function POST(request: Request) {
  const result = await authorizePortal({ action: 'write' });
  if (isAuthError(result)) return result.response;

  const url = new URL(request.url);
  const mode = url.searchParams.get('mode');
  const limit = Number(url.searchParams.get('limit') ?? '50');

  const conn = await db.select().from(googleWorkspaceUserConnections)
    .where(and(
      eq(googleWorkspaceUserConnections.clientId, result.client.id),
      eq(googleWorkspaceUserConnections.userId, result.userId),
      isNull(googleWorkspaceUserConnections.revokedAt),
    ))
    .limit(1)
    .then((rows) => rows[0]);

  if (!conn) {
    return NextResponse.json({ success: false, message: 'No Google Workspace connection for this user. Connect Google in Brain settings first.' }, { status: 400 });
  }
  if (!(conn.scopes as string[]).some((s) => s.includes('drive'))) {
    return NextResponse.json({ success: false, message: 'Connection lacks Drive scope. Reconnect with Drive enabled.' }, { status: 400 });
  }

  const tenant = await getTenantWorkspaceCredentialsByClientId(result.client.id);
  if (!tenant) {
    return NextResponse.json({ success: false, message: 'Tenant Workspace credentials not configured.' }, { status: 500 });
  }

  let accessToken = conn.accessToken;
  let refreshToken = conn.refreshToken;
  let expiresAt = conn.expiresAt;

  const refreshed = await refreshIfExpired({ accessToken, refreshToken, expiresAt }, tenant.oauth);
  if (refreshed.refreshed) {
    accessToken = refreshed.accessToken;
    expiresAt = refreshed.expiresAt;
    if (refreshed.refreshToken) refreshToken = refreshed.refreshToken;
    await db.update(googleWorkspaceUserConnections)
      .set({ accessToken, refreshToken, expiresAt, updatedAt: new Date() })
      .where(eq(googleWorkspaceUserConnections.id, conn.id));
  }

  let pageToken = conn.driveStartPageToken;
  if (!pageToken) {
    pageToken = await getDriveStartPageToken({
      credentials: tenant.oauth,
      connection: { accessToken, refreshToken, expiresAt },
    });
    await db.update(googleWorkspaceUserConnections)
      .set({ driveStartPageToken: pageToken, updatedAt: new Date() })
      .where(eq(googleWorkspaceUserConnections.id, conn.id));
  }

  const folderId = await findMeetRecordingsFolderId({
    credentials: tenant.oauth,
    connection: { accessToken, refreshToken, expiresAt },
  });

  if (mode === 'backfill') {
    if (!folderId) {
      return NextResponse.json({
        success: false,
        message: 'Meet Recordings folder not found. Record a Meet first to create it.',
      }, { status: 400 });
    }
    const out = await backfillMeetRecordingsFolder({
      credentials: tenant.oauth,
      connection: { accessToken, refreshToken, expiresAt },
      clientId: result.client.id,
      userId: result.userId,
      meetRecordingsFolderId: folderId,
      limit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 200) : 50,
    });
    return NextResponse.json({
      success: true,
      data: {
        mode: 'backfill',
        meetRecordingsFolderId: folderId,
        scanned: out.scanned,
        ingested: out.ingested,
        skipped: out.skipped,
        errors: out.errors.slice(0, 10),
      },
    });
  }

  if (mode === 'subscribe' || mode === 'unsubscribe') {
    // Tear down any prior channel first — same flow either way.
    if (conn.driveChannelId && conn.driveChannelResourceId) {
      await stopDriveChanges({
        credentials: tenant.oauth,
        connection: { accessToken, refreshToken, expiresAt },
        channelId: conn.driveChannelId,
        resourceId: conn.driveChannelResourceId,
      }).catch((err) => {
        console.warn(`[drive-sync.subscribe] stop failed for connection=${conn.id}:`, err);
      });
      await db.update(googleWorkspaceUserConnections)
        .set({
          driveChannelId: null,
          driveChannelResourceId: null,
          driveChannelToken: null,
          driveChannelExpiration: null,
          updatedAt: new Date(),
        })
        .where(eq(googleWorkspaceUserConnections.id, conn.id));
    }

    if (mode === 'unsubscribe') {
      return NextResponse.json({ success: true, data: { mode: 'unsubscribe', state: 'stopped' } });
    }

    const webhookBase = process.env.GOOGLE_DRIVE_WEBHOOK_URL || process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
    const webhookAddress = `${webhookBase.replace(/\/$/, '')}/api/google-webhook/drive`;
    const watch = await subscribeDriveChanges({
      credentials: tenant.oauth,
      connection: { accessToken, refreshToken, expiresAt, driveStartPageToken: pageToken },
      webhookAddress,
    });
    await db.update(googleWorkspaceUserConnections)
      .set({
        driveChannelId: watch.channelId,
        driveChannelResourceId: watch.resourceId,
        driveChannelToken: watch.channelToken,
        driveChannelExpiration: watch.expiration,
        updatedAt: new Date(),
      })
      .where(eq(googleWorkspaceUserConnections.id, conn.id));
    return NextResponse.json({
      success: true,
      data: {
        mode: 'subscribe',
        webhookAddress,
        channelId: watch.channelId,
        expiration: watch.expiration.toISOString(),
      },
    });
  }

  const out = await syncDriveChangesForConnection({
    credentials: tenant.oauth,
    connection: {
      id: conn.id,
      accessToken,
      refreshToken,
      expiresAt,
      driveStartPageToken: pageToken,
    },
    clientId: result.client.id,
    userId: result.userId,
    meetRecordingsFolderId: folderId,
  });

  return NextResponse.json({
    success: true,
    data: {
      meetRecordingsFolderId: folderId,
      scanned: out.scanned,
      ingested: out.ingested,
      skipped: out.skipped,
      errors: out.errors.slice(0, 10),
      newPageToken: out.newPageToken,
    },
  });
}
