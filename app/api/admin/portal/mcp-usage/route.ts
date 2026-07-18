import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import {
  getSummary,
  getTopClients,
  getTopTools,
  getRecentErrors,
  getSlowTools,
  getDailySeries,
  getTodaySoFar,
  COST_PER_MTOK_USD,
} from '@/lib/mcp/usage-stats';

async function requireStaff() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') return null;
  return session;
}

export async function GET(req: Request) {
  if (!await requireStaff()) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const daysRaw = url.searchParams.get('days');
  const days = (() => {
    if (daysRaw === null) return 7;
    const parsed = parseInt(daysRaw, 10);
    if (Number.isNaN(parsed) || parsed < 1 || parsed > 90) return 7;
    return parsed;
  })();

  const [summary, topClients, topTools, recentErrors, slowTools, dailySeries, todaySoFar] = await Promise.all([
    getSummary(days),
    getTopClients(days, 25),
    getTopTools(days, 25),
    getRecentErrors(25),
    getSlowTools(days, 15),
    getDailySeries(days),
    getTodaySoFar(),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      windowDays: days,
      costPerMTokUsd: COST_PER_MTOK_USD,
      summary,
      todaySoFar,
      topClients,
      topTools,
      recentErrors,
      slowTools,
      dailySeries,
    },
  });
}
