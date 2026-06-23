import { NextResponse } from 'next/server';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import { mergeOrgUnits } from '@/lib/brain/org-units';

/**
 * POST /api/portal/brain/org-units/[id]/merge
 * Body: { targetOrgUnitId: number }
 *
 * `id` is the source unit to merge IN. `targetOrgUnitId` survives; source's
 * members + children move under target; source row is deleted.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'admin' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const sourceId = parseInt(id, 10);
  if (Number.isNaN(sourceId)) {
    return NextResponse.json({ success: false, message: 'Invalid org unit id' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || typeof body.targetOrgUnitId !== 'number') {
    return NextResponse.json({ success: false, message: 'targetOrgUnitId (number) is required' }, { status: 400 });
  }

  try {
    const merged = await mergeOrgUnits(result.client.id, result.userId, sourceId, body.targetOrgUnitId);
    if (!merged) return NextResponse.json({ success: false, message: 'Source org unit not found' }, { status: 404 });
    return NextResponse.json({ success: true, data: merged });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to merge org units';
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
