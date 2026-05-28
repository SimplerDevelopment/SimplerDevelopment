/**
 * POST /api/portal/brain/playbook-runs/[id]/steps/[stepId]/complete
 * Body: { resultEntityType?: string, resultEntityId?: number }
 *
 * Explicit "I did this manually" completion. Auto-advances the run.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import { completeStep } from '@/lib/brain/playbook-runs';

const schema = z.object({
  resultEntityType: z.string().max(50).optional(),
  resultEntityId: z.number().int().positive().optional(),
});

function parseId(s: string): number | null {
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; stepId: string }> },
) {
  const result = await requireBrainEntitlement({ action: 'write' });
  if ('response' in result) return result.response;

  const { id, stepId } = await params;
  const runId = parseId(id);
  const stepIdNum = parseId(stepId);
  if (runId === null || stepIdNum === null) {
    return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });
  }

  const json = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(json ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: 'Invalid body', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const out = await completeStep(
      result.client.id,
      result.userId,
      runId,
      stepIdNum,
      {
        resultEntityType: parsed.data.resultEntityType,
        resultEntityId: parsed.data.resultEntityId,
      },
    );
    if (!out) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true, data: out });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Complete failed';
    console.error('[brain.playbook-runs.complete] failed', { runId, stepId: stepIdNum, err: message });
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
