// Vercel cron entrypoint for the Magamommy autonomous weekly drop.
//
// Schedule (registered in vercel.json): "0 14 * * 1" — Monday 14:00 UTC,
// which is 09:00 EST or 10:00 EDT. Runs the four-stage orchestrator
// (research → concept → design → publish) in-process. Each stage commits
// its result to the magamommy_drops state row before the next runs, so a
// timeout mid-pipeline is recoverable on the next cron tick.
//
// Auth: same pattern as plugin-jobs-tick — Vercel platform header
// `x-vercel-cron: 1` OR Bearer `CRON_SECRET` in Authorization.
//
// maxDuration is bumped to 300s (5 min) because GPT-image-1 alone can take
// 40-60s, and the Anthropic research stage with web_search adds another
// 30-50s. Total pipeline budget ~3 min, with 2 min headroom for retries.

import { NextResponse, type NextRequest } from 'next/server';
import { withCronHealth } from '@/lib/cron-health';
import { isAuthorizedCron } from '@/lib/plugins/handlers/postcaptain-tools/cron-auth';
import { runWeeklyDrop } from '@/lib/magamommy/orchestrator';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

async function _GET(req: Request) {
  if (!isAuthorizedCron(req as NextRequest)) {
    return NextResponse.json(
      { success: false, message: 'Unauthorized' },
      { status: 401 },
    );
  }

  const url = new URL(req.url);
  const force = url.searchParams.get('force') === '1';

  let result;
  try {
    result = await runWeeklyDrop({ force });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('[orchestrator] Magamommy website not found')) {
      return NextResponse.json({ success: false, message: 'Magamommy tenant not provisioned in this environment — skipping', skip: true });
    }
    throw err;
  }

  return NextResponse.json({
    success: result.status === 'live',
    drop: result,
  });
}

export const GET = withCronHealth(
  { name: 'api-cron:magamommy-weekly-drop', area: 'api-cron' },
  _GET,
);
