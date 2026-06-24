import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { promptRegistry } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { requireAdmin } from '../../_auth';
import { setActiveVersion } from '@/lib/ai/evals/versions';
import { logPromptAudit } from '@/lib/ai/evals/audit';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/prompts/[id]/rollback — re-activate a prior version.
 *
 * Body: { versionId: number }  (the version to roll back TO)
 *
 * Mechanically the same atomic active-version swap as promote, but semantically
 * a revert to a known prior version — so no soft gate and no re-run is enqueued
 * (the version already has run history). Recorded distinctly in the audit log.
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

  const result = await setActiveVersion(promptId, versionId);
  if (!result.ok) {
    return NextResponse.json({ success: false, message: result.error ?? 'Rollback failed' }, { status: 400 });
  }

  const actorId = parseInt((session.user as { id: string }).id, 10);
  await logPromptAudit({
    actorUserId: Number.isNaN(actorId) ? null : actorId,
    action: 'rollback',
    promptId,
    versionId,
    detail: { fromVersionId: result.previousVersionId, toVersionId: versionId },
  });

  return NextResponse.json({ success: true, data: { activeVersionId: versionId } });
}
