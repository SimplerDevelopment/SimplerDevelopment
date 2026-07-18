/**
 * Brain topics — single-topic GET / PATCH / DELETE.
 *
 *   GET     → topic + breadcrumb (ancestor chain)
 *   PATCH   → partial update (name/description/color/icon/sortOrder). NB:
 *             rename keeps slug stable; parent changes go through /move.
 *   DELETE  → calls deleteTopic. `?force=true` cascades attached entity-links.
 *             Refuses if the topic has any children regardless of force —
 *             merge or delete the children first.
 *
 * Phase 1 brain-restructure (Wave 2b).
 */
import { NextResponse } from 'next/server';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import { getTopicById, updateTopic, deleteTopic } from '@/lib/brain/topics';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'read' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const topicId = parseInt(id, 10);
  if (Number.isNaN(topicId)) {
    return NextResponse.json({ success: false, message: 'Invalid topic id' }, { status: 400 });
  }
  const topic = await getTopicById(result.client.id, topicId);
  if (!topic) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true, data: topic });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'write' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const topicId = parseInt(id, 10);
  if (Number.isNaN(topicId)) {
    return NextResponse.json({ success: false, message: 'Invalid topic id' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ success: false, message: 'Invalid body' }, { status: 400 });
  }

  const updated = await updateTopic(result.client.id, result.userId, topicId, {
    name: typeof body.name === 'string' ? body.name : undefined,
    description: body.description === null ? null : (typeof body.description === 'string' ? body.description : undefined),
    color: body.color === null ? null : (typeof body.color === 'string' ? body.color : undefined),
    icon: body.icon === null ? null : (typeof body.icon === 'string' ? body.icon : undefined),
    sortOrder: typeof body.sortOrder === 'number' ? body.sortOrder : undefined,
  });

  if (!updated) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'admin' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const topicId = parseInt(id, 10);
  if (Number.isNaN(topicId)) {
    return NextResponse.json({ success: false, message: 'Invalid topic id' }, { status: 400 });
  }

  const url = new URL(request.url);
  const force = url.searchParams.get('force') === 'true';

  const outcome = await deleteTopic(result.client.id, result.userId, topicId, { force });
  if (!outcome.deleted) {
    if (outcome.reason === 'not_found') {
      return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    }
    if (outcome.reason === 'has_children') {
      return NextResponse.json(
        { success: false, message: 'Topic has children — delete or merge them first', reason: 'has_children' },
        { status: 409 },
      );
    }
    if (outcome.reason === 'has_entities') {
      return NextResponse.json(
        { success: false, message: 'Topic has attached entities — pass ?force=true to detach and delete', reason: 'has_entities' },
        { status: 409 },
      );
    }
    return NextResponse.json({ success: false, message: 'Delete failed' }, { status: 500 });
  }
  return NextResponse.json({ success: true, data: { id: topicId, deleted: true } });
}
