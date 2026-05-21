/**
 * Brain topic attach/detach.
 *
 *   POST   /api/portal/brain/topics/attach
 *     Body: { entityType, entityId, topicIds[] }
 *     → idempotent bulk-attach. Duplicates (per the unique index) are skipped.
 *
 *   DELETE /api/portal/brain/topics/attach
 *     Body: { entityType, entityId, topicIds[] }
 *     → bulk detach.
 *
 * Phase 1 brain-restructure (Wave 2b).
 */
import { NextResponse } from 'next/server';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import { db } from '@/lib/db';
import { attachTopics, detachTopics } from '@/lib/brain/topics';
import type { BrainTopicEntityType } from '@/lib/db/schema';

const VALID_ENTITY_TYPES: BrainTopicEntityType[] = ['note', 'meeting', 'task', 'decision', 'relationship_overlay'];

function parseBody(body: unknown): { entityType: BrainTopicEntityType; entityId: number; topicIds: number[] } | string {
  if (!body || typeof body !== 'object') return 'Invalid body';
  const b = body as Record<string, unknown>;
  if (typeof b.entityType !== 'string' || !VALID_ENTITY_TYPES.includes(b.entityType as BrainTopicEntityType)) {
    return `entityType must be one of: ${VALID_ENTITY_TYPES.join(', ')}`;
  }
  if (typeof b.entityId !== 'number' || !Number.isFinite(b.entityId)) {
    return 'entityId is required (number)';
  }
  if (!Array.isArray(b.topicIds) || b.topicIds.length === 0) {
    return 'topicIds is required (non-empty number[])';
  }
  const ids = b.topicIds.filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
  if (ids.length === 0) return 'topicIds must contain at least one finite number';
  return { entityType: b.entityType as BrainTopicEntityType, entityId: b.entityId, topicIds: ids };
}

export async function POST(request: Request) {
  const result = await requireBrainEntitlement({ action: 'write' });
  if ('response' in result) return result.response;

  const parsed = parseBody(await request.json().catch(() => null));
  if (typeof parsed === 'string') {
    return NextResponse.json({ success: false, message: parsed }, { status: 400 });
  }

  const outcome = await attachTopics(db, {
    clientId: result.client.id,
    actorId: result.userId,
    targetEntityType: parsed.entityType,
    targetEntityId: parsed.entityId,
    topicIds: parsed.topicIds,
  });
  return NextResponse.json({
    success: true,
    data: { attached: outcome.attached, alreadyAttached: outcome.alreadyAttached, insertedRowIds: outcome.insertedRowIds },
  });
}

export async function DELETE(request: Request) {
  const result = await requireBrainEntitlement({ action: 'write' });
  if ('response' in result) return result.response;

  const parsed = parseBody(await request.json().catch(() => null));
  if (typeof parsed === 'string') {
    return NextResponse.json({ success: false, message: parsed }, { status: 400 });
  }

  const outcome = await detachTopics(result.client.id, result.userId, {
    targetEntityType: parsed.entityType,
    targetEntityId: parsed.entityId,
    topicIds: parsed.topicIds,
  });
  return NextResponse.json({ success: true, data: outcome });
}
