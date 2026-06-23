import { NextResponse } from 'next/server';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import { moveOrgUnit } from '@/lib/brain/org-units';

/**
 * POST /api/portal/brain/org-units/[id]/move
 * Body: { newParentId: number | null }
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'write' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const orgUnitId = parseInt(id, 10);
  if (Number.isNaN(orgUnitId)) {
    return NextResponse.json({ success: false, message: 'Invalid org unit id' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || !('newParentId' in body)) {
    return NextResponse.json({ success: false, message: 'newParentId is required (number | null)' }, { status: 400 });
  }
  const newParentId: number | null =
    body.newParentId === null ? null
    : (typeof body.newParentId === 'number' ? body.newParentId : NaN);
  if (newParentId !== null && Number.isNaN(newParentId)) {
    return NextResponse.json({ success: false, message: 'newParentId must be a number or null' }, { status: 400 });
  }

  try {
    const updated = await moveOrgUnit(result.client.id, result.userId, orgUnitId, newParentId);
    if (!updated) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to move org unit';
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
