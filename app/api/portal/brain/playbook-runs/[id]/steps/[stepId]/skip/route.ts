/**
 * POST /api/portal/brain/playbook-runs/[id]/steps/[stepId]/skip
 * Body: { reason?: string }
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import { skipStep } from '@/lib/brain/playbook-runs';

const schema = z.object({
  reason: z.string().max(2000).optional(),
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
    const out = await skipStep(
      result.client.id,
      result.userId,
      runId,
      stepIdNum,
      { reason: parsed.data.reason },
    );
    if (!out) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true, data: out });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Skip failed';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
