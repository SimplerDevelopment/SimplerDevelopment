import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { promptRegistry, evalRuns } from '@/lib/db/schema';
import { inArray } from 'drizzle-orm';
import { requireStaff } from '../prompts/_auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/eval-cost — cost/spend aggregation.
 *
 * Per prompt: runCount, totalTokens, totalCostUsd, lastRunAt.
 * Includes prompts with zero runs (left join via JS bucketing).
 * Also returns grand totals across all runs.
 */
export async function GET() {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const prompts = await db.select().from(promptRegistry).orderBy(promptRegistry.id);
  const ids = prompts.map((p) => p.id);

  // Fetch all runs for these prompts — tiny dataset (4 prompts), JS aggregation is fine.
  const runs = ids.length
    ? await db
        .select()
        .from(evalRuns)
        .where(inArray(evalRuns.promptId, ids))
    : [];

  // Bucket runs by promptId.
  const byPrompt = new Map<number, typeof runs>();
  for (const r of runs) {
    if (r.promptId == null) continue;
    const list = byPrompt.get(r.promptId) ?? [];
    list.push(r);
    byPrompt.set(r.promptId, list);
  }

  // Per-prompt aggregation.
  const perPrompt = prompts
    .map((p) => {
      const list = byPrompt.get(p.id) ?? [];
      const runCount = list.length;
      const tokens = list.reduce((acc, r) => acc + (r.totalTokens ?? 0), 0);
      const costUsd = list.reduce((acc, r) => acc + (r.costUsd ?? 0), 0);
      // Max createdAt as ISO string — sort strings (ISO format sorts lexicographically).
      const lastRunAt = list.length
        ? list
            .map((r) => (r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt)))
            .sort()
            .at(-1) ?? null
        : null;
      return { id: p.id, key: p.key, title: p.title, runs: runCount, tokens, costUsd, lastRunAt };
    })
    // Order by costUsd desc then id asc.
    .sort((a, b) => b.costUsd - a.costUsd || a.id - b.id);

  // Grand totals across all runs.
  const totals = {
    runs: runs.length,
    tokens: runs.reduce((acc, r) => acc + (r.totalTokens ?? 0), 0),
    costUsd: runs.reduce((acc, r) => acc + (r.costUsd ?? 0), 0),
  };

  return NextResponse.json({ success: true, data: { totals, perPrompt } });
}
