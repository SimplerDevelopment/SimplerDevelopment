/**
 * POST /api/portal/brain/playbook-runs/[id]/advance
 * Body: (none)
 *
 * Resolves any active branch steps + chains forward. Auto-completes the run
 * if no active steps remain.
 */
import { NextResponse } from 'next/server';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import { advanceRun } from '@/lib/brain/playbook-runs';

function parseId(s: string): number | null {
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'write' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const runId = parseId(id);
  if (runId === null) {
    return NextResponse.json({ success: false, message: 'Invalid run id' }, { status: 400 });
  }

  try {
    const out = await advanceRun(result.client.id, result.userId, runId);
    if (!out) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true, data: out });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Advance failed';
    console.error('[brain.playbook-runs.advance] failed', { runId, err: message });
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
