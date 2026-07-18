import { NextResponse } from 'next/server';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import { addMember, removeMember, getOrgUnitById } from '@/lib/brain/org-units';

/**
 * GET    /api/portal/brain/org-units/[id]/members — list members of a unit.
 * POST   /api/portal/brain/org-units/[id]/members — add (or upsert) a member.
 *   Body: { personId, primary?, roleInUnit? }
 * DELETE /api/portal/brain/org-units/[id]/members — remove a member.
 *   Body: { personId } OR query ?personId=…
 */

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'read' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const orgUnitId = parseInt(id, 10);
  if (Number.isNaN(orgUnitId)) {
    return NextResponse.json({ success: false, message: 'Invalid org unit id' }, { status: 400 });
  }

  const details = await getOrgUnitById(result.client.id, orgUnitId);
  if (!details) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true, data: { members: details.members } });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'write' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const orgUnitId = parseInt(id, 10);
  if (Number.isNaN(orgUnitId)) {
    return NextResponse.json({ success: false, message: 'Invalid org unit id' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || typeof body.personId !== 'number') {
    return NextResponse.json({ success: false, message: 'personId (number) is required' }, { status: 400 });
  }

  try {
    const created = await addMember(result.client.id, result.userId, {
      orgUnitId,
      personId: body.personId,
      primary: body.primary === true,
      roleInUnit: typeof body.roleInUnit === 'string' ? body.roleInUnit : null,
    });
    return NextResponse.json({ success: true, data: created });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to add member';
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'write' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const orgUnitId = parseInt(id, 10);
  if (Number.isNaN(orgUnitId)) {
    return NextResponse.json({ success: false, message: 'Invalid org unit id' }, { status: 400 });
  }

  let personId: number | null = null;
  // Allow body OR query — body is preferred for symmetry with POST.
  const body = await request.json().catch(() => null);
  if (body && typeof body === 'object' && typeof body.personId === 'number') {
    personId = body.personId;
  } else {
    const url = new URL(request.url);
    const fromQuery = url.searchParams.get('personId');
    if (fromQuery) {
      const parsed = parseInt(fromQuery, 10);
      if (!Number.isNaN(parsed)) personId = parsed;
    }
  }

  if (personId === null) {
    return NextResponse.json({ success: false, message: 'personId is required' }, { status: 400 });
  }

  const ok = await removeMember(result.client.id, result.userId, { orgUnitId, personId });
  if (!ok) return NextResponse.json({ success: false, message: 'Membership not found' }, { status: 404 });
  return NextResponse.json({ success: true, data: { orgUnitId, personId, removed: true } });
}
