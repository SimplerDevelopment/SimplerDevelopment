/**
 * POST /api/portal/brain/topics/[id]/merge
 *   Body: { targetTopicId: number }
 *
 * Fold [id] (source) into targetTopicId. Reattaches all entity-links, reparents
 * source's children under target, then deletes source. Transactional.
 *
 * Phase 1 brain-restructure (Wave 2b).
 */
import { NextResponse } from 'next/server';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import { mergeTopic } from '@/lib/brain/topics';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'admin' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const sourceId = parseInt(id, 10);
  if (Number.isNaN(sourceId)) {
    return NextResponse.json({ success: false, message: 'Invalid topic id' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const targetTopicId = body && typeof body.targetTopicId === 'number' ? body.targetTopicId : NaN;
  if (Number.isNaN(targetTopicId)) {
    return NextResponse.json({ success: false, message: 'targetTopicId is required (number)' }, { status: 400 });
  }

  try {
    const outcome = await mergeTopic(result.client.id, result.userId, sourceId, targetTopicId);
    if (!outcome) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true, data: outcome });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Merge failed';
    const status = /descendant|same/i.test(message) ? 409 : 500;
    return NextResponse.json({ success: false, message }, { status });
  }
}
