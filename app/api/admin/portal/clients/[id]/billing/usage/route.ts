import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { usageMeterEvents, usageBillingPeriods } from '@/lib/db/schema';
import { and, desc, eq, sql } from 'drizzle-orm';
import {
  rollupClientPeriod,
  currentPeriodUtc,
} from '@/lib/billing/usage-rollup';

async function requireStaff() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') return null;
  return session;
}

/**
 * GET /api/admin/portal/clients/:id/billing/usage?period=YYYY-MM
 *
 * Returns three buckets for the admin Billing tab:
 *
 *   - liveTotals    raw SUM per resource from `usage_meter_events` for the
 *                   period (what the meter has actually observed).
 *   - dryRun        the rollup result with dryRun=true (Stripe NOT touched).
 *                   Computes billable = max(0, total - included) per
 *                   active metered item, so the operator sees what would
 *                   be pushed.
 *   - history       the last 12 `usage_billing_periods` rows for the client.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireStaff()) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const clientId = parseInt(id, 10);
  if (Number.isNaN(clientId)) {
    return NextResponse.json({ success: false, message: 'Invalid client id' }, { status: 400 });
  }

  const url = new URL(req.url);
  const period = url.searchParams.get('period') ?? currentPeriodUtc();
  if (!/^\d{4}-\d{2}$/.test(period)) {
    return NextResponse.json({ success: false, message: 'Invalid period' }, { status: 400 });
  }

  const liveTotalsRows = await db
    .select({
      resource: usageMeterEvents.resource,
      total: sql<string>`coalesce(sum(${usageMeterEvents.amount})::text, '0')`,
    })
    .from(usageMeterEvents)
    .where(and(
      eq(usageMeterEvents.clientId, clientId),
      eq(usageMeterEvents.period, period),
    ))
    .groupBy(usageMeterEvents.resource);

  const liveTotals = liveTotalsRows.map(r => ({
    resource: r.resource,
    total: parseFloat(r.total),
  }));

  const dryRun = await rollupClientPeriod(clientId, period, { dryRun: true });

  const history = await db
    .select()
    .from(usageBillingPeriods)
    .where(eq(usageBillingPeriods.clientId, clientId))
    .orderBy(desc(usageBillingPeriods.createdAt))
    .limit(12);

  return NextResponse.json({
    success: true,
    data: { period, liveTotals, dryRun, history },
  });
}

/**
 * POST /api/admin/portal/clients/:id/billing/usage
 *
 * Body: { period?: string, force?: boolean, dryRun?: boolean }
 *
 * Force-runs the rollup for a single client. When `force=true` and
 * `dryRun=false` this WILL push usage to Stripe — admin only. By default
 * we run dryRun to match the GET preview semantics.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireStaff()) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const clientId = parseInt(id, 10);
  if (Number.isNaN(clientId)) {
    return NextResponse.json({ success: false, message: 'Invalid client id' }, { status: 400 });
  }

  let body: { period?: string; force?: boolean; dryRun?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    // Optional body — empty / non-JSON falls through to defaults.
  }
  const period = body.period ?? currentPeriodUtc();
  if (!/^\d{4}-\d{2}$/.test(period)) {
    return NextResponse.json({ success: false, message: 'Invalid period' }, { status: 400 });
  }

  // Default to dryRun unless caller explicitly opts into a real push.
  const dryRun = body.dryRun !== undefined ? body.dryRun : !body.force;
  const result = await rollupClientPeriod(clientId, period, { dryRun });
  return NextResponse.json({ success: true, data: { period, dryRun, result } });
}
