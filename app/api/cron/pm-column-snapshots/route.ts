import { NextResponse } from 'next/server';
import { withCronHealth } from '@/lib/cron-health';
import { isAuthorizedCron } from '@/lib/cron-auth';
import { recordColumnDailySnapshots } from '@/lib/portal/cfd-snapshot';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Cron: snapshot column counts daily for the cumulative flow diagram.
 * Suggested schedule: once per day at 23:55 UTC (`55 23 * * *`). Cheap to
 * re-run — idempotent on (projectId, columnId, snapshotDate).
 */
async function _GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const summary = await recordColumnDailySnapshots();
    return NextResponse.json({ success: true, data: summary });
  } catch (err) {
    console.error('[cron/pm-column-snapshots]', err);
    return NextResponse.json(
      { success: false, message: err instanceof Error ? err.message : 'unknown error' },
      { status: 500 },
    );
  }
}

export const GET = withCronHealth(
  { name: 'api-cron:pm-column-snapshots', area: 'api-cron' },
  _GET,
);
