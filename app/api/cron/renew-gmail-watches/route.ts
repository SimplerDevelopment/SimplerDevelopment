import { NextResponse } from 'next/server';
import { withCronHealth } from '@/lib/cron-health';
import { eq, isNull, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { googleWorkspaceUserConnections } from '@/lib/db/schema';
import { refreshIfExpired } from '@/lib/google/oauth';
import { startGmailWatch } from '@/lib/google/gmail-watch';
import { getTenantWorkspaceCredentialsByClientId } from '@/lib/google/tenant-credentials';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Cron endpoint: re-watch Gmail mailboxes whose watch is about to expire.
 *
 * Gmail's users.watch() expires after ~7 days. If we don't re-watch in time
 * the user stops receiving Pub/Sub pushes silently. We renew daily so any
 * connection always has at least 6 days of valid watch ahead of it.
 *
 * Selection:
 *   - revokedAt is null
 *   - the connection has a gmail.* scope (otherwise watch is irrelevant)
 *   - AND (gmailWatchExpiration is null  ← never watched, or recoverable
 *          OR gmailWatchExpiration is within 48 hours)
 *
 * For each selected row:
 *   - refresh access token if needed
 *   - call startGmailWatch (per-tenant Pub/Sub topic)
 *   - persist new historyId + expiration
 *
 * Errors per connection are logged but don't fail the whole job — one busted
 * row shouldn't prevent the rest from renewing.
 *
 * Auth: Vercel cron header OR `Authorization: Bearer ${CRON_SECRET}`.
 */

const RENEWAL_HORIZON_MS = 48 * 60 * 60 * 1000; // 48h

async function _GET(req: Request) {
  const isVercelCron = req.headers.get('x-vercel-cron') === '1';
  if (!isVercelCron) {
    const cronSecret = process.env.CRON_SECRET;
    const auth = req.headers.get('authorization');
    if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
  }

  const now = Date.now();
  const horizon = new Date(now + RENEWAL_HORIZON_MS);

  // Pull every non-revoked connection. Filtering by jsonb scope contents is
  // easier in JS once we have the rows; the table is small per tenant.
  const rows = await db
    .select()
    .from(googleWorkspaceUserConnections)
    .where(isNull(googleWorkspaceUserConnections.revokedAt));

  const candidates = rows.filter((r) => {
    const hasGmail = (r.scopes as string[]).some((s) => s.includes('gmail'));
    if (!hasGmail) return false;
    if (!r.gmailWatchExpiration) return true; // never watched or lost
    return r.gmailWatchExpiration.getTime() <= horizon.getTime();
  });

  let renewed = 0;
  let failed = 0;
  let skipped = 0;
  const failures: { connectionId: number; reason: string }[] = [];

  for (const conn of candidates) {
    try {
      const tenant = await getTenantWorkspaceCredentialsByClientId(conn.clientId);
      if (!tenant) {
        skipped++;
        continue;
      }
      if (tenant.status === 'revoked') {
        skipped++;
        continue;
      }

      let accessToken = conn.accessToken;
      let refreshToken = conn.refreshToken;
      let expiresAt = conn.expiresAt;

      const refreshed = await refreshIfExpired(
        { accessToken, refreshToken, expiresAt },
        tenant.oauth
      );
      if (refreshed.refreshed) {
        accessToken = refreshed.accessToken;
        expiresAt = refreshed.expiresAt;
        if (refreshed.refreshToken) refreshToken = refreshed.refreshToken;
      }

      const watch = await startGmailWatch({
        credentials: tenant.oauth,
        connection: { accessToken, refreshToken, expiresAt },
        topicName: tenant.pubsubTopic,
      });

      await db
        .update(googleWorkspaceUserConnections)
        .set({
          accessToken,
          refreshToken,
          expiresAt,
          gmailHistoryId: watch.historyId,
          gmailWatchExpiration: watch.expiration,
          updatedAt: new Date(),
        })
        .where(eq(googleWorkspaceUserConnections.id, conn.id));

      renewed++;
    } catch (err) {
      failed++;
      const reason = (err as Error).message ?? 'unknown';
      failures.push({ connectionId: conn.id, reason });
      console.error(`[renew-gmail-watches] connection=${conn.id} failed: ${reason}`);
    }
  }

  return NextResponse.json({
    success: true,
    examined: rows.length,
    candidates: candidates.length,
    renewed,
    failed,
    skipped,
    failures: failures.slice(0, 10), // cap log noise
  });
}

export const GET = withCronHealth(
  { name: 'api-cron:renew-gmail-watches', area: 'api-cron' },
  _GET,
);
