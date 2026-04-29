import { NextResponse } from 'next/server';
import { eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { googleWorkspaceUserConnections } from '@/lib/db/schema';
import { refreshIfExpired } from '@/lib/google/oauth';
import { getTenantWorkspaceCredentialsByClientId } from '@/lib/google/tenant-credentials';
import {
  subscribeDriveChanges,
  stopDriveChanges,
  getDriveStartPageToken,
} from '@/lib/google/drive-changes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Cron: re-subscribe Drive watch channels nearing expiration.
 *
 * Drive HTTP push channels typically expire after 1 day. We renew daily so
 * any Drive-scoped connection always has at least 12 hours of live watch
 * ahead of it. Connections that have never been subscribed (no
 * drive_channel_id) also get bootstrapped here.
 *
 * Selection:
 *   - revokedAt is null
 *   - has drive scope
 *   - AND (drive_channel_id is null  ← never subscribed
 *          OR drive_channel_expiration is within 12 hours)
 *
 * Auth: Vercel cron header OR `Authorization: Bearer ${CRON_SECRET}`.
 */

const RENEWAL_HORIZON_MS = 12 * 60 * 60 * 1000; // 12h

function resolveWebhookAddress(req: Request): string {
  const fromEnv = process.env.GOOGLE_DRIVE_WEBHOOK_URL || process.env.NEXT_PUBLIC_SITE_URL;
  const base = fromEnv || new URL(req.url).origin;
  return `${base.replace(/\/$/, '')}/api/google-webhook/drive`;
}

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  const isVercelCron = req.headers.get('x-vercel-cron') === '1';
  const bearerOk = !!cronSecret && auth === `Bearer ${cronSecret}`;
  if (!isVercelCron && !bearerOk) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const webhookAddress = resolveWebhookAddress(req);
  const now = Date.now();
  const horizon = new Date(now + RENEWAL_HORIZON_MS);

  const rows = await db
    .select()
    .from(googleWorkspaceUserConnections)
    .where(isNull(googleWorkspaceUserConnections.revokedAt));

  const candidates = rows.filter((r) => {
    const hasDrive = (r.scopes as string[]).some((s) => s.includes('drive'));
    if (!hasDrive) return false;
    if (!r.driveChannelId) return true;
    if (!r.driveChannelExpiration) return true;
    return r.driveChannelExpiration.getTime() <= horizon.getTime();
  });

  let renewed = 0;
  let failed = 0;
  let skipped = 0;
  const failures: { connectionId: number; reason: string }[] = [];

  for (const conn of candidates) {
    try {
      const tenant = await getTenantWorkspaceCredentialsByClientId(conn.clientId);
      if (!tenant || tenant.status === 'revoked') { skipped++; continue; }

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

      // Bootstrap watermark if missing — required by drive.changes.watch.
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

      // Tear down the previous channel before opening a new one. Best-effort —
      // expired channels return 404 and that's fine.
      if (conn.driveChannelId && conn.driveChannelResourceId) {
        await stopDriveChanges({
          credentials: tenant.oauth,
          connection: { accessToken, refreshToken, expiresAt },
          channelId: conn.driveChannelId,
          resourceId: conn.driveChannelResourceId,
        }).catch((err) => {
          console.warn(`[renew-drive-watches] stop failed for connection=${conn.id}:`, err);
        });
      }

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

      renewed++;
    } catch (err) {
      failed++;
      const reason = (err as Error).message ?? 'unknown';
      failures.push({ connectionId: conn.id, reason });
      console.error(`[renew-drive-watches] connection=${conn.id} failed: ${reason}`);
    }
  }

  return NextResponse.json({
    success: true,
    examined: rows.length,
    candidates: candidates.length,
    renewed,
    skipped,
    failed,
    webhookAddress,
    failures: failures.slice(0, 10),
  });
}
