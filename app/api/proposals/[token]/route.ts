import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { crmProposals, crmContacts, crmCompanies, crmDeals } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { createCrmNotification } from '@/lib/crm/notifications';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  if (!token || token.length !== 64) {
    return NextResponse.json({ success: false, message: 'Invalid token' }, { status: 400 });
  }

  const [proposal] = await db
    .select({
      id: crmProposals.id,
      clientId: crmProposals.clientId,
      dealId: crmProposals.dealId,
      createdBy: crmProposals.createdBy,
      title: crmProposals.title,
      summary: crmProposals.summary,
      status: crmProposals.status,
      sections: crmProposals.sections,
      lineItems: crmProposals.lineItems,
      fees: crmProposals.fees,
      currency: crmProposals.currency,
      validUntil: crmProposals.validUntil,
      signatureName: crmProposals.signatureName,
      signedAt: crmProposals.signedAt,
      acceptedAt: crmProposals.acceptedAt,
      declinedAt: crmProposals.declinedAt,
      declineReason: crmProposals.declineReason,
      accentColor: crmProposals.accentColor,
      logoUrl: crmProposals.logoUrl,
      coverImageUrl: crmProposals.coverImageUrl,
      footerText: crmProposals.footerText,
      sentAt: crmProposals.sentAt,
      createdAt: crmProposals.createdAt,
      contactFirstName: crmContacts.firstName,
      contactLastName: crmContacts.lastName,
      contactEmail: crmContacts.email,
      companyName: crmCompanies.name,
    })
    .from(crmProposals)
    .leftJoin(crmContacts, eq(crmProposals.contactId, crmContacts.id))
    .leftJoin(crmCompanies, eq(crmProposals.companyId, crmCompanies.id))
    .where(eq(crmProposals.clientToken, token));

  if (!proposal) {
    return NextResponse.json({ success: false, message: 'Proposal not found' }, { status: 404 });
  }

  if (proposal.status === 'draft') {
    return NextResponse.json({ success: false, message: 'Proposal not available' }, { status: 404 });
  }

  // Update view tracking
  const now = new Date();
  const viewUpdates: Record<string, unknown> = {
    lastViewedAt: now,
    viewCount: sql`${crmProposals.viewCount} + 1`,
  };

  // Detect first view: status === 'sent' means we've never recorded a view.
  const isFirstView = proposal.status === 'sent';
  if (isFirstView) {
    viewUpdates.status = 'viewed';
    viewUpdates.firstViewedAt = now;
  }

  await db
    .update(crmProposals)
    .set(viewUpdates)
    .where(eq(crmProposals.clientToken, token));

  // Notify the proposal creator on first view only. The bell maps `proposal`
  // entityType to /portal/crm/deals/<entityId>, so prefer dealId for the entity
  // link; fall back to the proposal id if the proposal isn't tied to a deal.
  if (isFirstView) {
    let recipientUserId = proposal.createdBy;
    if (!recipientUserId && proposal.dealId) {
      const [deal] = await db
        .select({ ownerId: crmDeals.ownerId })
        .from(crmDeals)
        .where(eq(crmDeals.id, proposal.dealId));
      if (deal?.ownerId) recipientUserId = deal.ownerId;
    }
    if (recipientUserId) {
      const recipient = [proposal.contactFirstName, proposal.contactLastName]
        .filter(Boolean)
        .join(' ')
        .trim() || proposal.contactEmail || null;
      createCrmNotification({
        clientId: proposal.clientId,
        userId: recipientUserId,
        type: 'proposal_viewed',
        title: `Your proposal was viewed: ${proposal.title}`,
        body: recipient ? `Viewed by ${recipient}` : undefined,
        entityType: 'proposal',
        entityId: proposal.dealId ?? proposal.id,
      }).catch((err) => {
        console.error('[notif] proposal_viewed failed', err);
      });
    }
  }

  return NextResponse.json({ success: true, data: proposal });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  if (!token || token.length !== 64) {
    return NextResponse.json({ success: false, message: 'Invalid token' }, { status: 400 });
  }

  const [proposal] = await db
    .select({
      id: crmProposals.id,
      status: crmProposals.status,
      validUntil: crmProposals.validUntil,
    })
    .from(crmProposals)
    .where(eq(crmProposals.clientToken, token));

  if (!proposal) {
    return NextResponse.json({ success: false, message: 'Proposal not found' }, { status: 404 });
  }

  if (proposal.status === 'draft') {
    return NextResponse.json({ success: false, message: 'Proposal not available' }, { status: 404 });
  }

  if (proposal.status === 'accepted' || proposal.status === 'declined') {
    return NextResponse.json(
      { success: false, message: `Proposal has already been ${proposal.status}` },
      { status: 400 }
    );
  }

  if (proposal.validUntil && new Date(proposal.validUntil) < new Date()) {
    await db
      .update(crmProposals)
      .set({ status: 'expired', updatedAt: new Date() })
      .where(eq(crmProposals.clientToken, token));
    return NextResponse.json(
      { success: false, message: 'Proposal has expired' },
      { status: 400 }
    );
  }

  const body = await req.json();
  const clientIp =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';

  if (body.action === 'accept') {
    if (!body.signatureName?.trim()) {
      return NextResponse.json(
        { success: false, message: 'Signature name is required' },
        { status: 400 }
      );
    }
    if (!body.signatureData) {
      return NextResponse.json(
        { success: false, message: 'Signature data is required' },
        { status: 400 }
      );
    }

    const now = new Date();
    const [updated] = await db
      .update(crmProposals)
      .set({
        status: 'accepted',
        signatureName: body.signatureName.trim(),
        signatureData: body.signatureData,
        signedAt: now,
        signedIp: clientIp,
        acceptedAt: now,
        updatedAt: now,
      })
      .where(eq(crmProposals.clientToken, token))
      .returning();

    return NextResponse.json({
      success: true,
      data: { status: updated.status, acceptedAt: updated.acceptedAt },
    });
  }

  if (body.action === 'decline') {
    const now = new Date();
    const [updated] = await db
      .update(crmProposals)
      .set({
        status: 'declined',
        declinedAt: now,
        declineReason: body.reason?.trim() || null,
        updatedAt: now,
      })
      .where(eq(crmProposals.clientToken, token))
      .returning();

    return NextResponse.json({
      success: true,
      data: { status: updated.status, declinedAt: updated.declinedAt },
    });
  }

  return NextResponse.json(
    { success: false, message: 'Invalid action. Use "accept" or "decline".' },
    { status: 400 }
  );
}
