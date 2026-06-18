/**
 * Shared campaign-send execution.
 *
 * Resume-safe: queries emailCampaignSends to skip subscribers who already
 * received this campaign. Caller is responsible for gating/auth —
 * this module only does the dispatch loop + status transitions.
 *
 * A/B subject test:
 *   When `campaign.abEnabled` is true and `abSubjectB` is set, the first
 *   `abTestSizePct` of the (deterministically-ordered) recipient list is
 *   split evenly between subject A (`subject`) and subject B
 *   (`abSubjectB`). The remainder is held back; status flips to
 *   'ab_testing'. An operator (or future cron) calls
 *   POST /api/portal/email/campaigns/[id]/promote-winner — implemented in
 *   that route — to aggregate per-variant counts, pick the winner by
 *   `abWinnerMetric`, and dispatch the held-back remainder.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  emailCampaigns,
  emailCampaignSends,
  emailSubscribers,
} from '@/lib/db/schema';
import { buildCampaignHtml, buildUnsubscribeUrl } from './index';
import { getOrRenderCampaignHtml, htmlToText } from './render-cache';
import type { Block } from '@/types/blocks';
import { splitForAbTest, type AbVariant } from './subject-ab';
import { resolveResendKey } from './resolve-resend';
import { Resend } from 'resend';

export async function executeCampaignSend(
  campaignId: number,
  campaign: typeof emailCampaigns.$inferSelect,
): Promise<{ sent: number; failed: number; total: number; ab?: { phase: 'testing'; held: number } }> {
  const already = await db
    .select({ subscriberId: emailCampaignSends.subscriberId })
    .from(emailCampaignSends)
    .where(eq(emailCampaignSends.campaignId, campaignId));
  const sentIds = new Set(already.map(s => s.subscriberId));

  const activeSubs = await db
    .select()
    .from(emailSubscribers)
    .where(and(eq(emailSubscribers.listId, campaign.listId), eq(emailSubscribers.status, 'active')));

  // Deterministic order — same recipients land in the same A/B cohort
  // across re-runs.
  activeSubs.sort((a, b) => a.id - b.id);

  const targets = activeSubs.filter(s => !sentIds.has(s.id));
  if (targets.length === 0) throw new Error('No active subscribers remaining to send to');

  // Build the dispatch plan. Non-A/B mode: one bucket. A/B mode: A + B
  // buckets, remainder held for the winner phase.
  type DispatchBucket = { variant: AbVariant | null; subject: string; recipients: typeof targets };
  const plan: DispatchBucket[] = [];
  const abActive = !!(campaign.abEnabled && campaign.abSubjectB?.trim() && !campaign.abDecidedAt);

  if (abActive) {
    const split = splitForAbTest(targets, campaign.abTestSizePct ?? 10);
    if (split.a.length > 0) plan.push({ variant: 'a', subject: campaign.subject, recipients: split.a });
    if (split.b.length > 0) plan.push({ variant: 'b', subject: campaign.abSubjectB!, recipients: split.b });
  } else {
    plan.push({ variant: null, subject: campaign.subject, recipients: targets });
  }

  const totalThisDispatch = plan.reduce((sum, b) => sum + b.recipients.length, 0);

  await db
    .update(emailCampaigns)
    .set({ status: 'sending', totalRecipients: targets.length, updatedAt: new Date() })
    .where(eq(emailCampaigns.id, campaignId));

  // When the campaign opted into the block builder, render once via the
  // sha256-keyed cache so we don't re-render per recipient. The cached HTML
  // contains a `{{UNSUBSCRIBE_URL}}` placeholder we substitute below.
  let cachedHtml: string | null = null;
  let cachedText: string | null = null;
  if (campaign.useBlockEditor && Array.isArray(campaign.contentBlocks)) {
    const result = await getOrRenderCampaignHtml(
      campaignId,
      campaign.contentBlocks as Block[],
      { previewText: campaign.previewText, subject: campaign.subject },
    );
    cachedHtml = result.html;
    cachedText = result.text;
  }

  // Resolve the Resend key: BYOK if the campaign has a clientId and the client
  // has a connected key; platform otherwise. campaignId.clientId is nullable
  // (global / agency campaigns have no owner), so we fall back gracefully.
  let resendClient: Resend;
  if (campaign.clientId != null) {
    const { key } = await resolveResendKey(campaign.clientId);
    resendClient = new Resend(key);
  } else {
    const platformKey = process.env.RESEND_API_KEY;
    if (!platformKey) throw new Error('[executeCampaignSend] RESEND_API_KEY is not set');
    resendClient = new Resend(platformKey);
  }

  let sent = 0;
  let failed = 0;
  for (const bucket of plan) {
    for (const subscriber of bucket.recipients) {
      try {
        const unsubscribeUrl = buildUnsubscribeUrl(subscriber.unsubscribeToken);
        const html = cachedHtml
          ? cachedHtml.replace(/\{\{UNSUBSCRIBE_URL\}\}/g, unsubscribeUrl)
          : buildCampaignHtml(campaign.htmlContent, unsubscribeUrl, campaign.previewText);
        const text = cachedText ?? htmlToText(html);
        const result = await resendClient.emails.send({
          from: `${campaign.fromName} <${campaign.fromEmail}>`,
          to: subscriber.email,
          subject: bucket.subject,
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
          abVariant: bucket.variant,
          sentAt: new Date(),
        });
        sent++;
      } catch {
        failed++;
      }
    }
  }

  // A/B campaigns stay in 'ab_testing' until promote-winner flips them to
  // 'sent' after dispatching the remainder.
  const nextStatus = abActive ? 'ab_testing' : 'sent';
  await db
    .update(emailCampaigns)
    .set({ status: nextStatus, sentAt: new Date(), totalSent: sent, updatedAt: new Date() })
    .where(eq(emailCampaigns.id, campaignId));

  if (abActive) {
    return {
      sent,
      failed,
      total: totalThisDispatch,
      ab: { phase: 'testing', held: targets.length - totalThisDispatch },
    };
  }
  return { sent, failed, total: totalThisDispatch };
}
