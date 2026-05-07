import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { emailCampaigns, emailSubscribers, emailCampaignSends } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { resend, buildCampaignHtml, buildUnsubscribeUrl } from '@/lib/email';
import { getOrRenderCampaignHtml, htmlToText } from '@/lib/email/render-cache';
import type { Block } from '@/types/blocks';
import { getPortalClient } from '@/lib/portal-client';

async function requireClient() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return getPortalClient(parseInt(session.user.id, 10));
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
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

  const alreadySentSubIds = await db
    .select({ subscriberId: emailCampaignSends.subscriberId })
    .from(emailCampaignSends)
    .where(eq(emailCampaignSends.campaignId, campaignId));

  const sentIds = new Set(alreadySentSubIds.map(s => s.subscriberId));

  const subscribers = await db
    .select()
    .from(emailSubscribers)
    .where(and(eq(emailSubscribers.listId, campaign.listId), eq(emailSubscribers.status, 'active')));

  const targets = subscribers.filter(s => !sentIds.has(s.id));

  if (targets.length === 0) {
    return NextResponse.json({ success: false, message: 'No active subscribers to send to' }, { status: 400 });
  }

  await db
    .update(emailCampaigns)
    .set({ status: 'sending', totalRecipients: targets.length, updatedAt: new Date() })
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

  let sent = 0;
  let failed = 0;

  for (const subscriber of targets) {
    try {
      const unsubscribeUrl = buildUnsubscribeUrl(subscriber.unsubscribeToken);
      const html = cachedHtml
        ? cachedHtml.replace(/\{\{UNSUBSCRIBE_URL\}\}/g, unsubscribeUrl)
        : buildCampaignHtml(campaign.htmlContent, unsubscribeUrl, campaign.previewText);
      const text = cachedText ?? htmlToText(html);

      const result = await resend.emails.send({
        from: `${campaign.fromName} <${campaign.fromEmail}>`,
        to: subscriber.email,
        subject: campaign.subject,
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
        sentAt: new Date(),
      });

      sent++;
    } catch {
      failed++;
    }
  }

  await db
    .update(emailCampaigns)
    .set({ status: 'sent', sentAt: new Date(), totalSent: sent, updatedAt: new Date() })
    .where(eq(emailCampaigns.id, campaignId));

  return NextResponse.json({ success: true, data: { sent, failed, total: targets.length } });
}
