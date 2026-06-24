import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { promptRegistry, promptVersions, evalRuns } from '@/lib/db/schema';
import { eq, asc, desc } from 'drizzle-orm';
import { requireStaff } from '../_auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/prompts/[id] — a single prompt with its version history and
 * full run timeline (ascending by createdAt, so the chart reads left→right).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const promptId = parseInt(id, 10);
  if (Number.isNaN(promptId)) {
    return NextResponse.json({ success: false, message: 'Invalid prompt id' }, { status: 400 });
  }

  const [prompt] = await db.select().from(promptRegistry).where(eq(promptRegistry.id, promptId)).limit(1);
  if (!prompt) return NextResponse.json({ success: false, message: 'Prompt not found' }, { status: 404 });

  const versions = await db
    .select()
    .from(promptVersions)
    .where(eq(promptVersions.promptId, promptId))
    .orderBy(desc(promptVersions.version));

  const runs = await db
    .select({
      id: evalRuns.id,
      status: evalRuns.status,
      trigger: evalRuns.trigger,
      promptVersionId: evalRuns.promptVersionId,
      total: evalRuns.total,
      passed: evalRuns.passed,
      passRate: evalRuns.passRate,
      aggregate: evalRuns.aggregate,
      avgLatencyMs: evalRuns.avgLatencyMs,
      totalTokens: evalRuns.totalTokens,
      costUsd: evalRuns.costUsd,
      createdAt: evalRuns.createdAt,
      finishedAt: evalRuns.finishedAt,
    })
    .from(evalRuns)
    .where(eq(evalRuns.promptId, promptId))
    .orderBy(asc(evalRuns.createdAt));

  return NextResponse.json({ success: true, data: { prompt, versions, runs } });
}
