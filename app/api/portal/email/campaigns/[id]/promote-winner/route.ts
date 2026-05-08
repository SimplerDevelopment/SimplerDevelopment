/**
 * Promote the A/B test winner.
 *
 * After the initial 10/10/80 blast, the operator (or a future cron job)
 * hits this endpoint. It:
 *   1. Aggregates open/click counts per variant (single grouped query).
 *   2. Picks the winner by the campaign's configured metric.
 *   3. Records winner subject + decided_at on email_campaigns.
 *   4. Sends the held-back remainder using the winner's subject.
 *   5. Flips status to 'sent'.
 *
 * Auth: portal session matching the campaign's clientId. Same gate as the
 * regular send endpoint.
 *
 * TODO: schedule via existing cron infra (see app/api/cron/*) so this fires
 * automatically WINNER_DECISION_DELAY_HOURS after the initial blast. For
 * now an operator hits this manually — accepted since the test window is
 * 4h and an operator review is reasonable on first launch.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { emailCampaigns, emailSubscribers, emailCampaignSends } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { resend, buildCampaignHtml, buildUnsubscribeUrl } from '@/lib/email';
import { getOrRenderCampaignHtml, htmlToText } from '@/lib/email/render-cache';
import type { Block } from '@/types/blocks';
import { getPortalClient } from '@/lib/portal-client';
import {
  aggregateAbVariantCounts,
  pickAbWinner,
  isAbDecisionWindowReady,
} from '@/lib/email/subject-ab';

async function requireClient() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return getPortalClient(parseInt(session.user.id, 10));
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const client = await requireClient();
  if (!client) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const campaignId = parseInt(id);

  const [campaign] = await db
    .select()
    .from(emailCampaigns)
    .where(and(eq(emailCampaigns.id, campaignId), eq(emailCampaigns.clientId, client.id)))
    .limit(1);

  if (!campaign) return NextResponse.json({ success: false, message: 'Campaign not found' }, { status: 404 });
  if (!campaign.abEnabled) return NextResponse.json({ success: false, message: 'A/B test not enabled on this campaign' }, { status: 400 });
  if (campaign.abDecidedAt) return NextResponse.json({ success: false, message: 'Winner already promoted' }, { status: 400 });
  if (!campaign.abSubjectB) return NextResponse.json({ success: false, message: 'Subject B is empty' }, { status: 400 });

  // Allow `?force=1` (for ops) — otherwise enforce the wait window.
  const url = new URL(req.url);
  const force = url.searchParams.get('force') === '1';
  if (!force && !isAbDecisionWindowReady(campaign.sentAt)) {
    return NextResponse.json({
      success: false,
      message: 'Decision window not yet reached (4h from initial send). Add ?force=1 to override.',
    }, { status: 400 });
  }

  // 1) Aggregate counts per variant — single grouped query, no N+1.
  const counts = await aggregateAbVariantCounts(campaignId);

  // 2) Decide winner.
  const metric: 'open' | 'click' = campaign.abWinnerMetric === 'click' ? 'click' : 'open';
  const { winner, reason } = pickAbWinner(counts, metric);
  const winnerSubject = winner === 'a' ? campaign.subject : campaign.abSubjectB;

  // 3) Find the held-back recipients (active subscribers minus those who
  //    already received an A or B variant in the test phase).
  const alreadySent = await db
    .select({ subscriberId: emailCampaignSends.subscriberId })
    .from(emailCampaignSends)
    .where(eq(emailCampaignSends.campaignId, campaignId));
  const sentIds = new Set(alreadySent.map(r => r.subscriberId));

  const allActive = await db
    .select()
    .from(emailSubscribers)
    .where(and(eq(emailSubscribers.listId, campaign.listId), eq(emailSubscribers.status, 'active')));
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

  // 5) Mark winner first so a partial dispatch failure still records the
  //    decision and an operator can resume safely.
  await db
    .update(emailCampaigns)
    .set({
      abWinnerSubject: winnerSubject,
      abDecidedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(emailCampaigns.id, campaignId));

  let sent = 0;
  let failed = 0;
  for (const subscriber of remainder) {
    try {
      const unsubscribeUrl = buildUnsubscribeUrl(subscriber.unsubscribeToken);
      const html = cachedHtml
        ? cachedHtml.replace(/\{\{UNSUBSCRIBE_URL\}\}/g, unsubscribeUrl)
        : buildCampaignHtml(campaign.htmlContent, unsubscribeUrl, campaign.previewText);
      const text = cachedText ?? htmlToText(html);

      const result = await resend.emails.send({
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

  // Increment totalSent atomically — the test phase already counted toward
  // it. We want a true running total post-winner blast.
  const newTotalSent = (campaign.totalSent ?? 0) + sent;
  await db
    .update(emailCampaigns)
    .set({
      status: 'sent',
      totalSent: newTotalSent,
      updatedAt: new Date(),
    })
    .where(eq(emailCampaigns.id, campaignId));

  return NextResponse.json({
    success: true,
    data: {
      winner,
      winnerSubject,
      reason,
      counts,
      sent,
      failed,
      total: remainder.length,
    },
  });
}

// Allow GET for status preview (counts + would-be winner) without dispatching.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const client = await requireClient();
  if (!client) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const campaignId = parseInt(id);

  const [campaign] = await db
    .select()
    .from(emailCampaigns)
    .where(and(eq(emailCampaigns.id, campaignId), eq(emailCampaigns.clientId, client.id)))
    .limit(1);

  if (!campaign) return NextResponse.json({ success: false, message: 'Campaign not found' }, { status: 404 });
  if (!campaign.abEnabled) return NextResponse.json({ success: false, message: 'A/B test not enabled' }, { status: 400 });

  const counts = await aggregateAbVariantCounts(campaignId);
  const metric: 'open' | 'click' = campaign.abWinnerMetric === 'click' ? 'click' : 'open';
  const projected = pickAbWinner(counts, metric);
  const ready = isAbDecisionWindowReady(campaign.sentAt);

  return NextResponse.json({
    success: true,
    data: {
      ready,
      decided: !!campaign.abDecidedAt,
      decidedAt: campaign.abDecidedAt,
      winnerSubject: campaign.abWinnerSubject,
      counts,
      projectedWinner: projected.winner,
      projectedReason: projected.reason,
      metric,
    },
  });
}
