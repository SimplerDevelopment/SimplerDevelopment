/**
 * GET /api/admin/agentic-os/runs
 *
 * List Agentic OS runs with optional filters + cursor pagination.
 *
 * Query params:
 *   skillId?: string
 *   status?: pending | running | succeeded | failed | cancelled | unavailable
 *   limit?:  number (default 25, max 100)
 *   before?: ISO timestamp — return rows with createdAt < before
 *
 * Response:
 *   { success: true, data: { runs: Array<{...}>, nextCursor: string | null } }
 */
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { agenticOsRuns } from '@/lib/db/schema';
import { and, desc, eq, lt } from 'drizzle-orm';
import { isLocalDev } from '@/lib/agentic-os/local-only';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const RUN_STATUSES = [
  'pending',
  'running',
  'succeeded',
  'failed',
  'cancelled',
  'unavailable',
] as const;
type RunStatus = (typeof RUN_STATUSES)[number];

async function requireStaff() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') return null;
  return session;
}

export async function GET(request: Request) {
  if (!isLocalDev()) return new NextResponse(null, { status: 404 });
  const session = await requireStaff();
  if (!session) {
    return NextResponse.json(
      { success: false, message: 'Unauthorized' },
      { status: 401 }
    );
  }

  const url = new URL(request.url);
  const skillIdParam = url.searchParams.get('skillId');
  const statusParam = url.searchParams.get('status');
  const limitParam = url.searchParams.get('limit');
  const beforeParam = url.searchParams.get('before');

  const limitRaw = limitParam ? Number.parseInt(limitParam, 10) : 25;
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(limitRaw, 1), 100)
    : 25;

  const filters = [] as Array<ReturnType<typeof eq>>;
  if (skillIdParam) {
    filters.push(eq(agenticOsRuns.skillId, skillIdParam));
  }
  if (statusParam) {
    if (!(RUN_STATUSES as readonly string[]).includes(statusParam)) {
      return NextResponse.json(
        { success: false, message: `Invalid status: ${statusParam}` },
        { status: 400 }
      );
    }
    filters.push(eq(agenticOsRuns.status, statusParam as RunStatus));
  }
  if (beforeParam) {
    const d = new Date(beforeParam);
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json(
        { success: false, message: 'Invalid `before` cursor' },
        { status: 400 }
      );
    }
    filters.push(lt(agenticOsRuns.createdAt, d));
  }

  const whereExpr = filters.length === 0 ? undefined : and(...filters);

  const rows = await db
    .select({
      id: agenticOsRuns.id,
      skillId: agenticOsRuns.skillId,
      status: agenticOsRuns.status,
      exitCode: agenticOsRuns.exitCode,
      durationMs: agenticOsRuns.durationMs,
      errorMessage: agenticOsRuns.errorMessage,
      host: agenticOsRuns.host,
      createdBy: agenticOsRuns.createdBy,
      createdAt: agenticOsRuns.createdAt,
      startedAt: agenticOsRuns.startedAt,
      completedAt: agenticOsRuns.completedAt,
    })
    .from(agenticOsRuns)
    .where(whereExpr)
    .orderBy(desc(agenticOsRuns.createdAt))
    .limit(limit + 1);

  let nextCursor: string | null = null;
  let runs = rows;
  if (rows.length > limit) {
    runs = rows.slice(0, limit);
    const last = runs[runs.length - 1];
    nextCursor = last?.createdAt ? last.createdAt.toISOString() : null;
  }

  return NextResponse.json({
    success: true,
    data: { runs, nextCursor },
  });
}
