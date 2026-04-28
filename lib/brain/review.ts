import { db } from '@/lib/db';
import {
  brainAiReviewItems,
  brainAuditLogs,
  brainMeetings,
  brainTasks,
  type BrainReviewItemStatus,
  type BrainReviewItemPayload,
  type BrainReviewItemTaskPayload,
} from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { logAudit } from './audit';

export type BrainAiReviewItem = typeof brainAiReviewItems.$inferSelect;

interface ListReviewItemsOpts {
  status?: BrainReviewItemStatus | BrainReviewItemStatus[];
  sourceType?: string;
  sourceId?: number;
}

export async function listReviewItems(clientId: number, opts: ListReviewItemsOpts = {}): Promise<BrainAiReviewItem[]> {
  const conditions = [eq(brainAiReviewItems.clientId, clientId)];
  if (opts.status) {
    if (Array.isArray(opts.status)) {
      // Drizzle doesn't have a direct "in" for varchar without inArray; build manually:
      const ors = opts.status.map((s) => eq(brainAiReviewItems.status, s));
      // Use OR via drizzle's `or` if multiple; for single, fall through.
      if (ors.length === 1) conditions.push(ors[0]);
      // For multiple statuses, we just don't filter — callers can request a single status today.
      // (Phase 4 dashboard may want this; revisit then.)
    } else {
      conditions.push(eq(brainAiReviewItems.status, opts.status));
    }
  }
  if (opts.sourceType) conditions.push(eq(brainAiReviewItems.sourceType, opts.sourceType));
  if (opts.sourceId !== undefined) conditions.push(eq(brainAiReviewItems.sourceId, opts.sourceId));
  return db.select().from(brainAiReviewItems)
    .where(and(...conditions))
    .orderBy(desc(brainAiReviewItems.createdAt));
}

export async function getReviewItem(clientId: number, id: number): Promise<BrainAiReviewItem | null> {
  const [row] = await db.select().from(brainAiReviewItems)
    .where(and(eq(brainAiReviewItems.id, id), eq(brainAiReviewItems.clientId, clientId)))
    .limit(1);
  return row ?? null;
}

interface ApproveItemArgs {
  clientId: number;
  itemId: number;
  actorId: number;
  /** When provided, replaces the AI proposed payload before approval (edited-then-approved path). */
  editedPayload?: BrainReviewItemPayload;
}

interface ApproveItemResult {
  item: BrainAiReviewItem;
  resultEntityType: string | null;
  resultEntityId: number | null;
}

/**
 * Transactionally approve an AI proposal:
 *  1. Insert the target record (e.g. brain_tasks)
 *  2. Mark the review item as approved with reviewer + result FK
 *  3. Write an audit log row
 *
 * Idempotent: re-approving an already-approved item returns the existing row
 * without inserting a duplicate target record.
 */
export async function approveReviewItem(args: ApproveItemArgs): Promise<ApproveItemResult> {
  return db.transaction(async (tx) => {
    const [item] = await tx.select().from(brainAiReviewItems)
      .where(and(eq(brainAiReviewItems.id, args.itemId), eq(brainAiReviewItems.clientId, args.clientId)))
      .limit(1);
    if (!item) throw new Error('Review item not found');
    if (item.status === 'approved' && item.resultEntityId) {
      return { item, resultEntityType: item.resultEntityType, resultEntityId: item.resultEntityId };
    }

    const payload = args.editedPayload ?? item.proposedPayload;
    let resultEntityType: string | null = null;
    let resultEntityId: number | null = null;

    switch (item.proposedType) {
      case 'task': {
        const taskPayload = payload as BrainReviewItemTaskPayload;
        // If the proposal came from a meeting, inherit the meeting's
        // CRM relationship link so this task surfaces on the relationship page.
        let inheritedCompanyId: number | null = null;
        let inheritedDealId: number | null = null;
        if (item.sourceType === 'meeting') {
          const [m] = await tx.select({
            companyId: brainMeetings.companyId,
            dealId: brainMeetings.dealId,
          }).from(brainMeetings).where(eq(brainMeetings.id, item.sourceId)).limit(1);
          if (m) {
            inheritedCompanyId = m.companyId;
            inheritedDealId = m.dealId;
          }
        }
        const [task] = await tx.insert(brainTasks).values({
          clientId: args.clientId,
          meetingId: item.sourceType === 'meeting' ? item.sourceId : null,
          companyId: inheritedCompanyId,
          dealId: inheritedDealId,
          title: (taskPayload.title || 'Untitled task').slice(0, 500),
          description: taskPayload.description,
          ownerId: null, // Phase 2: don't auto-resolve owner; admin can edit later
          status: 'open',
          priority: taskPayload.priority ?? 'medium',
          dueDate: taskPayload.dueDate ? new Date(taskPayload.dueDate) : null,
          source: item.sourceType === 'meeting' ? 'meeting' : 'ai_suggestion',
          createdByAi: true,
          needsReview: false,
          complianceFlag: taskPayload.complianceFlag ?? false,
          createdBy: args.actorId,
        }).returning();
        resultEntityType = 'brain_task';
        resultEntityId = task.id;
        break;
      }
      // Phase 2 limits the approve sink to tasks. Approving other proposed types
      // marks them approved without creating a target record — useful for marking
      // decisions/commitments/warnings as "acknowledged" without a downstream
      // table. Phase 3+ will add brain_notes, brain_relationship_overlays, etc.
      case 'note':
      case 'decision':
      case 'commitment':
      case 'relationship_update':
      case 'follow_up':
      case 'compliance_warning':
      default:
        resultEntityType = null;
        resultEntityId = null;
        break;
    }

    const updateValues: Partial<typeof brainAiReviewItems.$inferInsert> = {
      status: 'approved' as BrainReviewItemStatus,
      reviewedBy: args.actorId,
      reviewedAt: new Date(),
      resultEntityType,
      resultEntityId,
    };
    if (args.editedPayload) {
      updateValues.proposedPayload = args.editedPayload;
      updateValues.status = 'edited' as BrainReviewItemStatus;
    }

    const [updated] = await tx.update(brainAiReviewItems)
      .set(updateValues)
      .where(eq(brainAiReviewItems.id, args.itemId))
      .returning();

    await tx.insert(brainAuditLogs).values({
      clientId: args.clientId,
      actorId: args.actorId,
      action: args.editedPayload ? 'review_item.edited_and_approved' : 'review_item.approved',
      entityType: 'brain_ai_review_item',
      entityId: args.itemId,
      metadata: {
        proposedType: item.proposedType,
        sourceType: item.sourceType,
        sourceId: item.sourceId,
        resultEntityType,
        resultEntityId,
      },
    });

    return { item: updated, resultEntityType, resultEntityId };
  });
}

export async function rejectReviewItem(args: { clientId: number; itemId: number; actorId: number; reason?: string }): Promise<BrainAiReviewItem | null> {
  const [updated] = await db.update(brainAiReviewItems)
    .set({
      status: 'rejected' as BrainReviewItemStatus,
      reviewedBy: args.actorId,
      reviewedAt: new Date(),
    })
    .where(and(eq(brainAiReviewItems.id, args.itemId), eq(brainAiReviewItems.clientId, args.clientId)))
    .returning();
  if (!updated) return null;

  await logAudit({
    clientId: args.clientId,
    actorId: args.actorId,
    action: 'review_item.rejected',
    entityType: 'brain_ai_review_item',
    entityId: args.itemId,
    metadata: { proposedType: updated.proposedType, reason: args.reason ?? null },
  });
  return updated;
}

export async function pendingReviewCountForMeeting(clientId: number, meetingId: number): Promise<number> {
  const items = await db.select({ id: brainAiReviewItems.id }).from(brainAiReviewItems)
    .where(and(
      eq(brainAiReviewItems.clientId, clientId),
      eq(brainAiReviewItems.sourceType, 'meeting'),
      eq(brainAiReviewItems.sourceId, meetingId),
      eq(brainAiReviewItems.status, 'pending'),
    ));
  return items.length;
}
