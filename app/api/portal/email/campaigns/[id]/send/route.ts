import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { emailCampaigns, emailSubscribers, emailCampaignSends } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { buildCampaignHtml, buildUnsubscribeUrl } from '@/lib/email';
import { getOrRenderCampaignHtml, htmlToText } from '@/lib/email/render-cache';
import type { Block } from '@/types/blocks';
import { getPortalClient } from '@/lib/portal-client';
import { splitForAbTest, type AbVariant } from '@/lib/email/subject-ab';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { resolveResendKey } from '@/lib/email/resolve-resend';
import { Resend } from 'resend';

async function requireClient() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return getPortalClient(parseInt(session.user.id, 10));
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
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
  if (campaign.status === 'sent' || campaign.status === 'sending') {
    return NextResponse.json({ success: false, message: `Campaign is already ${campaign.status}` }, { status: 400 });
  }

  // A/B mode requires a B subject. Surface the failure early so the user
  // doesn't end up in a half-sent state.
  if (campaign.abEnabled && !campaign.abSubjectB?.trim()) {
    return NextResponse.json({ success: false, message: 'A/B test enabled but Subject B is empty' }, { status: 400 });
  }

  const alreadySentSubIds = await db
    .select({ subscriberId: emailCampaignSends.subscriberId })
    .from(emailCampaignSends)
    .where(eq(emailCampaignSends.campaignId, campaignId));

  const sentIds = new Set(alreadySentSubIds.map(s => s.subscriberId));

  const subscribers = await db
    .select()
    .from(emailSubscribers)
    .where(and(eq(emailSubscribers.listId, campaign.listId), eq(emailSubscribers.status, 'active')));

  // Deterministic order so re-runs land the same recipients in the same
  // A/B cohort. Sort by id ascending — stable across reads.
  subscribers.sort((a, b) => a.id - b.id);

  const targets = subscribers.filter(s => !sentIds.has(s.id));

  if (targets.length === 0) {
    return NextResponse.json({ success: false, message: 'No active subscribers to send to' }, { status: 400 });
  }

  // Build the dispatch plan. In non-A/B mode this is a single bucket. In
  // A/B mode we split the first abTestSizePct evenly into A and B and hold
  // the remainder back for the winner-promotion phase.
  type DispatchBucket = { variant: AbVariant | null; subject: string; recipients: typeof targets };
  const plan: DispatchBucket[] = [];

  if (campaign.abEnabled && campaign.abSubjectB) {
    const split = splitForAbTest(targets, campaign.abTestSizePct ?? 10);
    if (split.a.length > 0) plan.push({ variant: 'a', subject: campaign.subject, recipients: split.a });
    if (split.b.length > 0) plan.push({ variant: 'b', subject: campaign.abSubjectB, recipients: split.b });
    // Remainder is held for the winner-promotion endpoint — see
    // POST /api/portal/email-campaigns/[id]/promote-winner.
  } else {
    plan.push({ variant: null, subject: campaign.subject, recipients: targets });
  }

  const totalThisDispatch = plan.reduce((sum, b) => sum + b.recipients.length, 0);

  await db
    .update(emailCampaigns)
    .set({
      status: 'sending',
      // Track total list size, not just this dispatch — the held-back
      // remainder is still part of the campaign reach.
      totalRecipients: targets.length,
      updatedAt: new Date(),
    })
    .where(eq(emailCampaigns.id, campaignId));

  // Block-builder path: render once via the sha256-keyed cache so all
  // recipients reuse the same HTML body (cheaper, deterministic).
  let cachedHtml: string | null = null;
  let cachedText: string | null = null;
  if (campaign.useBlockEditor && Array.isArray(campaign.contentBlocks)) {
    const r = await getOrRenderCampaignHtml(
      campaignId,
      campaign.contentBlocks as Block[],
      { previewText: campaign.previewText, subject: campaign.subject },
    );
    cachedHtml = r.html;
    cachedText = r.text;
  }

  // Resolve the Resend key once — BYOK if available, platform otherwise.
  const { key: resendKey } = await resolveResendKey(client.id);
  const resendClient = new Resend(resendKey);

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

  // For A/B campaigns we DO NOT mark status='sent' here — the campaign is
  // mid-test until the winner is promoted. We use a custom 'ab_testing'
  // status; the promote-winner endpoint flips it to 'sent' once the
  // remainder dispatches.
  const nextStatus = campaign.abEnabled ? 'ab_testing' : 'sent';
  await db
    .update(emailCampaigns)
    .set({
      status: nextStatus,
      sentAt: new Date(),
      totalSent: sent,
      updatedAt: new Date(),
    })
    .where(eq(emailCampaigns.id, campaignId));

  return NextResponse.json({
    success: true,
    data: {
      sent,
      failed,
      total: totalThisDispatch,
      // When A/B, surface the held-back count so the UI can render
      // "X recipients waiting for winner".
      ...(campaign.abEnabled && {
        ab: {
          phase: 'testing' as const,
          held: targets.length - totalThisDispatch,
          variants: plan.map(b => ({ variant: b.variant, subject: b.subject, count: b.recipients.length })),
        },
      }),
    },
  });
}
