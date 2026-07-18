import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { promptRegistry, promptVersions, evalRuns } from '@/lib/db/schema';
import { desc, inArray } from 'drizzle-orm';
import { requireStaff } from './_auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/prompts — leaderboard.
 *
 * One row per registry prompt with its latest run summary and a pass-rate
 * trend (latest completed run vs. the prior completed run).
 */
export async function GET() {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const prompts = await db.select().from(promptRegistry).orderBy(promptRegistry.id);
  const ids = prompts.map((p) => p.id);

  // All runs for these prompts, newest first — bucketed per prompt in JS so the
  // leaderboard is one query rather than N. Small N (4 prompts); fine.
  const runs = ids.length
    ? await db
        .select()
        .from(evalRuns)
        .where(inArray(evalRuns.promptId, ids))
        .orderBy(desc(evalRuns.createdAt))
    : [];

  // Resolve each active version's human version NUMBER (the row id is not the
  // version) so the leaderboard can show "v1" rather than the registry id.
  const activeVersionIds = prompts.map((p) => p.activeVersionId).filter((v): v is number => v != null);
  const versionRows = activeVersionIds.length
    ? await db
        .select({ id: promptVersions.id, version: promptVersions.version })
        .from(promptVersions)
        .where(inArray(promptVersions.id, activeVersionIds))
    : [];
  const versionNumById = new Map(versionRows.map((v) => [v.id, v.version]));

  const byPrompt = new Map<number, typeof runs>();
  for (const r of runs) {
    if (r.promptId == null) continue;
    const list = byPrompt.get(r.promptId) ?? [];
    list.push(r);
    byPrompt.set(r.promptId, list);
  }

  const rows = prompts.map((p) => {
    const list = byPrompt.get(p.id) ?? [];
    const latest = list[0] ?? null;
    const doneRuns = list.filter((r) => r.status === 'done');
    let trend: 'up' | 'down' | 'flat' | null = null;
    if (doneRuns.length >= 2) {
      const delta = doneRuns[0].passRate - doneRuns[1].passRate;
      trend = Math.abs(delta) < 1e-6 ? 'flat' : delta > 0 ? 'up' : 'down';
    }
    return {
      id: p.id,
      key: p.key,
      title: p.title,
      activeVersionId: p.activeVersionId,
      activeVersion: p.activeVersionId != null ? versionNumById.get(p.activeVersionId) ?? null : null,
      latestRun: latest
        ? {
            id: latest.id,
            status: latest.status,
            passRate: latest.passRate,
            passed: latest.passed,
            total: latest.total,
            costUsd: latest.costUsd,
            createdAt: latest.createdAt,
            finishedAt: latest.finishedAt,
          }
        : null,
      trend,
    };
  });

  return NextResponse.json({ success: true, data: rows });
}
