// Per-minute cron: drains queued content-tools plugin runs.
//
// Auth: Vercel cron platform header `x-vercel-cron: 1` OR a Bearer secret
// in `Authorization` matching `process.env.CRON_SECRET`. Mirrors the auth
// pattern used by app/api/cron/process-scheduled-automations/route.ts.
//
// Volume cap: at most 5 candidates per tick, processed in batches of 2 by
// drainQueuedRuns. Anthropic calls can take 30-60s — the parallelism cap
// keeps the cron function well under Vercel's 60s ceiling on Pro.
// Idempotent under concurrent ticks: drainQueuedRuns CAS-claims via
// executeRun, so two simultaneous cron invocations don't double-fire.

import { NextResponse, type NextRequest } from 'next/server';
import { withCronHealth } from '@/lib/cron-health';
import { drainQueuedRuns } from '@/lib/plugins/handlers/content-tools/runner';
import { isAuthorizedCron } from '@/lib/cron-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

async function _GET(req: Request) {
  if (!isAuthorizedCron(req as NextRequest)) {
    return NextResponse.json(
      { success: false, message: 'Unauthorized' },
      { status: 401 },
    );
  }

  const result = await drainQueuedRuns(5);
  return NextResponse.json({ success: true, ...result });
}

export const GET = withCronHealth(
  { name: 'api-cron:plugin-runs-drain', area: 'api-cron' },
  _GET,
);
