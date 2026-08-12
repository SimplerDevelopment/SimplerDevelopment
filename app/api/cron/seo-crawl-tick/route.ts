// Per-minute cron: advances SEO crawl runs (seo_crawl_runs work queue).
//
// One run per tick, processed in bounded chunks inside a ~40s soft budget
// (lib/seo/runner.ts) so finalization fits under maxDuration. Idempotent
// under concurrent ticks: tickSeoCrawls CAS-claims the run row, and a
// crashed tick's run is re-claimed via the stale-heartbeat lease and resumes
// from its persisted frontier.

import { NextResponse, type NextRequest } from 'next/server';
import { withCronHealth } from '@/lib/cron-health';
import { isAuthorizedCron } from '@/lib/cron-auth';
import { tickSeoCrawls } from '@/lib/seo/runner';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

async function _GET(req: Request) {
  if (!isAuthorizedCron(req as NextRequest)) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const result = await tickSeoCrawls();
  return NextResponse.json({ success: true, ...result });
}

export const GET = withCronHealth(
  { name: 'api-cron:seo-crawl-tick', area: 'api-cron' },
  _GET,
);
