import { NextResponse } from 'next/server';
import { unstable_cache, revalidateTag } from 'next/cache';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { automationRules, automationLogs, clients, users } from '@/lib/db/schema';
import { eq, desc, count, lt, and, or } from 'drizzle-orm';

async function requireStaff() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') return null;
  return session;
}

// E2 perf — admin/automations previously loaded every automation rule in one
// shot (no pagination) AND ran a global COUNT over the entire automation_logs
// table with status='failed' on every render. We now cap the rules list at a
// page and cache the failed-count behind a 60s TTL (it changes by the minute
// but the dashboard tile doesn't need to be more accurate than that).
const PAGE_SIZE = 100;
const FAILED_COUNT_TAG = 'admin-automation-logs-failed-count';

async function _getFailedAutomationCountUncached(): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(automationLogs)
    .where(eq(automationLogs.status, 'failed'));
  return row?.count ?? 0;
}

const _getFailedAutomationCountCached = unstable_cache(
  _getFailedAutomationCountUncached,
  ['admin-automation-logs-failed-count'],
  { revalidate: 60, tags: [FAILED_COUNT_TAG] },
);

async function getFailedAutomationCount(): Promise<number> {
  try {
    return await _getFailedAutomationCountCached();
  } catch {
    // Outside a request context (tests/cron/MCP) — incrementalCache unavailable.
    return _getFailedAutomationCountUncached();
  }
}

export function revalidateFailedAutomationCount() {
  try {
    revalidateTag(FAILED_COUNT_TAG, 'default');
  } catch {
    // Outside a request/action context (cron/MCP/tests) — revalidation is a
    // best-effort cache hint; the TTL will catch up.
  }
}

export async function GET(req: Request) {
  if (!await requireStaff()) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const cursorCreatedAt = url.searchParams.get('cursorCreatedAt');
  const cursorId = url.searchParams.get('cursorId');
  const rawLimit = Number(url.searchParams.get('limit') ?? String(PAGE_SIZE));
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : PAGE_SIZE, 1), 200);

  const whereExpr = cursorCreatedAt && cursorId
    ? or(
        lt(automationRules.createdAt, new Date(cursorCreatedAt)),
        and(eq(automationRules.createdAt, new Date(cursorCreatedAt)), lt(automationRules.id, Number(cursorId))),
      )
    : undefined;

  const rulesRaw = await db
    .select({
      id: automationRules.id,
      name: automationRules.name,
      description: automationRules.description,
      enabled: automationRules.enabled,
      executionCount: automationRules.executionCount,
      lastExecutedAt: automationRules.lastExecutedAt,
      source: automationRules.source,
      productScope: automationRules.productScope,
      createdAt: automationRules.createdAt,
      company: clients.company,
      clientName: users.name,
    })
    .from(automationRules)
    .innerJoin(clients, eq(automationRules.clientId, clients.id))
    .innerJoin(users, eq(clients.userId, users.id))
    .where(whereExpr)
    .orderBy(desc(automationRules.createdAt), desc(automationRules.id))
    .limit(limit + 1);

  const hasMore = rulesRaw.length > limit;
  const rules = hasMore ? rulesRaw.slice(0, limit) : rulesRaw;

  const totalRules = rules.length;
  const enabledRules = rules.filter(r => r.enabled).length;
  const totalExecutions = rules.reduce((acc, r) => acc + r.executionCount, 0);

  const failedCount = await getFailedAutomationCount();

  const last = rules[rules.length - 1];
  const nextCursor = hasMore && last
    ? { createdAt: last.createdAt.toISOString(), id: last.id }
    : null;

  return NextResponse.json({
    success: true,
    data: rules,
    nextCursor,
    stats: { totalRules, enabledRules, totalExecutions, failedCount },
  });
}

export async function PATCH(req: Request) {
  if (!await requireStaff()) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { id, enabled } = body;

  if (typeof id !== 'number' || typeof enabled !== 'boolean') {
    return NextResponse.json({ success: false, message: 'Invalid payload' }, { status: 400 });
  }

  const [rule] = await db
    .update(automationRules)
    .set({ enabled, updatedAt: new Date() })
    .where(eq(automationRules.id, id))
    .returning();

  return NextResponse.json({ success: true, data: rule });
}
