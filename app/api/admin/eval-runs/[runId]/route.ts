import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { evalRuns, evalCaseResults } from '@/lib/db/schema';
import { eq, asc } from 'drizzle-orm';
import { requireStaff } from '../../prompts/_auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/eval-runs/[runId] — run status + rollup + per-case results.
 * Polled by the dashboard while a run is queued/running.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { runId: runIdRaw } = await params;
  const runId = parseInt(runIdRaw, 10);
  if (Number.isNaN(runId)) {
    return NextResponse.json({ success: false, message: 'Invalid run id' }, { status: 400 });
  }

  const [run] = await db.select().from(evalRuns).where(eq(evalRuns.id, runId)).limit(1);
  if (!run) return NextResponse.json({ success: false, message: 'Run not found' }, { status: 404 });

  const cases = await db
    .select()
    .from(evalCaseResults)
    .where(eq(evalCaseResults.runId, runId))
    .orderBy(asc(evalCaseResults.id));

  return NextResponse.json({ success: true, data: { run, cases } });
}
