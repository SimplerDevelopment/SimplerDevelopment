/**
 * Shared A/B winner-promotion logic.
 *
 * Called by:
 *   - POST /api/portal/email/campaigns/[id]/promote-winner  (manual/ops trigger)
 *   - GET  /api/cron/email-ab-promote                       (automatic 4h cron)
 *
 * Responsibility:
 *   1. Aggregate per-variant open/click counts.
 *   2. Pick the winner by the campaign's configured metric.
 *   3. Record the winner subject + decided_at on the campaign row first
 *      (so a partial dispatch is resumable and the decision is not lost).
 *      This writes BOTH `subject` and `abWinnerSubject` — executeCampaignSend
 *      (below) always reads `campaign.subject` to build the outgoing email;
 *      `abWinnerSubject` is display/audit only. A "B" win that updated only
 *      abWinnerSubject would silently dispatch the remainder with the
 *      original subject A.
 *   4. Dispatch the held-back remainder (PUX-049: via the durable
 *      internal_jobs queue instead of an inline per-recipient Resend loop —
 *      see enqueueCampaignSend in ./campaign-send-job, PUX-046). With
 *      abDecidedAt now set, executeCampaignSend's abActive check reads
 *      false, so its resume-safe loop naturally targets exactly this unsent
 *      remainder with the winning subject — no separate dispatch/recipient
 *      logic is needed here.
 *      Global/agency campaigns (campaign.clientId === null) can't ride
 *      internal_jobs — its client_id column is NOT NULL — so those fall
 *      back to calling executeCampaignSend synchronously, same fork the
 *      scheduled-send cron (app/api/cron/email-scheduled-send) already uses.
 *   5. Status flip to 'sent' happens inside executeCampaignSend itself
 *      (immediately for the synchronous/global fallback, or once the queued
 *      job drains for tenant-owned campaigns — same as the main send path).
 *
 * BYOK: resolveResendKey / transport selection now lives entirely inside
 * executeCampaignSend — this module no longer touches Resend directly.
 *
 * Pre-conditions the caller must validate before invoking:
 *   - campaign.abEnabled === true
 *   - campaign.abDecidedAt is null (not yet promoted)
 *   - campaign.abSubjectB is non-empty
 *   - (optional) the 4h decision window has elapsed; pass `force: true` to skip
 */

import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { emailCampaigns, emailSubscribers, emailCampaignSends } from '@/lib/db/schema';
import { enqueueCampaignSend } from './campaign-send-job';
import {
  aggregateAbVariantCounts,
  pickAbWinner,
} from './subject-ab';

export interface AbPromotionResult {
  winner: 'a' | 'b' | 'tie';
  winnerSubject: string;
  reason: string;
  counts: Awaited<ReturnType<typeof aggregateAbVariantCounts>>;
  /** Size of the held-back remainder being (or about to be) dispatched. */
  total: number;
  /** True once the remainder has been handed to the durable queue
   *  (PUX-046) rather than sent synchronously inline. Only false for
   *  global/agency campaigns, which can't ride internal_jobs. */
  queued: boolean;
  /** Only populated on the synchronous (queued === false) fallback path —
   *  the queued path doesn't know these until the job actually runs. */
  sent?: number;
  failed?: number;
}

export async function executeAbPromotion(
  campaignId: number,
  campaign: typeof emailCampaigns.$inferSelect,
): Promise<AbPromotionResult> {
  // 1) Aggregate counts per variant.
  const counts = await aggregateAbVariantCounts(campaignId);

  // 2) Pick winner.
  const metric: 'open' | 'click' = campaign.abWinnerMetric === 'click' ? 'click' : 'open';
  const { winner, reason } = pickAbWinner(counts, metric);
  const winnerSubject = winner === 'a' ? campaign.subject : campaign.abSubjectB!;

  // 3) Find held-back recipients (active subscribers minus those already sent
  //    in the A/B test phase) — for the returned `total` only. The actual
  //    dispatch re-derives the identical set via executeCampaignSend's own
  //    resume-safe query, so this is reporting, not a second source of truth.
  const alreadySent = await db
    .select({ subscriberId: emailCampaignSends.subscriberId })
    .from(emailCampaignSends)
    .where(eq(emailCampaignSends.campaignId, campaignId));
  const sentIds = new Set(alreadySent.map(r => r.subscriberId));

  const allActive = await db
    .select()
    .from(emailSubscribers)
    .where(
      and(
        eq(emailSubscribers.listId, campaign.listId),
        eq(emailSubscribers.status, 'active'),
      ),
    );
  allActive.sort((a, b) => a.id - b.id);
  const remainderCount = allActive.filter(s => !sentIds.has(s.id)).length;

  const decidedAt = new Date();

  // 4) Record winner BEFORE dispatching so partial failures are recoverable.
  await db
    .update(emailCampaigns)
    .set({
      subject: winnerSubject,
      abWinnerSubject: winnerSubject,
      abDecidedAt: decidedAt,
      updatedAt: new Date(),
    })
    .where(eq(emailCampaigns.id, campaignId));

  // 5) Dispatch the remainder.
  if (campaign.clientId != null) {
    await enqueueCampaignSend(campaignId, campaign.clientId);
    return { winner, winnerSubject, reason, counts, total: remainderCount, queued: true };
  }

  // Global/agency campaigns (clientId null) can't ride internal_jobs — its
  // client_id column is NOT NULL (see app/api/cron/email-scheduled-send's
  // identical fork). Dispatch synchronously via the same resume-safe
  // executeCampaignSend the queue job itself calls, passing the
  // already-persisted decision fields so its abActive check reads false.
  const { executeCampaignSend } = await import('./campaign-send');
  const result = await executeCampaignSend(campaignId, {
    ...campaign,
    subject: winnerSubject,
    abWinnerSubject: winnerSubject,
    abDecidedAt: decidedAt,
  });
  return {
    winner,
    winnerSubject,
    reason,
    counts,
    total: result.total,
    queued: false,
    sent: result.sent,
    failed: result.failed,
  };
}
