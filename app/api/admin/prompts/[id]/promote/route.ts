import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { promptRegistry, promptVersions } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { requireAdmin } from '../../_auth';
import { setActiveVersion, latestDonePassRate } from '@/lib/ai/evals/versions';
import { enqueueEvalRun } from '@/lib/ai/evals/job';
import { logPromptAudit } from '@/lib/ai/evals/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/admin/prompts/[id]/promote — make a version the active one.
 *
 * Body: { versionId: number }
 *
 * Soft regression gate: if both the outgoing-active and the target version have
 * completed runs, we compute the pass-rate delta and WARN on a regression — but
 * we never block (the admin decides). On promote we enqueue a fresh eval run for
 * the new active version (trigger='promote') so the dashboard reflects it.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const promptId = parseInt(id, 10);
  if (Number.isNaN(promptId)) {
    return NextResponse.json({ success: false, message: 'Invalid prompt id' }, { status: 400 });
  }

  let body: { versionId?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { status: 400 });
  }
  const versionId = Number(body.versionId);
  if (!Number.isInteger(versionId)) {
    return NextResponse.json({ success: false, message: 'versionId (number) is required' }, { status: 400 });
  }

  const [prompt] = await db.select().from(promptRegistry).where(eq(promptRegistry.id, promptId)).limit(1);
  if (!prompt) return NextResponse.json({ success: false, message: 'Prompt not found' }, { status: 404 });
  if (prompt.activeVersionId === versionId) {
    return NextResponse.json({ success: false, message: 'That version is already active' }, { status: 409 });
  }

  // Target must belong to this prompt.
  const [target] = await db
    .select({ id: promptVersions.id, version: promptVersions.version })
    .from(promptVersions)
    .where(and(eq(promptVersions.id, versionId), eq(promptVersions.promptId, promptId)))
    .limit(1);
  if (!target) return NextResponse.json({ success: false, message: 'Version not found for this prompt' }, { status: 404 });

  // Soft regression gate (informational): compare latest completed-run pass
  // rates of the outgoing active version vs the target.
  const fromRate = prompt.activeVersionId ? await latestDonePassRate(prompt.activeVersionId) : null;
  const toRate = await latestDonePassRate(versionId);
  let regression: { warned: boolean; delta: number | null; message: string | null } = {
    warned: false,
    delta: null,
    message: null,
  };
  if (fromRate != null && toRate != null) {
    const delta = toRate - fromRate;
    regression = {
      warned: delta < 0,
      delta,
      message: delta < 0
        ? `Pass rate would drop ${Math.round(Math.abs(delta) * 100)}% vs the current active version.`
        : null,
    };
  }

  const result = await setActiveVersion(promptId, versionId);
  if (!result.ok) {
    return NextResponse.json({ success: false, message: result.error ?? 'Promote failed' }, { status: 400 });
  }

  // Re-evaluate the newly-active version so its results are current.
  const actorId = parseInt((session.user as { id: string }).id, 10);
  let enqueuedRunId: number | null = null;
  try {
    enqueuedRunId = await enqueueEvalRun({
      suiteId: prompt.key,
      promptId,
      promptVersionId: versionId,
      trigger: 'promote',
      createdBy: Number.isNaN(actorId) ? undefined : actorId,
    });
  } catch (err) {
    console.error('[promote] failed to enqueue post-promote run:', err);
  }

  await logPromptAudit({
    actorUserId: Number.isNaN(actorId) ? null : actorId,
    action: 'promote',
    promptId,
    versionId,
    detail: { fromVersionId: result.previousVersionId, toVersionId: versionId, passRateDelta: regression.delta },
  });

  return NextResponse.json({
    success: true,
    data: { activeVersionId: versionId, enqueuedRunId, regression },
  });
}
