import { NextResponse } from 'next/server';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import { getReviewItem } from '@/lib/brain/review';
import { applySuggestionToReviewItem, suggestReviewerForItem } from '@/lib/brain/review-routing';

/**
 * Compute and persist a suggested reviewer for the given review item.
 * Idempotent — calling again re-computes against current expertise/workload.
 * Returns `{ suggestion: ReviewerSuggestion | null }`.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'write' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const itemId = parseInt(id, 10);
  if (Number.isNaN(itemId)) {
    return NextResponse.json({ success: false, message: 'Invalid review item id' }, { status: 400 });
  }

  const item = await getReviewItem(result.client.id, itemId);
  if (!item) {
    return NextResponse.json({ success: false, message: 'Review item not found' }, { status: 404 });
  }

  try {
    const suggestion = await suggestReviewerForItem(result.client.id, item);
    await applySuggestionToReviewItem(result.client.id, item.id, suggestion);
    return NextResponse.json({ success: true, data: { suggestion } });
  } catch (err) {
    return NextResponse.json({
      success: false,
      message: err instanceof Error ? err.message : 'Failed to compute reviewer suggestion',
    }, { status: 500 });
  }
}
