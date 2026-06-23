import { NextResponse } from 'next/server';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import {
  getOrgUnitById,
  updateOrgUnit,
  deleteOrgUnit,
  type UpdateOrgUnitInput,
} from '@/lib/brain/org-units';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'read' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const orgUnitId = parseInt(id, 10);
  if (Number.isNaN(orgUnitId)) {
    return NextResponse.json({ success: false, message: 'Invalid org unit id' }, { status: 400 });
  }

  const data = await getOrgUnitById(result.client.id, orgUnitId);
  if (!data) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true, data });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'write' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const orgUnitId = parseInt(id, 10);
  if (Number.isNaN(orgUnitId)) {
    return NextResponse.json({ success: false, message: 'Invalid org unit id' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ success: false, message: 'Invalid body' }, { status: 400 });
  }

  const patch: UpdateOrgUnitInput = {};
  if (typeof body.name === 'string') patch.name = body.name;
  if (body.description !== undefined) patch.description = body.description === null ? null : String(body.description);
  if (body.leadPersonId !== undefined) {
    patch.leadPersonId = body.leadPersonId === null ? null : (typeof body.leadPersonId === 'number' ? body.leadPersonId : undefined);
  }
  if (body.color !== undefined) patch.color = body.color === null ? null : String(body.color);
  if (body.icon !== undefined) patch.icon = body.icon === null ? null : String(body.icon);
  if (typeof body.sortOrder === 'number') patch.sortOrder = body.sortOrder;

  try {
    const updated = await updateOrgUnit(result.client.id, result.userId, orgUnitId, patch);
    if (!updated) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update org unit';
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'admin' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const orgUnitId = parseInt(id, 10);
  if (Number.isNaN(orgUnitId)) {
    return NextResponse.json({ success: false, message: 'Invalid org unit id' }, { status: 400 });
  }

  const url = new URL(request.url);
  const force = url.searchParams.get('force') === 'true';

  try {
    const ok = await deleteOrgUnit(result.client.id, result.userId, orgUnitId, { force });
    if (!ok) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true, data: { id: orgUnitId, deleted: true } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete org unit';
    return NextResponse.json({ success: false, message }, { status: 409 });
  }
}
