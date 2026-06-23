import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import {
  crmProposals,
  crmContacts,
  crmCompanies,
  crmDeals,
} from '@/lib/db/schema';
import { and, eq, desc, sql } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client)
    return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const url = req.nextUrl;
  const status = url.searchParams.get('status') || '';
  const dealId = url.searchParams.get('dealId') || '';
  const search = url.searchParams.get('search') || '';

  const conditions = [eq(crmProposals.clientId, client.id)];

  if (status) {
    conditions.push(eq(crmProposals.status, status));
  }
  if (dealId) {
    conditions.push(eq(crmProposals.dealId, parseInt(dealId, 10)));
  }
  if (search) {
    conditions.push(sql`${crmProposals.title} ILIKE ${'%' + search + '%'}`);
  }

  const proposals = await db
    .select({
      id: crmProposals.id,
      clientId: crmProposals.clientId,
      contactId: crmProposals.contactId,
      companyId: crmProposals.companyId,
      dealId: crmProposals.dealId,
      title: crmProposals.title,
      summary: crmProposals.summary,
      status: crmProposals.status,
      currency: crmProposals.currency,
      validUntil: crmProposals.validUntil,
      lineItems: crmProposals.lineItems,
      fees: crmProposals.fees,
      sentAt: crmProposals.sentAt,
      viewCount: crmProposals.viewCount,
      acceptedAt: crmProposals.acceptedAt,
      declinedAt: crmProposals.declinedAt,
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
    .where(and(...conditions))
    .orderBy(desc(crmProposals.updatedAt));

  return NextResponse.json({ success: true, data: proposals });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client)
    return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const body = await req.json();

  if (!body.title?.trim()) {
    return NextResponse.json(
      { success: false, message: 'Proposal title is required' },
      { status: 400 }
    );
  }

  const clientToken = crypto.randomBytes(32).toString('hex');

  const [proposal] = await db
    .insert(crmProposals)
    .values({
      clientId: client.id,
      contactId: body.contactId || null,
      companyId: body.companyId || null,
      dealId: body.dealId || null,
      title: body.title.trim(),
      summary: body.summary?.trim() || null,
      status: 'draft',
      sections: body.sections || [],
      lineItems: body.lineItems || [],
      fees: body.fees || [],
      currency: body.currency || 'USD',
      validUntil: body.validUntil ? new Date(body.validUntil) : null,
      clientToken,
      accentColor: body.accentColor || '#2563eb',
      logoUrl: body.logoUrl || null,
      coverImageUrl: body.coverImageUrl || null,
      footerText: body.footerText?.trim() || null,
      createdBy: userId,
    })
    .returning();

  return NextResponse.json({ success: true, data: proposal }, { status: 201 });
}
