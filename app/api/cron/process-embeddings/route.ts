import { NextResponse } from 'next/server';
import { withCronHealth } from '@/lib/cron-health';
import { drainQueue, getQueueStats } from '@/lib/brain/embedding-queue';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Cron: drain pending entries from brain_embedding_jobs in batches. Each
 * tick pulls up to BATCH_SIZE jobs, calls embedById for each, deletes
 * succeeded rows, leaves failed rows for retry (up to MAX_ATTEMPTS in the
 * queue helper).
 *
 * Run frequency: 1 minute is a good baseline. Idempotent — multiple
 * concurrent ticks won't double-pick the same job thanks to FOR UPDATE
 * SKIP LOCKED in drainQueue.
 *
 * Auth: Vercel cron header OR `Authorization: Bearer ${CRON_SECRET}`.
 *
 * Tunable per request via ?batch=N (caps at 100 to keep a single tick
 * bounded — a deep queue gets drained over multiple cron firings).
 */
async function _GET(req: Request) {
  const isVercelCron = req.headers.get('x-vercel-cron') === '1';
  if (!isVercelCron) {
    const cronSecret = process.env.CRON_SECRET;
    const auth = req.headers.get('authorization');
    if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
  }

  const url = new URL(req.url);
  const batchRaw = parseInt(url.searchParams.get('batch') ?? '25', 10);
  const batchSize = Number.isFinite(batchRaw) ? Math.max(1, Math.min(batchRaw, 100)) : 25;

  const t0 = Date.now();
  const result = await drainQueue(batchSize);
  const stats = await getQueueStats();
  const ms = Date.now() - t0;

  return NextResponse.json({
    success: true,
    data: {
      batchSize,
      durationMs: ms,
      drained: result,
      queue: stats,
    },
  });
}

export const GET = withCronHealth(
  { name: 'api-cron:process-embeddings', area: 'api-cron' },
  _GET,
);
