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
 * Automatic promotion is handled by app/api/cron/email-ab-promote which
 * fires every 30 minutes and delegates to the same executeAbPromotion helper
 * used here. Operators can still hit this endpoint manually or with ?force=1.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { emailCampaigns } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import {
  aggregateAbVariantCounts,
  pickAbWinner,
  isAbDecisionWindowReady,
} from '@/lib/email/subject-ab';
import { executeAbPromotion } from '@/lib/email/ab-promotion';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';

async function requireClient() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return getPortalClient(parseInt(session.user.id, 10));
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  // Service access check
  const authResult = await authorizePortal({ action: 'write', requireService: 'email' });
  if (isAuthError(authResult)) return authResult.response;

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

  // Delegate to the shared promotion logic (BYOK-correct, cron-reusable).
  const result = await executeAbPromotion(campaignId, campaign);

  return NextResponse.json({
    success: true,
    data: result,
  });
}

// Allow GET for status preview (counts + would-be winner) without dispatching.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  // Service access check
  const authResult = await authorizePortal({ action: 'read', requireService: 'email' });
  if (isAuthError(authResult)) return authResult.response;

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
