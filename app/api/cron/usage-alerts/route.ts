import { NextResponse } from 'next/server';
import { runUsageAlerts } from '@/lib/billing/usage-alerts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Cron endpoint: evaluate per-client usage thresholds and fire alerts.
 *
 * Auth: `Authorization: Bearer ${CRON_SECRET}` or Vercel cron header.
 * Schedule: 05:15 UTC daily — after the 04:45 usage-rollup cron.
 */
export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  const isVercelCron = req.headers.get('x-vercel-cron') === '1';

  const bearerOk = cronSecret && auth === `Bearer ${cronSecret}`;
  if (!isVercelCron && !bearerOk) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const result = await runUsageAlerts();
  return NextResponse.json({ success: true, ...result });
}

export const POST = GET;
