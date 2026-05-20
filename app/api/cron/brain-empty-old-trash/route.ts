import { NextResponse } from 'next/server';
import { withCronHealth } from '@/lib/cron-health';
import { db } from '@/lib/db';
import { clients } from '@/lib/db/schema';
import { purgeOldTrash } from '@/lib/brain/notes';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Cron: daily auto-purge of brain notes that have been in trash longer than
 * `RETENTION_DAYS` (90). Iterates every tenant and calls `purgeOldTrash` per
 * client so a single tenant's failure cannot abort the whole sweep.
 *
 * Each per-client call is tenant-scoped on every internal query (see
 * `purgeOldTrash`); this route does NOT pull or filter notes itself, it only
 * fans out to the helper. Per-note `auto_purged` audit rows are written by
 * the helper so users can see what disappeared and why.
 *
 * Auth: Vercel cron header OR `Authorization: Bearer ${CRON_SECRET}` (matches
 * `app/api/cron/brain-daily-notes/route.ts`).
 *
 * Suggested schedule: 7:15 UTC daily — staggered off the daily-notes 06:05
 * tick so the two don't fight for the same connection pool window.
 */

const RETENTION_DAYS = 90;

async function _GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  const isVercelCron = req.headers.get('x-vercel-cron') === '1';
  if (!isVercelCron && cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const t0 = Date.now();

  const allClients = await db.select({ id: clients.id }).from(clients);

  let clientsScanned = 0;
  let totalPurged = 0;
  let totalAttachmentsDeleted = 0;
  const failures: { clientId: number; reason: string }[] = [];

  for (const c of allClients) {
    clientsScanned += 1;
    try {
      const { purged, attachmentsDeleted } = await purgeOldTrash(c.id, RETENTION_DAYS);
      totalPurged += purged;
      totalAttachmentsDeleted += attachmentsDeleted;
    } catch (err) {
      const reason = (err as Error)?.message ?? 'unknown';
      failures.push({ clientId: c.id, reason });
      console.error(`[brain-empty-old-trash] client=${c.id} failed: ${reason}`);
    }
  }

  const durationMs = Date.now() - t0;

  return NextResponse.json({
    success: true,
    data: {
      clientsScanned,
      totalPurged,
      totalAttachmentsDeleted,
      durationMs,
      retentionDays: RETENTION_DAYS,
      failures: failures.slice(0, 20),
    },
  });
}

export const GET = withCronHealth(
  { name: 'api-cron:brain-empty-old-trash', area: 'api-cron' },
  _GET,
);

// Accept POST for manual triggers from scripts (matches brain-daily-notes).
export const POST = GET;
