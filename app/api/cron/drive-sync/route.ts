import { NextResponse } from 'next/server';
import { eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { googleWorkspaceUserConnections } from '@/lib/db/schema';
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
 * Cron: pull every non-revoked Workspace user connection that has Drive
 * scope, and run an incremental Drive change sync for each. Filters changes
 * to Google Docs in the user's "Meet Recordings" folder and ingests each as
 * a brain_meetings row (source='google_meet_recording').
 *
 * Idempotent on (clientId, sourceRef=driveFileId) — re-running on the same
 * file updates the existing row instead of duplicating.
 *
 * Auth: Vercel cron header OR `Authorization: Bearer ${CRON_SECRET}`.
 */
export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  const isVercelCron = req.headers.get('x-vercel-cron') === '1';
  const bearerOk = !!cronSecret && auth === `Bearer ${cronSecret}`;
  if (!isVercelCron && !bearerOk) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const rows = await db
    .select()
    .from(googleWorkspaceUserConnections)
    .where(isNull(googleWorkspaceUserConnections.revokedAt));

  const candidates = rows.filter((r) => (r.scopes as string[]).some((s) => s.includes('drive')));

  let synced = 0;
  let failed = 0;
  let skipped = 0;
  let totalIngested = 0;
  const failures: { connectionId: number; reason: string }[] = [];

  for (const conn of candidates) {
    try {
      const tenant = await getTenantWorkspaceCredentialsByClientId(conn.clientId);
      if (!tenant || tenant.status === 'revoked') { skipped++; continue; }

      let accessToken = conn.accessToken;
      let refreshToken = conn.refreshToken;
      let expiresAt = conn.expiresAt;

      const refreshed = await refreshIfExpired(
        { accessToken, refreshToken, expiresAt },
        tenant.oauth,
      );
      if (refreshed.refreshed) {
        accessToken = refreshed.accessToken;
        expiresAt = refreshed.expiresAt;
        if (refreshed.refreshToken) refreshToken = refreshed.refreshToken;
        await db.update(googleWorkspaceUserConnections)
          .set({ accessToken, refreshToken, expiresAt, updatedAt: new Date() })
          .where(eq(googleWorkspaceUserConnections.id, conn.id));
      }

      // Bootstrap watermark on first run.
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

      // Folder ID isn't currently cached (no schema field for it yet); resolve
      // each pass. Cheap one-shot drive.files.list.
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
          driveStartPageToken: pageToken,
        },
        clientId: conn.clientId,
        userId: conn.userId,
        meetRecordingsFolderId: folderId,
      });

      synced++;
      totalIngested += result.ingested;
      if (result.errors.length > 0) {
        for (const e of result.errors) {
          failures.push({ connectionId: conn.id, reason: `${e.fileId}: ${e.error}` });
        }
      }
    } catch (err) {
      failed++;
      const reason = (err as Error).message ?? 'unknown';
      failures.push({ connectionId: conn.id, reason });
      console.error(`[drive-sync] connection=${conn.id} failed: ${reason}`);
    }
  }

  return NextResponse.json({
    success: true,
    examined: rows.length,
    candidates: candidates.length,
    synced,
    skipped,
    failed,
    totalIngested,
    failures: failures.slice(0, 20),
  });
}
