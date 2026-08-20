/**
 * The side effects of approving an MCP approval link, and the link serializer.
 *
 * Extracted from `app/api/approve/[token]/route.ts` so the cookie-based decision
 * endpoint (`/api/approve/decision`) applies EXACTLY the same effects as the
 * token endpoint. Two copies of "what approving a deck does" would drift, and
 * the drift would only show up as a half-published artifact in production.
 *
 * Approve side-effects per entity type:
 *   - post           → published = true, publishedAt = now
 *   - pitch_deck     → status = 'published' + every draft slide promoted to live
 *   - email_campaign → no status change; send stays a separate deliberate action
 *   - survey         → status = 'active' so it accepts public responses
 *   - booking_page   → active = true so /book/<slug> accepts reservations
 *   - block_template → applies the draft overlay to the live row
 *   - pending_change → re-uses `applyPendingChange`
 */

import { db } from '@/lib/db';
import {
  posts,
  pitchDecks,
  emailCampaigns,
  blockTemplates,
  mcpPendingChanges,
  surveys,
  bookingPages,
} from '@/lib/db/schema';
import type { BlockTemplateDraft } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import type { ApprovalLinkRow, ApprovableEntityType } from './approval-links';
import { applyPendingChange } from './approvals';
import { applyPublishAllToSlides } from '@/lib/decks/publish-slide';
import { revalidatePath } from 'next/cache';

export async function applyApproval(link: ApprovalLinkRow): Promise<void> {
  if (link.linkType === 'pending_change') {
    if (!link.pendingChangeId) throw new Error('Pending-change link has no pendingChangeId');
    const [change] = await db
      .select()
      .from(mcpPendingChanges)
      .where(
        and(
          eq(mcpPendingChanges.id, link.pendingChangeId),
          eq(mcpPendingChanges.clientId, link.clientId),
        ),
      )
      .limit(1);
    if (!change) throw new Error('Pending change not found');
    if (change.status !== 'pending') throw new Error(`Pending change is ${change.status}`);
    // applyPendingChange expects an applier user id — we pass 0 to signal
    // "external approver via public link" since the link itself is the
    // authorization. Downstream writes that try to set createdBy will fall
    // back to null via the foreign-key onDelete:set null path.
    await applyPendingChange(change, link.clientId, link.createdBy ?? 0);
    await db
      .update(mcpPendingChanges)
      .set({ status: 'approved', reviewedAt: new Date(), appliedAt: new Date() })
      .where(eq(mcpPendingChanges.id, change.id));
    try { revalidatePath('/portal', 'layout'); } catch { /* outside request context */ }
    return;
  }

  if (!link.entityId) throw new Error('Entity link has no entityId');

  switch (link.entityType as ApprovableEntityType) {
    case 'post': {
      const [row] = await db
        .select({ id: posts.id })
        .from(posts)
        .where(eq(posts.id, link.entityId))
        .limit(1);
      if (!row) throw new Error('Post not found');
      await db
        .update(posts)
        .set({ published: true, publishedAt: new Date(), updatedAt: new Date() })
        .where(eq(posts.id, link.entityId));
      try {
        revalidatePath('/sites', 'layout');
        revalidatePath('/portal', 'layout');
      } catch { /* outside request context */ }
      return;
    }
    case 'pitch_deck': {
      // Approving a deck flips status to 'published' AND promotes every draft
      // slide to live — otherwise the public renderer sees the prior live
      // state (or, for a brand-new deck, an empty deck) even though status
      // says published. Slide promotion is the same logic decks_publish_all
      // runs, factored out into lib/decks/publish-slide.ts.
      const [deck] = await db
        .select()
        .from(pitchDecks)
        .where(
          and(eq(pitchDecks.id, link.entityId), eq(pitchDecks.clientId, link.clientId)),
        )
        .limit(1);
      if (!deck) throw new Error('Deck not found');
      const currentSlides = (deck.slides ?? []) as Parameters<typeof applyPublishAllToSlides>[0];
      const promotedSlides = applyPublishAllToSlides(currentSlides);
      await db
        .update(pitchDecks)
        .set({
          slides: promotedSlides,
          status: 'published',
          formatVersion: 2,
          updatedAt: new Date(),
        })
        .where(eq(pitchDecks.id, link.entityId));
      try { revalidatePath('/portal', 'layout'); } catch { /* outside request context */ }
      return;
    }
    case 'email_campaign': {
      // No status change. Send is a separate deliberate action.
      const [row] = await db
        .select({ id: emailCampaigns.id })
        .from(emailCampaigns)
        .where(eq(emailCampaigns.id, link.entityId))
        .limit(1);
      if (!row) throw new Error('Campaign not found');
      return;
    }
    case 'survey': {
      // Approving a survey draft flips status -> 'active' so it accepts public
      // responses. Tenancy is scoped via the link's clientId. If the survey was
      // already 'active' (re-shared link) the update is a no-op.
      const [row] = await db
        .select({ id: surveys.id, status: surveys.status })
        .from(surveys)
        .where(and(eq(surveys.id, link.entityId), eq(surveys.clientId, link.clientId)))
        .limit(1);
      if (!row) throw new Error('Survey not found');
      if (row.status !== 'active') {
        await db
          .update(surveys)
          .set({ status: 'active', updatedAt: new Date() })
          .where(eq(surveys.id, link.entityId));
      }
      try {
        revalidatePath('/sites', 'layout');
        revalidatePath('/portal', 'layout');
      } catch { /* outside request context */ }
      return;
    }
    case 'booking_page': {
      // Approving a booking page flips active=true so the public /book/<slug>
      // route accepts reservations. Same idempotency pattern as survey above.
      const [row] = await db
        .select({ id: bookingPages.id, active: bookingPages.active })
        .from(bookingPages)
        .where(and(eq(bookingPages.id, link.entityId), eq(bookingPages.clientId, link.clientId)))
        .limit(1);
      if (!row) throw new Error('Booking page not found');
      if (!row.active) {
        await db
          .update(bookingPages)
          .set({ active: true, updatedAt: new Date() })
          .where(eq(bookingPages.id, link.entityId));
      }
      try {
        revalidatePath('/book', 'layout');
        revalidatePath('/portal', 'layout');
      } catch { /* outside request context */ }
      return;
    }
    case 'block_template': {
      const [tpl] = await db
        .select()
        .from(blockTemplates)
        .where(eq(blockTemplates.id, link.entityId))
        .limit(1);
      if (!tpl) throw new Error('Template not found');
      const draft = (tpl.draft ?? null) as BlockTemplateDraft | null;
      if (!draft) return; // nothing to publish; treat approve as a no-op affirmation
      if (draft.pendingDelete) {
        await db.delete(blockTemplates).where(eq(blockTemplates.id, link.entityId));
        return;
      }
      const patch: Record<string, unknown> = {
        draft: null,
        version: (tpl.version ?? 1) + 1,
        updatedAt: new Date(),
      };
      if (draft.name !== undefined) patch.name = draft.name;
      if (draft.description !== undefined) patch.description = draft.description;
      if (draft.category !== undefined) patch.category = draft.category;
      if (draft.scope !== undefined) patch.scope = draft.scope;
      if (draft.blocks !== undefined) patch.blocks = draft.blocks;
      if (draft.thumbnail !== undefined) patch.thumbnail = draft.thumbnail;
      if (draft.tags !== undefined) patch.tags = draft.tags;
      if (draft.lockedFields !== undefined) patch.lockedFields = draft.lockedFields;
      await db.update(blockTemplates).set(patch).where(eq(blockTemplates.id, link.entityId));
      try { revalidatePath('/portal', 'layout'); } catch { /* outside request context */ }
      return;
    }
    default:
      throw new Error(`Unknown entityType: ${link.entityType}`);
  }
}

export function serializeLink(link: ApprovalLinkRow) {
  return {
    token: link.token,
    linkType: link.linkType,
    entityType: link.entityType,
    entityId: link.entityId,
    pendingChangeId: link.pendingChangeId,
    status: link.status,
    summary: link.summary,
    reviewerName: link.reviewerName,
    reviewedAt: link.reviewedAt,
    expiresAt: link.expiresAt,
    createdAt: link.createdAt,
  };
}

/**
 * Shared decision handler for both approval endpoints.
 *
 * On approve the side-effect runs FIRST: if it throws (entity deleted between
 * mint and approve, stale pending change) the link stays pending so the author
 * can retry without re-minting.
 */
export async function applyDecision(
  link: ApprovalLinkRow,
  action: 'approve' | 'reject',
): Promise<{ ok: true } | { ok: false; message: string; status: number }> {
  if (action === 'approve') {
    try {
      await applyApproval(link);
    } catch (err) {
      console.error('[approve] side-effect failed', err);
      const msg = err instanceof Error ? err.message : 'Failed to apply approval';
      // Stale / already-applied pending changes are domain errors, not server
      // failures. 409 so callers can distinguish "change no longer applicable"
      // from a genuine infrastructure error.
      const isStale =
        msg.startsWith('Pending change is ') || msg === 'Pending change not found';
      return {
        ok: false,
        message: isStale ? `This change is no longer applicable: ${msg}` : msg,
        status: isStale ? 409 : 500,
      };
    }
  }
  return { ok: true };
}
