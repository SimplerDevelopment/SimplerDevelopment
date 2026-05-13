import { NextResponse } from 'next/server';
import { lt, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { mcpToolCalls } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Cron endpoint: drop raw mcp_tool_calls rows older than 14 days.
 *
 * The raw event table grows fast — every MCP tool invocation across every
 * client lands a row. We keep 14 days for friction analysis (which clients
 * spiked? which tools regressed?) and lean on `mcp_tool_call_daily_rollups`
 * for longer-horizon trends (Round 2).
 *
 * Auth: `Authorization: Bearer ${CRON_SECRET}` or Vercel cron header.
 * Suggested schedule: daily at 04:23 UTC (offset from other crons).
 *
 * Optional query params (manual runs only):
 *   ?days=30   — override retention window
 *   ?dryRun=1  — count rows that would be dropped without deleting
 */
export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  const isVercelCron = req.headers.get('x-vercel-cron') === '1';

  const bearerOk = cronSecret && auth === `Bearer ${cronSecret}`;
  if (!isVercelCron && !bearerOk) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const daysRaw = url.searchParams.get('days');
  const dryRun = url.searchParams.get('dryRun') === '1';

  const days = daysRaw !== null ? parseInt(daysRaw, 10) : 14;
  if (Number.isNaN(days) || days < 1 || days > 365) {
    return NextResponse.json(
      { success: false, message: 'days must be between 1 and 365' },
      { status: 400 },
    );
  }

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  if (dryRun) {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(mcpToolCalls)
      .where(lt(mcpToolCalls.createdAt, cutoff));
    return NextResponse.json({
      success: true,
      dryRun: true,
      days,
      cutoff: cutoff.toISOString(),
      wouldDelete: count ?? 0,
    });
  }

  const deleted = await db
    .delete(mcpToolCalls)
    .where(lt(mcpToolCalls.createdAt, cutoff))
    .returning({ id: mcpToolCalls.id });

  return NextResponse.json({
    success: true,
    days,
    cutoff: cutoff.toISOString(),
    deleted: deleted.length,
  });
}

export const POST = GET;
