import { NextResponse } from 'next/server';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import { getPersonById, updatePerson, deletePerson } from '@/lib/brain/people';
import type { BrainPersonStatus } from '@/lib/db/schema/brain';

const ALLOWED_STATUS: BrainPersonStatus[] = ['active', 'inactive', 'departed'];

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'read' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const personId = parseInt(id, 10);
  if (Number.isNaN(personId)) {
    return NextResponse.json({ success: false, message: 'Invalid person id' }, { status: 400 });
  }
  const person = await getPersonById(result.client.id, personId);
  if (!person) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true, data: person });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'write' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const personId = parseInt(id, 10);
  if (Number.isNaN(personId)) {
    return NextResponse.json({ success: false, message: 'Invalid person id' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ success: false, message: 'Invalid body' }, { status: 400 });
  }
  if (body.status !== undefined && !ALLOWED_STATUS.includes(body.status)) {
    return NextResponse.json(
      { success: false, message: `Invalid status. Allowed: ${ALLOWED_STATUS.join(', ')}` },
      { status: 400 },
    );
  }

  try {
    const updated = await updatePerson(result.client.id, result.userId, personId, {
      fullName: typeof body.fullName === 'string' ? body.fullName : undefined,
      email: body.email === null ? null : (typeof body.email === 'string' ? body.email : undefined),
      managerId: body.managerId === null ? null : (typeof body.managerId === 'number' ? body.managerId : undefined),
      title: body.title === null ? null : (typeof body.title === 'string' ? body.title : undefined),
      startDate: body.startDate === null ? null : (body.startDate ? new Date(body.startDate) : undefined),
      endDate: body.endDate === null ? null : (body.endDate ? new Date(body.endDate) : undefined),
      status: ALLOWED_STATUS.includes(body.status) ? body.status : undefined,
      notes: body.notes === null ? null : (typeof body.notes === 'string' ? body.notes : undefined),
      profileUrls: Array.isArray(body.profileUrls) ? body.profileUrls : undefined,
    });
    if (!updated) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Update failed';
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'admin' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const personId = parseInt(id, 10);
  if (Number.isNaN(personId)) {
    return NextResponse.json({ success: false, message: 'Invalid person id' }, { status: 400 });
  }
  const ok = await deletePerson(result.client.id, result.userId, personId);
  if (!ok) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true, data: { id: personId, deleted: true } });
}
