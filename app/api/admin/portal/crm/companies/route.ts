import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { crmCompanies, crmContacts, clients } from '@/lib/db/schema';
import { eq, desc, ilike, or, sql, count } from 'drizzle-orm';

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
  const search = searchParams.get('search')?.trim();

  // Get companies with client info
  let query = db
    .select({
      id: crmCompanies.id,
      name: crmCompanies.name,
      domain: crmCompanies.domain,
      industry: crmCompanies.industry,
      size: crmCompanies.size,
      phone: crmCompanies.phone,
      website: crmCompanies.website,
      createdAt: crmCompanies.createdAt,
      clientCompany: clients.company,
      clientId: crmCompanies.clientId,
    })
    .from(crmCompanies)
    .innerJoin(clients, eq(crmCompanies.clientId, clients.id))
    .orderBy(desc(crmCompanies.createdAt))
    .$dynamic();

  if (search) {
    const pattern = `%${search}%`;
    query = query.where(
      or(
        ilike(crmCompanies.name, pattern),
        ilike(crmCompanies.domain, pattern),
        ilike(crmCompanies.industry, pattern),
        ilike(clients.company, pattern),
      ),
    );
  }

  const companies = await query;

  // Get contact counts per company
  const contactCounts = await db
    .select({
      companyId: crmContacts.companyId,
      count: count(),
    })
    .from(crmContacts)
    .groupBy(crmContacts.companyId);

  const countMap = new Map(contactCounts.map(c => [c.companyId, Number(c.count)]));

  const data = companies.map(c => ({
    ...c,
    contactCount: countMap.get(c.id) ?? 0,
  }));

  return NextResponse.json({ success: true, data });
}
