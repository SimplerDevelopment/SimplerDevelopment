import { NextResponse } from 'next/server';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import { getExpertiseTagById, updateExpertiseTag, deleteExpertiseTag } from '@/lib/brain/people';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'read' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const tagId = parseInt(id, 10);
  if (Number.isNaN(tagId)) {
    return NextResponse.json({ success: false, message: 'Invalid tag id' }, { status: 400 });
  }
  const data = await getExpertiseTagById(result.client.id, tagId);
  if (!data) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true, data });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'write' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const tagId = parseInt(id, 10);
  if (Number.isNaN(tagId)) {
    return NextResponse.json({ success: false, message: 'Invalid tag id' }, { status: 400 });
  }
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ success: false, message: 'Invalid body' }, { status: 400 });
  }

  const updated = await updateExpertiseTag(result.client.id, result.userId, tagId, {
    name: typeof body.name === 'string' ? body.name : undefined,
    description: body.description === null ? null : (typeof body.description === 'string' ? body.description : undefined),
  });
  if (!updated) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'admin' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const tagId = parseInt(id, 10);
  if (Number.isNaN(tagId)) {
    return NextResponse.json({ success: false, message: 'Invalid tag id' }, { status: 400 });
  }

  const url = new URL(request.url);
  const force = url.searchParams.get('force') === 'true';

  const outcome = await deleteExpertiseTag(result.client.id, result.userId, tagId, { force });
  if (!outcome.deleted) {
    if (outcome.reason === 'not_found') {
      return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    }
    if (outcome.reason === 'in_use') {
      return NextResponse.json(
        { success: false, message: 'Tag is attached to one or more people. Pass ?force=true to delete anyway.', code: 'TAG_IN_USE' },
        { status: 409 },
      );
    }
  }
  return NextResponse.json({ success: true, data: { id: tagId, deleted: true, force } });
}
