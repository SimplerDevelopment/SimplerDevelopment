import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { crmCompanies, crmContacts, crmDeals, crmPipelineStages, crmCustomFields, crmCustomFieldValues } from '@/lib/db/schema';
import { and, eq, desc } from 'drizzle-orm';

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

  // Get contacts for this company
  const contacts = await db
    .select({
      id: crmContacts.id,
      firstName: crmContacts.firstName,
      lastName: crmContacts.lastName,
      email: crmContacts.email,
      phone: crmContacts.phone,
      title: crmContacts.title,
      status: crmContacts.status,
    })
    .from(crmContacts)
    .where(eq(crmContacts.companyId, companyId))
    .orderBy(desc(crmContacts.createdAt));

  // Get deals for this company with stage name and contact name
  const deals = await db
    .select({
      id: crmDeals.id,
      title: crmDeals.title,
      value: crmDeals.value,
      status: crmDeals.status,
      expectedCloseDate: crmDeals.expectedCloseDate,
      contactName: crmContacts.firstName,
      contactLastName: crmContacts.lastName,
      stageName: crmPipelineStages.name,
    })
    .from(crmDeals)
    .leftJoin(crmContacts, eq(crmDeals.contactId, crmContacts.id))
    .leftJoin(crmPipelineStages, eq(crmDeals.stageId, crmPipelineStages.id))
    .where(eq(crmDeals.companyId, companyId))
    .orderBy(desc(crmDeals.createdAt));

  const dealsFormatted = deals.map(d => ({
    id: d.id,
    title: d.title,
    value: d.value ?? 0,
    status: d.status,
    expectedCloseDate: d.expectedCloseDate,
    contactName: d.contactName ? `${d.contactName} ${d.contactLastName ?? ''}`.trim() : null,
    stageName: d.stageName ?? 'Unknown',
  }));

  // Fetch custom field values
  const customFieldRows = await db
    .select({
      fieldId: crmCustomFields.id,
      fieldName: crmCustomFields.fieldName,
      fieldType: crmCustomFields.fieldType,
      value: crmCustomFieldValues.value,
    })
    .from(crmCustomFields)
    .leftJoin(
      crmCustomFieldValues,
      and(
        eq(crmCustomFieldValues.customFieldId, crmCustomFields.id),
        eq(crmCustomFieldValues.entityId, companyId),
        eq(crmCustomFieldValues.entityType, 'company')
      )
    )
    .where(
      and(
        eq(crmCustomFields.clientId, client.id),
        eq(crmCustomFields.entityType, 'company')
      )
    );

  const customFields: Record<number, { name: string; type: string; value: string | null }> = {};
  for (const row of customFieldRows) {
    customFields[row.fieldId] = { name: row.fieldName, type: row.fieldType, value: row.value };
  }

  return NextResponse.json({
    success: true,
    data: {
      company,
      contacts,
      deals: dealsFormatted,
      customFields,
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
