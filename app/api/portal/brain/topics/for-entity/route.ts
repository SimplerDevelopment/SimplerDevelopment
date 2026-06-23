/**
 * GET /api/portal/brain/topics/for-entity?entityType=note&entityId=N
 *
 * Returns the topic IDs (and slim summaries) attached to a single entity. The
 * editor pane uses this to seed the TopicPicker for a note that's just been
 * opened — without it, the picker would have to scan every topic with
 * `listEntitiesForTopic`, which is wasteful.
 *
 * Response shape mirrors the rest of the topics surface:
 *   { success: true, data: { topicIds: number[], topics: TopicSummary[] } }
 *
 * Wave 3b — see .planning/brain-restructure/PLAN.md.
 */
import { NextResponse } from 'next/server';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import { db } from '@/lib/db';
import { brainEntityTopics, brainTopics, type BrainTopicEntityType } from '@/lib/db/schema';
import { and, eq, inArray } from 'drizzle-orm';

const VALID_ENTITY_TYPES: BrainTopicEntityType[] = [
  'note', 'meeting', 'task', 'decision', 'relationship_overlay', 'initiative', 'person',
];

export async function GET(request: Request) {
  const result = await requireBrainEntitlement({ action: 'read' });
  if ('response' in result) return result.response;

  const url = new URL(request.url);
  const entityTypeRaw = url.searchParams.get('entityType');
  const entityIdRaw = url.searchParams.get('entityId');
  if (!entityTypeRaw || !VALID_ENTITY_TYPES.includes(entityTypeRaw as BrainTopicEntityType)) {
    return NextResponse.json(
      { success: false, message: `entityType must be one of: ${VALID_ENTITY_TYPES.join(', ')}` },
      { status: 400 },
    );
  }
  const entityType = entityTypeRaw as BrainTopicEntityType;
  const entityId = entityIdRaw ? parseInt(entityIdRaw, 10) : NaN;
  if (Number.isNaN(entityId)) {
    return NextResponse.json(
      { success: false, message: 'entityId is required (number)' },
      { status: 400 },
    );
  }

  // Pull the topic ids attached to this entity. Tenant-scoped via clientId.
  const links = await db.select({ topicId: brainEntityTopics.topicId })
    .from(brainEntityTopics)
    .where(and(
      eq(brainEntityTopics.clientId, result.client.id),
      eq(brainEntityTopics.entityType, entityType),
      eq(brainEntityTopics.entityId, entityId),
    ));
  const topicIds = links.map((r) => r.topicId);

  if (topicIds.length === 0) {
    return NextResponse.json({ success: true, data: { topicIds: [], topics: [] } });
  }

  // Slim summaries for the picker — id/name/path/icon/color is enough.
  const topics = await db.select({
    id: brainTopics.id,
    name: brainTopics.name,
    path: brainTopics.path,
    icon: brainTopics.icon,
    color: brainTopics.color,
  }).from(brainTopics)
    .where(and(
      eq(brainTopics.clientId, result.client.id),
      inArray(brainTopics.id, topicIds),
    ));

  return NextResponse.json({ success: true, data: { topicIds, topics } });
}
