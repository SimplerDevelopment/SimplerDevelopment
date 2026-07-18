/**
 * POST /api/portal/brain/topics/[id]/move
 *   Body: { newParentId: number | null }
 *
 * Re-parent a topic. Refuses to create a cycle (newParentId must not be a
 * descendant of [id]). Recomputes the affected subtree's path atomically.
 *
 * Phase 1 brain-restructure (Wave 2b).
 */
import { NextResponse } from 'next/server';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import { moveTopic } from '@/lib/brain/topics';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'write' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const topicId = parseInt(id, 10);
  if (Number.isNaN(topicId)) {
    return NextResponse.json({ success: false, message: 'Invalid topic id' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || !('newParentId' in body)) {
    return NextResponse.json({ success: false, message: 'newParentId is required (number or null)' }, { status: 400 });
  }
  const newParentId =
    body.newParentId === null ? null
    : typeof body.newParentId === 'number' ? body.newParentId
    : undefined;
  if (newParentId === undefined) {
    return NextResponse.json({ success: false, message: 'newParentId must be number or null' }, { status: 400 });
  }

  try {
    const moved = await moveTopic(result.client.id, result.userId, topicId, newParentId);
    if (!moved) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true, data: moved });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Move failed';
    const status = /cycle|descendant|itself/i.test(message) ? 409 : /not found/i.test(message) ? 400 : 500;
    return NextResponse.json({ success: false, message }, { status });
  }
}
