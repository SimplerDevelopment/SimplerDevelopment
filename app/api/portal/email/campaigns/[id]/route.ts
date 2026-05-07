import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { emailCampaigns, emailCampaignSends, emailSubscribers, emailLists } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { renderBlocksToEmailHtml } from '@/lib/email';

async function requireClient() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return getPortalClient(parseInt(session.user.id, 10));
}

async function ownsCampaign(clientId: number, campaignId: number) {
  const [c] = await db
    .select({ id: emailCampaigns.id, status: emailCampaigns.status })
    .from(emailCampaigns)
    .where(and(eq(emailCampaigns.id, campaignId), eq(emailCampaigns.clientId, clientId)))
    .limit(1);
  return c ?? null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const client = await requireClient();
  if (!client) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const campaignId = parseInt(id);

  if (!await ownsCampaign(client.id, campaignId)) {
    return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  }

  const [campaign] = await db
    .select({
      id: emailCampaigns.id,
      name: emailCampaigns.name,
      subject: emailCampaigns.subject,
      previewText: emailCampaigns.previewText,
      fromName: emailCampaigns.fromName,
      fromEmail: emailCampaigns.fromEmail,
      replyTo: emailCampaigns.replyTo,
      listId: emailCampaigns.listId,
      htmlContent: emailCampaigns.htmlContent,
      blockContent: emailCampaigns.blockContent,
      contentBlocks: emailCampaigns.contentBlocks,
      useBlockEditor: emailCampaigns.useBlockEditor,
      status: emailCampaigns.status,
      scheduledAt: emailCampaigns.scheduledAt,
      sentAt: emailCampaigns.sentAt,
      totalRecipients: emailCampaigns.totalRecipients,
      totalSent: emailCampaigns.totalSent,
      totalOpened: emailCampaigns.totalOpened,
      totalClicked: emailCampaigns.totalClicked,
      totalBounced: emailCampaigns.totalBounced,
      totalUnsubscribed: emailCampaigns.totalUnsubscribed,
      createdAt: emailCampaigns.createdAt,
      listName: emailLists.name,
    })
    .from(emailCampaigns)
    .leftJoin(emailLists, eq(emailCampaigns.listId, emailLists.id))
    .where(eq(emailCampaigns.id, campaignId))
    .limit(1);

  const sends = await db
    .select({
      id: emailCampaignSends.id,
      email: emailSubscribers.email,
      name: emailSubscribers.name,
      sentAt: emailCampaignSends.sentAt,
      openedAt: emailCampaignSends.openedAt,
      clickedAt: emailCampaignSends.clickedAt,
      bouncedAt: emailCampaignSends.bouncedAt,
    })
    .from(emailCampaignSends)
    .innerJoin(emailSubscribers, eq(emailCampaignSends.subscriberId, emailSubscribers.id))
    .where(eq(emailCampaignSends.campaignId, campaignId))
    .limit(100);

  return NextResponse.json({ success: true, data: { campaign, sends } });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const client = await requireClient();
  if (!client) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const campaignId = parseInt(id);
  const existing = await ownsCampaign(client.id, campaignId);
  if (!existing) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  if (existing.status === 'sent') return NextResponse.json({ success: false, message: 'Cannot edit a sent campaign' }, { status: 400 });

  const {
    name,
    subject,
    previewText,
    fromName,
    fromEmail,
    replyTo,
    htmlContent,
    blockContent,
    contentBlocks,
    useBlockEditor,
    scheduledAt,
  } = await req.json();

  // If blockContent provided, render to HTML
  let finalHtml = htmlContent?.trim() || undefined;
  if (blockContent?.blocks) {
    finalHtml = renderBlocksToEmailHtml(blockContent.blocks);
  }
  // If the new contentBlocks (Block[]) array is provided, also render it
  // into htmlContent so legacy consumers (preview rendering, sites that
  // don't yet read useBlockEditor) keep working. The send path consults
  // useBlockEditor + contentBlocks first, and falls back to htmlContent.
  if (Array.isArray(contentBlocks)) {
    finalHtml = renderBlocksToEmailHtml(contentBlocks);
  }

  const [updated] = await db
    .update(emailCampaigns)
    .set({
      ...(name && { name: name.trim() }),
      ...(subject && { subject: subject.trim() }),
      previewText: previewText?.trim() || null,
      ...(fromName && { fromName: fromName.trim() }),
      ...(fromEmail && { fromEmail: fromEmail.trim() }),
      replyTo: replyTo?.trim() || null,
      ...(finalHtml && { htmlContent: finalHtml }),
      ...(blockContent !== undefined && { blockContent }),
      ...(contentBlocks !== undefined && { contentBlocks }),
      ...(typeof useBlockEditor === 'boolean' && { useBlockEditor }),
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      status: scheduledAt ? 'scheduled' : 'draft',
      updatedAt: new Date(),
    })
    .where(eq(emailCampaigns.id, campaignId))
    .returning();

  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const client = await requireClient();
  if (!client) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const campaignId = parseInt(id);
  const existing = await ownsCampaign(client.id, campaignId);
  if (!existing) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  if (existing.status === 'sending') return NextResponse.json({ success: false, message: 'Cannot delete a sending campaign' }, { status: 400 });

  await db.delete(emailCampaigns).where(eq(emailCampaigns.id, campaignId));
  return NextResponse.json({ success: true });
}
