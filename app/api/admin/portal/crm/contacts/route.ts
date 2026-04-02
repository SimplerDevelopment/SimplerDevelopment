import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { crmContacts, crmCompanies, clients, users } from '@/lib/db/schema';
import { eq, desc, ilike, or, sql } from 'drizzle-orm';

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

  let query = db
    .select({
      id: crmContacts.id,
      firstName: crmContacts.firstName,
      lastName: crmContacts.lastName,
      email: crmContacts.email,
      phone: crmContacts.phone,
      title: crmContacts.title,
      status: crmContacts.status,
      source: crmContacts.source,
      lastContactedAt: crmContacts.lastContactedAt,
      createdAt: crmContacts.createdAt,
      companyName: crmCompanies.name,
      clientCompany: clients.company,
      clientId: crmContacts.clientId,
    })
    .from(crmContacts)
    .leftJoin(crmCompanies, eq(crmContacts.companyId, crmCompanies.id))
    .innerJoin(clients, eq(crmContacts.clientId, clients.id))
    .orderBy(desc(crmContacts.createdAt))
    .$dynamic();

  if (search) {
    const pattern = `%${search}%`;
    query = query.where(
      or(
        ilike(crmContacts.firstName, pattern),
        ilike(crmContacts.lastName, pattern),
        ilike(crmContacts.email, pattern),
        ilike(crmCompanies.name, pattern),
        ilike(clients.company, pattern),
      ),
    );
  }

  const data = await query;
  return NextResponse.json({ success: true, data });
}
