/**
 * GET /api/portal/brain/topics/[id]/entities
 *
 * List entities (notes, meetings, tasks, decisions, relationship overlays)
 * attached to a topic. Returns both a flat array and a per-entityType grouping
 * so the admin UI can render a tabbed/sectioned list without re-grouping
 * client-side.
 *
 *   ?entityType=note    — optional filter; when set, returns only matching rows
 *                         (still in the `{ items, byType }` envelope).
 *
 * Wave 3b — backs the topic-admin side panel + the editor pane's
 * "what's attached to this topic" surface.
 */
import { NextResponse } from 'next/server';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import { listEntitiesForTopic } from '@/lib/brain/topics';
import type { BrainTopicEntityType } from '@/lib/db/schema';

const VALID_ENTITY_TYPES: BrainTopicEntityType[] = [
  'note', 'meeting', 'task', 'decision', 'relationship_overlay',
];

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'read' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const topicId = parseInt(id, 10);
  if (Number.isNaN(topicId)) {
    return NextResponse.json({ success: false, message: 'Invalid topic id' }, { status: 400 });
  }

  const url = new URL(request.url);
  const entityTypeRaw = url.searchParams.get('entityType');
  const entityType: BrainTopicEntityType | null = entityTypeRaw && VALID_ENTITY_TYPES.includes(entityTypeRaw as BrainTopicEntityType)
    ? (entityTypeRaw as BrainTopicEntityType)
    : null;

  const out = await listEntitiesForTopic(result.client.id, topicId);
  if (entityType) {
    const filtered = out.items.filter((r) => r.entityType === entityType);
    return NextResponse.json({
      success: true,
      data: {
        items: filtered,
        byType: { ...emptyByType(), [entityType]: filtered },
      },
    });
  }
  return NextResponse.json({ success: true, data: out });
}

function emptyByType() {
  return { note: [], meeting: [], task: [], decision: [], relationship_overlay: [] };
}
