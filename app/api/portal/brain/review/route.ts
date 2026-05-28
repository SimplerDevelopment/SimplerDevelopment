import { NextResponse } from 'next/server';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import { listReviewItems } from '@/lib/brain/review';
import { db } from '@/lib/db';
import { brainMeetings, type BrainReviewItemStatus } from '@/lib/db/schema';
import { eq, and, inArray } from 'drizzle-orm';

const VALID_STATUSES: ReadonlySet<string> = new Set(['pending', 'approved', 'rejected', 'edited']);

/**
 * Tenant-wide review queue. Lists every brain_ai_review_items row for the
 * active client, enriched with the source meeting (title + thread id) so the
 * UI can group items by conversation. Use ?status=pending|approved|rejected|edited
 * to filter; `all` (or omitted) returns everything.
 */
export async function GET(request: Request) {
  const result = await requireBrainEntitlement({ action: 'read' });
  if ('response' in result) return result.response;

  const url = new URL(request.url);
  const statusParam = url.searchParams.get('status') ?? 'pending';
  const status: BrainReviewItemStatus | undefined =
    statusParam === 'all' ? undefined :
    VALID_STATUSES.has(statusParam) ? (statusParam as BrainReviewItemStatus) :
    'pending';

  // Phase 6 — optional "items routed to me" filter via suggested reviewer.
  const reviewerParam = url.searchParams.get('suggestedReviewerPersonId');
  let suggestedReviewerPersonId: number | undefined;
  if (reviewerParam) {
    const parsed = parseInt(reviewerParam, 10);
    if (Number.isFinite(parsed) && parsed > 0) suggestedReviewerPersonId = parsed;
  }

  const items = await listReviewItems(result.client.id, { status, suggestedReviewerPersonId });

  // Enrich with source meeting titles so the UI can render conversation context
  // without a per-row API call. Only meetings owned by this tenant are returned
  // — listReviewItems already filtered by clientId, so this is just a join.
  const meetingIds = [...new Set(items
    .filter((i) => i.sourceType === 'meeting')
    .map((i) => i.sourceId))];

  const meetingsById: Record<number, { id: number; title: string; status: string; meetingDate: string | null; source: string; gmailThreadId: string | null }> = {};
  if (meetingIds.length > 0) {
    const rows = await db.select({
      id: brainMeetings.id,
      title: brainMeetings.title,
      status: brainMeetings.status,
      meetingDate: brainMeetings.meetingDate,
      source: brainMeetings.source,
      sourceMetadata: brainMeetings.sourceMetadata,
    }).from(brainMeetings)
      .where(and(
        eq(brainMeetings.clientId, result.client.id),
        inArray(brainMeetings.id, meetingIds),
      ));
    for (const r of rows) {
      const meta = (r.sourceMetadata ?? null) as { gmailThreadId?: string } | null;
      meetingsById[r.id] = {
        id: r.id,
        title: r.title,
        status: r.status,
        meetingDate: r.meetingDate ? r.meetingDate.toISOString() : null,
        source: r.source,
        gmailThreadId: meta?.gmailThreadId ?? null,
      };
    }
  }

  return NextResponse.json({
    success: true,
    data: { items, meetings: meetingsById },
  });
}
