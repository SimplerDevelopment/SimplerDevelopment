import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { crmContracts, crmContractSigners, crmContacts, crmCompanies, crmDeals } from '@/lib/db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import crypto from 'crypto';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false }, { status: 401 });
  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) return NextResponse.json({ success: false }, { status: 404 });

  const url = req.nextUrl;
  const status = url.searchParams.get('status') || '';
  const search = url.searchParams.get('search') || '';

  const conditions = [eq(crmContracts.clientId, client.id)];
  if (status) conditions.push(eq(crmContracts.status, status));
  if (search) conditions.push(sql`${crmContracts.title} ILIKE ${'%' + search + '%'}`);

  const contracts = await db.select({
    id: crmContracts.id,
    title: crmContracts.title,
    summary: crmContracts.summary,
    status: crmContracts.status,
    proposalId: crmContracts.proposalId,
    dealId: crmContracts.dealId,
    contactId: crmContracts.contactId,
    companyId: crmContracts.companyId,
    validUntil: crmContracts.validUntil,
    sentAt: crmContracts.sentAt,
    fullyExecutedAt: crmContracts.fullyExecutedAt,
    createdAt: crmContracts.createdAt,
    contactName: sql<string>`CONCAT(${crmContacts.firstName}, ' ', ${crmContacts.lastName})`,
    companyName: crmCompanies.name,
    dealTitle: crmDeals.title,
  })
    .from(crmContracts)
    .leftJoin(crmContacts, eq(crmContracts.contactId, crmContacts.id))
    .leftJoin(crmCompanies, eq(crmContracts.companyId, crmCompanies.id))
    .leftJoin(crmDeals, eq(crmContracts.dealId, crmDeals.id))
    .where(and(...conditions))
    .orderBy(desc(crmContracts.createdAt));

  // Fetch signer counts
  const contractIds = contracts.map(c => c.id);
  const signerStats: Record<number, { total: number; signed: number }> = {};
  if (contractIds.length > 0) {
    for (const cid of contractIds) {
      const signers = await db.select({ status: crmContractSigners.status })
        .from(crmContractSigners)
        .where(eq(crmContractSigners.contractId, cid));
      signerStats[cid] = {
        total: signers.length,
        signed: signers.filter(s => s.status === 'signed').length,
      };
    }
  }

  const data = contracts.map(c => ({
    ...c,
    signers: signerStats[c.id] || { total: 0, signed: 0 },
  }));

  return NextResponse.json({ success: true, data });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false }, { status: 401 });
  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false }, { status: 404 });

  const body = await req.json();
  const { title, summary, proposalId, dealId, contactId, companyId, clauses, lineItems, fees, currency, validUntil, accentColor, logoUrl, footerText, signers } = body;

  if (!title?.trim()) return NextResponse.json({ success: false, message: 'Title is required' }, { status: 400 });

  const clientToken = crypto.randomBytes(32).toString('hex');

  const [contract] = await db.insert(crmContracts).values({
    clientId: client.id,
    proposalId: proposalId || null,
    dealId: dealId || null,
    contactId: contactId || null,
    companyId: companyId || null,
    title: title.trim(),
    summary: summary?.trim() || null,
    clauses: clauses || [],
    lineItems: lineItems || [],
    fees: fees || [],
    currency: currency || 'USD',
    validUntil: validUntil ? new Date(validUntil) : null,
    clientToken,
    accentColor: accentColor || '#2563eb',
    logoUrl: logoUrl || null,
    footerText: footerText || null,
    createdBy: userId,
  }).returning();

  // Create signers if provided
  if (signers && Array.isArray(signers) && signers.length > 0) {
    for (const signer of signers) {
      if (!signer.name?.trim() || !signer.email?.trim()) continue;
      const signerToken = crypto.randomBytes(32).toString('hex');
      await db.insert(crmContractSigners).values({
        contractId: contract.id,
        name: signer.name.trim(),
        email: signer.email.trim(),
        role: signer.role || 'signer',
        order: signer.order || 0,
        token: signerToken,
      });
    }
  }

  return NextResponse.json({ success: true, data: contract }, { status: 201 });
}
