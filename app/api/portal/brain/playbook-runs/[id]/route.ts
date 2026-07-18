/**
 * GET /api/portal/brain/playbook-runs/[id] — run detail + steps + links
 */
import { NextResponse } from 'next/server';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import { getRunById } from '@/lib/brain/playbook-runs';

function parseId(s: string): number | null {
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'read' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const runId = parseId(id);
  if (runId === null) {
    return NextResponse.json({ success: false, message: 'Invalid run id' }, { status: 400 });
  }

  const data = await getRunById(result.client.id, runId);
  if (!data) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true, data });
}
