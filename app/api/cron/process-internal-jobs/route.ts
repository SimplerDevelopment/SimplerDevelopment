import { NextResponse } from 'next/server';
import { withCronHealth } from '@/lib/cron-health';
import { isAuthorizedCron } from '@/lib/cron-auth';
import { drainInternalJobs } from '@/lib/jobs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// The batch is capped at DRAIN_BATCH, but a handler that calls a third party
// (Printful) is slow and unpredictable — give the tick room rather than have it
// killed mid-job and wait out a 10-minute lease to retry.
export const maxDuration = 60;

/**
 * Cron: drain the internal background-work queue.
 *
 * Thin wrapper — the state machine lives in lib/jobs so it can be tested
 * without a request. Schedule: every minute; jobs here are user-visible
 * (a paid order reaching the printer), so latency matters.
 *
 * Auth: Vercel cron header OR `Authorization: Bearer ${CRON_SECRET}`.
 */
async function _GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { processed, failed, deadLettered } = await drainInternalJobs();
  return NextResponse.json({ success: true, processed, failed, deadLettered });
}

export const GET = withCronHealth(
  { name: 'api-cron:process-internal-jobs', area: 'api-cron' },
  _GET,
);
