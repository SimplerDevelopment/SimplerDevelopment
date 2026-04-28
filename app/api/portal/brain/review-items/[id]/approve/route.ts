import { NextResponse } from 'next/server';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { approveReviewItem } from '@/lib/brain/review';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await authorizePortal({ action: 'write' });
  if (isAuthError(result)) return result.response;

  const { id } = await params;
  const itemId = parseInt(id, 10);
  if (Number.isNaN(itemId)) {
    return NextResponse.json({ success: false, message: 'Invalid review item id' }, { status: 400 });
  }
  const body = await request.json().catch(() => ({}));
  const editedPayload = body && typeof body === 'object' && body.editedPayload && typeof body.editedPayload === 'object'
    ? body.editedPayload
    : undefined;

  try {
    const out = await approveReviewItem({
      clientId: result.client.id,
      itemId,
      actorId: result.userId,
      editedPayload,
    });
    return NextResponse.json({ success: true, data: out });
  } catch (err) {
    return NextResponse.json({
      success: false,
      message: err instanceof Error ? err.message : 'Failed to approve review item',
    }, { status: 400 });
  }
}
