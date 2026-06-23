// Per-minute cron: scans registered_app_jobs for due weekly schedules and
// enqueues a registered_app_runs row per claim. The actual execution runs
// in the sibling drain cron (plugin-runs-drain). Splitting fire-from-execute
// keeps each cron tick fast and bounded.
//
// Auth: Vercel cron platform header `x-vercel-cron: 1` OR a Bearer secret
// in `Authorization` matching `process.env.CRON_SECRET`. Mirrors the auth
// pattern used by app/api/cron/process-scheduled-automations/route.ts.
//
// Idempotent under concurrent ticks: fireDueJobs() CAS-claims each job by
// stamping a fresh nextRunAt; two simultaneous ticks racing on the same
// row only let one win.

import { NextResponse, type NextRequest } from 'next/server';
import { withCronHealth } from '@/lib/cron-health';
import { fireDueJobs } from '@/lib/plugins/handlers/content-tools/fire-due-jobs';
import { isAuthorizedCron } from '@/lib/cron-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function _GET(req: Request) {
  if (!isAuthorizedCron(req as NextRequest)) {
    return NextResponse.json(
      { success: false, message: 'Unauthorized' },
      { status: 401 },
    );
  }

  const fired = await fireDueJobs();
  return NextResponse.json({ success: true, fired });
}

export const GET = withCronHealth(
  { name: 'api-cron:plugin-jobs-tick', area: 'api-cron' },
  _GET,
);
