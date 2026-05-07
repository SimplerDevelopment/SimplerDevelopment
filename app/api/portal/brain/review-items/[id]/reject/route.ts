import { NextResponse } from 'next/server';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import { rejectReviewItem } from '@/lib/brain/review';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'write' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const itemId = parseInt(id, 10);
  if (Number.isNaN(itemId)) {
    return NextResponse.json({ success: false, message: 'Invalid review item id' }, { status: 400 });
  }
  const body = await request.json().catch(() => ({}));
  const reason = typeof body?.reason === 'string' ? body.reason.slice(0, 500) : undefined;

  const updated = await rejectReviewItem({
    clientId: result.client.id,
    itemId,
    actorId: result.userId,
    reason,
  });
  if (!updated) {
    return NextResponse.json({ success: false, message: 'Review item not found' }, { status: 404 });
  }
  return NextResponse.json({ success: true, data: updated });
}
