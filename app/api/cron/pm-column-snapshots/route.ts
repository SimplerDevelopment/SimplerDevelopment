import { NextResponse } from 'next/server';
import { recordColumnDailySnapshots } from '@/lib/portal/cfd-snapshot';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Cron: snapshot column counts daily for the cumulative flow diagram.
 * Suggested schedule: once per day at 23:55 UTC (`55 23 * * *`). Cheap to
 * re-run — idempotent on (projectId, columnId, snapshotDate).
 */
export async function GET(req: Request) {
  const isVercelCron = req.headers.get('x-vercel-cron') === '1';
  if (!isVercelCron) {
    const cronSecret = process.env.CRON_SECRET;
    const auth = req.headers.get('authorization');
    if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
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
