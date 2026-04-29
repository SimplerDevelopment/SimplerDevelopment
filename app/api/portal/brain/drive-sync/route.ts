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
} from '@/lib/google/drive-changes';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/portal/brain/drive-sync
 *
 * Manual trigger for the same sync the cron runs — but scoped to the
 * authenticated user's tenant. Used by the Brain settings UI ("Sync now")
 * and as a fast feedback loop while building / debugging.
 */
export async function POST() {
  const result = await authorizePortal({ action: 'write' });
  if (isAuthError(result)) return result.response;

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
