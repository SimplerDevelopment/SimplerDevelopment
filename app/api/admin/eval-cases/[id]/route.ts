import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { evalCases } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { requireAdmin } from '../../prompts/_auth';
import { logPromptAudit } from '@/lib/ai/evals/audit';

export const dynamic = 'force-dynamic';

/**
 * PUT /api/admin/eval-cases/[id] — update an eval case.
 *
 * Body (any subset): { caseKey?, input?, expected?, mockOutput?, enabled?, order? }
 * If the body is ONLY { enabled } → audit 'toggle_case', else 'edit_case'.
 * Requires admin.
 */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const caseId = parseInt(id, 10);
  if (Number.isNaN(caseId)) {
    return NextResponse.json({ success: false, message: 'Invalid case id' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { status: 400 });
  }

  const bodyObj = body as Record<string, unknown>;
  const keys = Object.keys(bodyObj);

  if (keys.length === 0) {
    return NextResponse.json({ success: false, message: 'No fields provided to update' }, { status: 400 });
  }

  // 404 check
  const [existing] = await db.select({ id: evalCases.id }).from(evalCases).where(eq(evalCases.id, caseId)).limit(1);
  if (!existing) {
    return NextResponse.json({ success: false, message: 'Eval case not found' }, { status: 404 });
  }

  // Collect allowed field mutations, then spread into a typed set() call.
  const allowed: Record<string, unknown> = {};
  if ('caseKey' in bodyObj && typeof bodyObj.caseKey === 'string') allowed.caseKey = bodyObj.caseKey.trim();
  if ('input' in bodyObj) allowed.input = bodyObj.input;
  if ('expected' in bodyObj) allowed.expected = bodyObj.expected ?? null;
  if ('mockOutput' in bodyObj) allowed.mockOutput = bodyObj.mockOutput ?? null;
  if ('enabled' in bodyObj && typeof bodyObj.enabled === 'boolean') allowed.enabled = bodyObj.enabled;
  if ('order' in bodyObj && typeof bodyObj.order === 'number') allowed.order = bodyObj.order;

  const [updated] = await db
    .update(evalCases)
    .set({ ...allowed, updatedAt: new Date() })
    .where(eq(evalCases.id, caseId))
    .returning();

  const actorId = parseInt((session.user as { id: string }).id, 10);

  // Determine audit action: toggle vs edit
  const isToggleOnly = keys.length === 1 && keys[0] === 'enabled';
  await logPromptAudit({
    actorUserId: actorId,
    action: isToggleOnly ? 'toggle_case' : 'edit_case',
    promptId: null,
    versionId: null,
    detail: { caseId, changes: allowed },
  });

  return NextResponse.json({ success: true, data: updated });
}
