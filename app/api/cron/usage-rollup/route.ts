import { NextResponse } from 'next/server';
import { withCronHealth } from '@/lib/cron-health';
import {
  rollupClientPeriod,
  listClientsWithActiveMeteredItems,
  currentPeriodUtc,
} from '@/lib/billing/usage-rollup';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Cron: roll up the current period's metered usage for every client with
 * active `metered_subscription_items`, push to Stripe, persist audit rows.
 *
 * Auth: Vercel cron header OR `Authorization: Bearer ${CRON_SECRET}`.
 * Mirrors the pattern in app/api/cron/resend-usage-sync/route.ts.
 *
 * Idempotent: re-running on the same period overwrites the per-client
 * audit row (unique on client_id+period+resource) and re-pushes the
 * absolute period total to Stripe (action='set'). Safe to invoke daily.
 *
 * Query params:
 *   - period=YYYY-MM   override the period (defaults to current UTC month)
 *   - dryRun=1         compute totals but skip Stripe push + audit write
 */
async function _GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  const isVercelCron = req.headers.get('x-vercel-cron') === '1';
  if (!isVercelCron && cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { success: false, message: 'Unauthorized' },
      { status: 401 },
    );
  }

  const url = new URL(req.url);
  const periodParam = url.searchParams.get('period');
  const dryRun = url.searchParams.get('dryRun') === '1';
  const period = periodParam ?? currentPeriodUtc();

  if (!/^\d{4}-\d{2}$/.test(period)) {
    return NextResponse.json(
      { success: false, message: `Invalid period "${period}", expected YYYY-MM` },
      { status: 400 },
    );
  }

  const t0 = Date.now();
  const clientIds = await listClientsWithActiveMeteredItems();

  const perClient: Array<{
    clientId: number;
    rollups: Awaited<ReturnType<typeof rollupClientPeriod>>;
    error?: string;
  }> = [];
  let okCount = 0;
  let errCount = 0;

  for (const clientId of clientIds) {
    try {
      const rollups = await rollupClientPeriod(clientId, period, { dryRun });
      perClient.push({ clientId, rollups });
      // Count Stripe-side failures (rollup row written but no usage record)
      // as partial failures so the operator sees them in the cron log.
      const hadStripeFailure = !dryRun && rollups.some(r => r.error);
      if (hadStripeFailure) errCount += 1;
      else okCount += 1;
    } catch (err) {
      errCount += 1;
      perClient.push({
        clientId,
        rollups: [],
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      period,
      dryRun,
      totalClients: clientIds.length,
      ok: okCount,
      err: errCount,
      perClient,
      durationMs: Date.now() - t0,
    },
  });
}

export const GET = withCronHealth(
  { name: 'api-cron:usage-rollup', area: 'api-cron' },
  _GET,
);
