import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { crmCompanies } from '@/lib/db/schema';
import { and, eq, desc, sql } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client)
    return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const search = req.nextUrl.searchParams.get('search') || '';

  const conditions = [eq(crmCompanies.clientId, client.id)];
  if (search) {
    conditions.push(
      sql`(${crmCompanies.name} ILIKE ${'%' + search + '%'} OR ${crmCompanies.domain} ILIKE ${'%' + search + '%'})`
    );
  }

  const companies = await db
    .select()
    .from(crmCompanies)
    .where(and(...conditions))
    .orderBy(desc(crmCompanies.createdAt));

  return NextResponse.json({ success: true, data: companies });
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

  if (!body.name?.trim()) {
    return NextResponse.json(
      { success: false, message: 'Company name is required' },
      { status: 400 }
    );
  }

  const [company] = await db
    .insert(crmCompanies)
    .values({
      clientId: client.id,
      name: body.name.trim(),
      domain: body.domain?.trim() || null,
      industry: body.industry?.trim() || null,
      size: body.size || null,
      phone: body.phone?.trim() || null,
      address: body.address?.trim() || null,
      website: body.website?.trim() || null,
      notes: body.notes?.trim() || null,
    })
    .returning();

  return NextResponse.json({ success: true, data: company }, { status: 201 });
}
