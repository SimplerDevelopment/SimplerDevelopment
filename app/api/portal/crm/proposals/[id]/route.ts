import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import {
  crmProposals,
  crmContacts,
  crmCompanies,
  crmDeals,
} from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

async function getAuthedClient() {
  const session = await auth();
  if (!session?.user?.id)
    return { error: NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 }) };
  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client)
    return { error: NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 }) };
  return { client, userId };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await getAuthedClient();
  if ('error' in result) return result.error;
  const { client } = result;

  const proposalId = parseInt(id, 10);
  if (isNaN(proposalId))
    return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });

  const [proposal] = await db
    .select({
      id: crmProposals.id,
      clientId: crmProposals.clientId,
      contactId: crmProposals.contactId,
      companyId: crmProposals.companyId,
      dealId: crmProposals.dealId,
      title: crmProposals.title,
      summary: crmProposals.summary,
      status: crmProposals.status,
      sections: crmProposals.sections,
      lineItems: crmProposals.lineItems,
      fees: crmProposals.fees,
      currency: crmProposals.currency,
      validUntil: crmProposals.validUntil,
      clientToken: crmProposals.clientToken,
      signatureName: crmProposals.signatureName,
      signatureData: crmProposals.signatureData,
      signedAt: crmProposals.signedAt,
      signedIp: crmProposals.signedIp,
      sentAt: crmProposals.sentAt,
      firstViewedAt: crmProposals.firstViewedAt,
      lastViewedAt: crmProposals.lastViewedAt,
      viewCount: crmProposals.viewCount,
      acceptedAt: crmProposals.acceptedAt,
      declinedAt: crmProposals.declinedAt,
      declineReason: crmProposals.declineReason,
      accentColor: crmProposals.accentColor,
      logoUrl: crmProposals.logoUrl,
      coverImageUrl: crmProposals.coverImageUrl,
      footerText: crmProposals.footerText,
      createdBy: crmProposals.createdBy,
      createdAt: crmProposals.createdAt,
      updatedAt: crmProposals.updatedAt,
      contactFirstName: crmContacts.firstName,
      contactLastName: crmContacts.lastName,
      contactEmail: crmContacts.email,
      companyName: crmCompanies.name,
      dealTitle: crmDeals.title,
    })
    .from(crmProposals)
    .leftJoin(crmContacts, eq(crmProposals.contactId, crmContacts.id))
    .leftJoin(crmCompanies, eq(crmProposals.companyId, crmCompanies.id))
    .leftJoin(crmDeals, eq(crmProposals.dealId, crmDeals.id))
    .where(and(eq(crmProposals.id, proposalId), eq(crmProposals.clientId, client.id)));

  if (!proposal)
    return NextResponse.json({ success: false, message: 'Proposal not found' }, { status: 404 });

  return NextResponse.json({ success: true, data: proposal });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await getAuthedClient();
  if ('error' in result) return result.error;
  const { client } = result;

  const proposalId = parseInt(id, 10);
  if (isNaN(proposalId))
    return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });

  const [existing] = await db
    .select({ id: crmProposals.id })
    .from(crmProposals)
    .where(and(eq(crmProposals.id, proposalId), eq(crmProposals.clientId, client.id)));

  if (!existing)
    return NextResponse.json({ success: false, message: 'Proposal not found' }, { status: 404 });

  const body = await req.json();

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (body.title !== undefined) updateData.title = body.title.trim();
  if (body.summary !== undefined) updateData.summary = body.summary?.trim() || null;
  if (body.sections !== undefined) updateData.sections = body.sections;
  if (body.lineItems !== undefined) updateData.lineItems = body.lineItems;
  if (body.fees !== undefined) updateData.fees = body.fees;
  if (body.contactId !== undefined) updateData.contactId = body.contactId || null;
  if (body.companyId !== undefined) updateData.companyId = body.companyId || null;
  if (body.dealId !== undefined) updateData.dealId = body.dealId || null;
  if (body.currency !== undefined) updateData.currency = body.currency;
  if (body.validUntil !== undefined)
    updateData.validUntil = body.validUntil ? new Date(body.validUntil) : null;
  if (body.accentColor !== undefined) updateData.accentColor = body.accentColor;
  if (body.logoUrl !== undefined) updateData.logoUrl = body.logoUrl || null;
  if (body.coverImageUrl !== undefined) updateData.coverImageUrl = body.coverImageUrl || null;
  if (body.footerText !== undefined) updateData.footerText = body.footerText?.trim() || null;

  const [updated] = await db
    .update(crmProposals)
    .set(updateData)
    .where(eq(crmProposals.id, proposalId))
    .returning();

  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await getAuthedClient();
  if ('error' in result) return result.error;
  const { client } = result;

  const proposalId = parseInt(id, 10);
  if (isNaN(proposalId))
    return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });

  const [deleted] = await db
    .delete(crmProposals)
    .where(and(eq(crmProposals.id, proposalId), eq(crmProposals.clientId, client.id)))
    .returning();

  if (!deleted)
    return NextResponse.json({ success: false, message: 'Proposal not found' }, { status: 404 });

  return NextResponse.json({ success: true, data: deleted });
}
