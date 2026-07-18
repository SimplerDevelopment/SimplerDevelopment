/**
 * POST /api/portal/brain/initiatives/[id]/reopen (no body)
 *
 * 400 when the initiative is not in a terminal status (the lib throws).
 */
import { NextResponse } from 'next/server';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import { reopenInitiative } from '@/lib/brain/initiatives';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'write' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const initiativeId = parseInt(id, 10);
  if (!Number.isFinite(initiativeId) || initiativeId <= 0) {
    return NextResponse.json({ success: false, message: 'Invalid initiative id' }, { status: 400 });
  }

  try {
    const updated = await reopenInitiative(result.client.id, result.userId, initiativeId);
    if (!updated) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Reopen failed';
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
