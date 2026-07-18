/**
 * POST /api/portal/brain/playbook-runs/[id]/abort
 * Body: { reason?: string }
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import { abortRun } from '@/lib/brain/playbook-runs';

const schema = z.object({
  reason: z.string().max(2000).optional(),
});

function parseId(s: string): number | null {
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'write' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const runId = parseId(id);
  if (runId === null) {
    return NextResponse.json({ success: false, message: 'Invalid run id' }, { status: 400 });
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
    const out = await abortRun(result.client.id, result.userId, runId, { reason: parsed.data.reason });
    if (!out) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true, data: { id: out.id, status: out.status } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Abort failed';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
