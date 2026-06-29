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
 *   4. Dispatch the held-back remainder with the winner subject.
 *   5. Flip campaign status to 'sent'.
 *
 * BYOK: resolves the Resend key via resolveResendKey — never uses the global
 * platform `resend` singleton.
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
import { buildCampaignHtml, buildUnsubscribeUrl } from './index';
import { getOrRenderCampaignHtml, htmlToText } from './render-cache';
import { resolveResendKey } from './resolve-resend';
import {
  aggregateAbVariantCounts,
  pickAbWinner,
} from './subject-ab';
import type { Block } from '@/types/blocks';
import { Resend } from 'resend';

export interface AbPromotionResult {
  winner: 'a' | 'b' | 'tie';
  winnerSubject: string;
  reason: string;
  counts: Awaited<ReturnType<typeof aggregateAbVariantCounts>>;
  sent: number;
  failed: number;
  total: number;
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
  //    in the A/B test phase).
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
  const remainder = allActive.filter(s => !sentIds.has(s.id));

  // 4) Render once if using the block builder.
  let cachedHtml: string | null = null;
  let cachedText: string | null = null;
  if (campaign.useBlockEditor && Array.isArray(campaign.contentBlocks)) {
    const r = await getOrRenderCampaignHtml(
      campaignId,
      campaign.contentBlocks as Block[],
      { previewText: campaign.previewText, subject: winnerSubject },
    );
    cachedHtml = r.html;
    cachedText = r.text;
  }

  // 5) Resolve Resend client — BYOK first, platform fallback.
  let resendClient: Resend;
  if (campaign.clientId != null) {
    const { key } = await resolveResendKey(campaign.clientId);
    resendClient = new Resend(key);
  } else {
    const platformKey = process.env.RESEND_API_KEY;
    if (!platformKey) throw new Error('[executeAbPromotion] RESEND_API_KEY is not set');
    resendClient = new Resend(platformKey);
  }

  // 6) Record winner BEFORE dispatching so partial failures are recoverable.
  await db
    .update(emailCampaigns)
    .set({ abWinnerSubject: winnerSubject, abDecidedAt: new Date(), updatedAt: new Date() })
    .where(eq(emailCampaigns.id, campaignId));

  // 7) Dispatch remainder.
  let sent = 0;
  let failed = 0;
  for (const subscriber of remainder) {
    try {
      const unsubscribeUrl = buildUnsubscribeUrl(subscriber.unsubscribeToken);
      const html = cachedHtml
        ? cachedHtml.replace(/\{\{UNSUBSCRIBE_URL\}\}/g, unsubscribeUrl)
        : buildCampaignHtml(campaign.htmlContent, unsubscribeUrl, campaign.previewText);
      const text = cachedText ?? htmlToText(html);

      const result = await resendClient.emails.send({
        from: `${campaign.fromName} <${campaign.fromEmail}>`,
        to: subscriber.email,
        subject: winnerSubject,
        html,
        text,
        ...(campaign.replyTo ? { replyTo: campaign.replyTo } : {}),
        headers: {
          'List-Unsubscribe': `<${unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      });

      await db.insert(emailCampaignSends).values({
        campaignId,
        subscriberId: subscriber.id,
        resendEmailId: result.data?.id ?? null,
        abVariant: 'winner',
        sentAt: new Date(),
      });
      sent++;
    } catch {
      failed++;
    }
  }

  // 8) Flip to 'sent' and update running total.
  const newTotalSent = (campaign.totalSent ?? 0) + sent;
  await db
    .update(emailCampaigns)
    .set({ status: 'sent', totalSent: newTotalSent, updatedAt: new Date() })
    .where(eq(emailCampaigns.id, campaignId));

  return { winner, winnerSubject, reason, counts, sent, failed, total: remainder.length };
}
