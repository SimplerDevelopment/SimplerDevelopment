import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { crmCompanies, crmContacts, crmDeals } from '@/lib/db/schema';
import { and, eq, sql } from 'drizzle-orm';

async function getAuthedClient() {
  const session = await auth();
  if (!session?.user?.id) return { error: NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 }) };
  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return { error: NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 }) };
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

  const companyId = parseInt(id, 10);
  if (isNaN(companyId))
    return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });

  const [company] = await db
    .select()
    .from(crmCompanies)
    .where(and(eq(crmCompanies.id, companyId), eq(crmCompanies.clientId, client.id)));

  if (!company)
    return NextResponse.json({ success: false, message: 'Company not found' }, { status: 404 });

  // Get contacts count
  const [contactsResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(crmContacts)
    .where(eq(crmContacts.companyId, companyId));

  // Get deals value sum
  const [dealsResult] = await db
    .select({
      count: sql<number>`count(*)::int`,
      totalValue: sql<number>`coalesce(sum(${crmDeals.value}), 0)::int`,
    })
    .from(crmDeals)
    .where(eq(crmDeals.companyId, companyId));

  return NextResponse.json({
    success: true,
    data: {
      ...company,
      contactsCount: contactsResult.count,
      dealsCount: dealsResult.count,
      dealsTotalValue: dealsResult.totalValue,
    },
  });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await getAuthedClient();
  if ('error' in result) return result.error;
  const { client } = result;

  const companyId = parseInt(id, 10);
  if (isNaN(companyId))
    return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });

  const [existing] = await db
    .select({ id: crmCompanies.id })
    .from(crmCompanies)
    .where(and(eq(crmCompanies.id, companyId), eq(crmCompanies.clientId, client.id)));

  if (!existing)
    return NextResponse.json({ success: false, message: 'Company not found' }, { status: 404 });

  const body = await req.json();

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name !== undefined) updateData.name = body.name.trim();
  if (body.domain !== undefined) updateData.domain = body.domain?.trim() || null;
  if (body.industry !== undefined) updateData.industry = body.industry?.trim() || null;
  if (body.size !== undefined) updateData.size = body.size || null;
  if (body.phone !== undefined) updateData.phone = body.phone?.trim() || null;
  if (body.address !== undefined) updateData.address = body.address?.trim() || null;
  if (body.website !== undefined) updateData.website = body.website?.trim() || null;
  if (body.notes !== undefined) updateData.notes = body.notes?.trim() || null;

  const [updated] = await db
    .update(crmCompanies)
    .set(updateData)
    .where(eq(crmCompanies.id, companyId))
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

  const companyId = parseInt(id, 10);
  if (isNaN(companyId))
    return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });

  const [deleted] = await db
    .delete(crmCompanies)
    .where(and(eq(crmCompanies.id, companyId), eq(crmCompanies.clientId, client.id)))
    .returning();

  if (!deleted)
    return NextResponse.json({ success: false, message: 'Company not found' }, { status: 404 });

  return NextResponse.json({ success: true, data: deleted });
}
