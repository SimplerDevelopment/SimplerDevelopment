import { NextResponse } from 'next/server';
import { withCronHealth } from '@/lib/cron-health';
import { drainExpiredWaitSteps } from '@/lib/brain/playbook-runs';
import { isAuthorizedCron } from '@/lib/cron-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Cron: drain `brain_playbook_run_steps` whose `wait_until <= now()` and that
 * are still `status='active'`. Each drained row becomes `completed` via
 * `completeStep` (which itself calls `advanceRun` to chain to next steps).
 *
 * Bounded — up to 500 rows per tick (set in drainExpiredWaitSteps). On a
 * deeply-backed-up queue, repeat ticks drain steadily; this avoids starving
 * other cron work behind one huge batch.
 *
 * Auth: Vercel cron header OR `Authorization: Bearer ${CRON_SECRET}`.
 *
 * Suggested schedule: every 5 minutes (`*\/5 * * * *`).
 */
async function _GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const out = await drainExpiredWaitSteps();
  console.log('[process-playbook-waits]', JSON.stringify(out));
  return NextResponse.json({ success: true, ...out });
}

export const GET = withCronHealth(
  { name: 'api-cron:process-playbook-waits', area: 'api-cron' },
  _GET,
);

// Accept POST for manual triggers from scripts.
export const POST = GET;
