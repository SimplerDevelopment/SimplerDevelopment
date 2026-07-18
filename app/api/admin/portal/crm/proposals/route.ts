import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { crmProposals, crmContacts, crmCompanies, clients } from '@/lib/db/schema';
import { eq, desc, sql } from 'drizzle-orm';

async function requireStaff() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') return null;
  return session;
}

export async function GET(req: Request) {
  if (!(await requireStaff()))
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');

  let query = db
    .select({
      id: crmProposals.id,
      title: crmProposals.title,
      status: crmProposals.status,
      viewCount: crmProposals.viewCount,
      validUntil: crmProposals.validUntil,
      sentAt: crmProposals.sentAt,
      signedAt: crmProposals.signedAt,
      createdAt: crmProposals.createdAt,
      lineItems: crmProposals.lineItems,
      fees: crmProposals.fees,
      contactFirstName: crmContacts.firstName,
      contactLastName: crmContacts.lastName,
      companyName: crmCompanies.name,
      clientCompany: clients.company,
      clientId: crmProposals.clientId,
    })
    .from(crmProposals)
    .leftJoin(crmContacts, eq(crmProposals.contactId, crmContacts.id))
    .leftJoin(crmCompanies, eq(crmProposals.companyId, crmCompanies.id))
    .innerJoin(clients, eq(crmProposals.clientId, clients.id))
    .orderBy(desc(crmProposals.createdAt))
    .$dynamic();

  if (status && status !== 'all') {
    query = query.where(eq(crmProposals.status, status));
  }

  const data = await query;
  return NextResponse.json({ success: true, data });
}
