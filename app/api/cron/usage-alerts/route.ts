import { NextResponse } from 'next/server';
import { runUsageAlerts } from '@/lib/billing/usage-alerts';
import { isAuthorizedCron } from '@/lib/cron-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Cron endpoint: evaluate per-client usage thresholds and fire alerts.
 *
 * Auth: `Authorization: Bearer ${CRON_SECRET}` or Vercel cron header.
 * Schedule: 05:15 UTC daily — after the 04:45 usage-rollup cron.
 */
export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const result = await runUsageAlerts();
  return NextResponse.json({ success: true, ...result });
}

export const POST = GET;
