import { NextResponse } from 'next/server';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import { getNote, updateNote, deleteNote } from '@/lib/brain/notes';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'read' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const noteId = parseInt(id, 10);
  if (Number.isNaN(noteId)) {
    return NextResponse.json({ success: false, message: 'Invalid note id' }, { status: 400 });
  }
  const note = await getNote(result.client.id, noteId);
  if (!note) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true, data: note });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'write' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const noteId = parseInt(id, 10);
  if (Number.isNaN(noteId)) {
    return NextResponse.json({ success: false, message: 'Invalid note id' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ success: false, message: 'Invalid body' }, { status: 400 });
  }

  const updated = await updateNote(result.client.id, noteId, {
    title: typeof body.title === 'string' ? body.title : undefined,
    body: typeof body.body === 'string' ? body.body : undefined,
    tags: Array.isArray(body.tags) ? body.tags.filter((t: unknown) => typeof t === 'string') : undefined,
    meetingId: body.meetingId === null ? null : (typeof body.meetingId === 'number' ? body.meetingId : undefined),
    relationshipOverlayId: body.relationshipOverlayId === null ? null : (typeof body.relationshipOverlayId === 'number' ? body.relationshipOverlayId : undefined),
    companyId: body.companyId === null ? null : (typeof body.companyId === 'number' ? body.companyId : undefined),
    dealId: body.dealId === null ? null : (typeof body.dealId === 'number' ? body.dealId : undefined),
    contactId: body.contactId === null ? null : (typeof body.contactId === 'number' ? body.contactId : undefined),
    confidentialityLevel: ['standard', 'restricted', 'confidential'].includes(body.confidentialityLevel)
      ? body.confidentialityLevel : undefined,
    pinned: typeof body.pinned === 'boolean' ? body.pinned : undefined,
  }, result.userId);

  if (!updated) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'admin' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const noteId = parseInt(id, 10);
  if (Number.isNaN(noteId)) {
    return NextResponse.json({ success: false, message: 'Invalid note id' }, { status: 400 });
  }

  try {
    const before = await getNote(result.client.id, noteId);
    if (!before) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    const wasSoftDeleted = before.deletedAt !== null;
    const ok = await deleteNote(result.client.id, noteId, result.userId, wasSoftDeleted ? { force: true } : {});
    if (!ok) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    return NextResponse.json({
      success: true,
      data: { id: noteId, deleted: wasSoftDeleted ? 'hard' as const : 'soft' as const },
    });
  } catch (err) {
    console.error('[brain.knowledge] delete failed', { noteId, clientId: result.client.id, err });
    const message = err instanceof Error ? err.message : 'Delete failed';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
