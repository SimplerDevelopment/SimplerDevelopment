import { NextResponse } from 'next/server';
import { runDailyRollup } from '@/lib/mcp/rollup';
import { isAuthorizedCron } from '@/lib/cron-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Cron endpoint: roll yesterday's mcp_tool_calls up into
 * mcp_tool_call_daily_rollups.
 *
 * Auth: `Authorization: Bearer ${CRON_SECRET}` or Vercel cron header.
 * Suggested schedule: 04:00 UTC, BEFORE the cleanup cron at 04:23 UTC.
 *
 * Optional query params (manual / backfill runs only):
 *   ?daysAgo=N    — roll up the day N days ago (default 1 = yesterday)
 *   ?day=YYYY-MM-DD — explicit UTC date to roll up
 */
export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const daysAgoRaw = url.searchParams.get('daysAgo');
  const dayRaw = url.searchParams.get('day');

  let day: Date | undefined;
  if (dayRaw) {
    // Accept YYYY-MM-DD; interpret as UTC midnight.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dayRaw)) {
      return NextResponse.json(
        { success: false, message: 'day must be YYYY-MM-DD' },
        { status: 400 },
      );
    }
    day = new Date(`${dayRaw}T00:00:00.000Z`);
  }

  let daysAgo: number | undefined;
  if (daysAgoRaw !== null) {
    daysAgo = parseInt(daysAgoRaw, 10);
    if (Number.isNaN(daysAgo) || daysAgo < 0 || daysAgo > 90) {
      return NextResponse.json(
        { success: false, message: 'daysAgo must be 0–90' },
        { status: 400 },
      );
    }
  }

  const result = await runDailyRollup({ day, daysAgo });
  return NextResponse.json({ success: true, ...result });
}

export const POST = GET;
