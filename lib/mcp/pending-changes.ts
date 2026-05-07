/**
 * MCP approval workflow: stage-or-apply helper for CMS writes.
 *
 * Wraps a DB mutation so that callers using an API key flagged with
 * `require_cms_approval` get a pending-change row instead of a direct write.
 * Staff approve via the approvals_* MCP tools or the portal UI, which re-runs
 * the mutation using the stored payload.
 */

import { db } from '@/lib/db';
import { portalApiKeys, mcpPendingChanges } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import type { PortalMcpContext } from '@/lib/mcp-auth';
import { notifyApprovers } from '@/lib/crm/notifications';
import { sendApprovalEmails } from '@/lib/email/mcp-approval-email';
import { publishEntityFromDb } from '@/lib/realtime/internal-publisher';

export type EntityType =
  | 'post'
  | 'pitch_deck'
  | 'pitch_deck_slides'
  | 'proposal'
  | 'email_campaign';

export type Operation =
  | 'create'
  | 'update'
  | 'delete'
  | 'send'
  | 'replace_slides'
  | 'add_slide';

export type StageOrApplyResult<T> =
  | { pending: true; pendingId: number; summary: string; status: 'pending' }
  | { pending: false; data: T };

interface StageOrApplyOpts<T> {
  ctx: PortalMcpContext;
  entityType: EntityType;
  entityId: number | null;
  operation: Operation;
  summary: string;
  payload: unknown;
  originalSnapshot?: unknown;
  apply: () => Promise<T>;
}

/**
 * Returns true if the current key requires CMS writes to be staged for approval.
 * Memoized per tool call via the passed ctx (callers don't need to cache).
 */
async function keyRequiresApproval(keyId: number): Promise<boolean> {
  const [row] = await db
    .select({ requireCmsApproval: portalApiKeys.requireCmsApproval })
    .from(portalApiKeys)
    .where(eq(portalApiKeys.id, keyId))
    .limit(1);
  return row?.requireCmsApproval ?? false;
}

/**
 * Either apply the mutation directly (returning the mutated data), or stage it
 * into mcp_pending_changes (returning a pending-status descriptor).
 *
 * Call from CMS write tools like:
 *
 *   const result = await stageOrApply({
 *     ctx, entityType: 'post', operation: 'create', entityId: null,
 *     summary: `Create post "${args.title}" on site ${args.websiteId}`,
 *     payload: args,
 *     apply: async () => {
 *       const [row] = await db.insert(posts).values({...}).returning();
 *       return row;
 *     },
 *   });
 *   if (result.pending) return json({ pending: true, ... });
 *   return json(result.data);
 */
export async function stageOrApply<T>(opts: StageOrApplyOpts<T>): Promise<StageOrApplyResult<T>> {
  const { ctx, entityType, entityId, operation, summary, payload, originalSnapshot, apply } = opts;

  const mustStage = await keyRequiresApproval(ctx.keyId);
  if (!mustStage) {
    const data = await apply();
    // Fan out to any open editors for this entity. Fire-and-forget — we
    // don't block the MCP response on the realtime hop, and the publisher
    // never throws (returns { ok: false, reason } on failure).
    void publishEntityFromDb({
      entityType,
      entityId: entityIdFromApplyResult(entityId, data),
    }).catch((err) => {
      console.warn('[mcp/pending-changes] realtime publish failed:', err);
    });
    return { pending: false, data };
  }

  const [row] = await db
    .insert(mcpPendingChanges)
    .values({
      clientId: ctx.client.id,
      userId: ctx.userId,
      keyId: ctx.keyId,
      entityType,
      entityId,
      operation,
      summary,
      payload: payload as never,
      originalSnapshot: (originalSnapshot ?? null) as never,
      status: 'pending',
    })
    .returning();

  // Notify owners/admins so the pending-change badge + notification bell both
  // surface the item, then fire approval-request emails to the same recipients.
  // Fire-and-forget — never block the MCP response on this.
  notifyApprovers({
    clientId: ctx.client.id,
    excludeUserId: ctx.userId,
    type: 'mcp_pending_change',
    title: 'MCP change awaiting approval',
    body: summary,
    entityType: 'mcp_approval',
    entityId: row.id,
  })
    .then((notifications) => {
      const userIds = notifications.map((n) => n.userId);
      return sendApprovalEmails({
        clientId: ctx.client.id,
        userIds,
        pendingId: row.id,
        summary,
        entityType,
        operation,
      });
    })
    .catch((err) => {
      console.warn('[mcp] approval notification/email failed:', err);
    });

  return {
    pending: true,
    pendingId: row.id,
    summary,
    status: 'pending',
  };
}

/**
 * For `create`-style mutations the row's `id` is unknown until apply
 * returns. Prefer the apply result's `id` (when present) over the staged
 * `entityId`.
 */
function entityIdFromApplyResult(
  staged: number | null,
  applyResult: unknown,
): number | string | null {
  if (
    applyResult &&
    typeof applyResult === 'object' &&
    'id' in applyResult &&
    (typeof (applyResult as { id: unknown }).id === 'number' ||
      typeof (applyResult as { id: unknown }).id === 'string')
  ) {
    return (applyResult as { id: number | string }).id;
  }
  return staged;
}
