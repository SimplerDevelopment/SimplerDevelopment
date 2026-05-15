import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import {
  crmContacts,
  crmCompanies,
  crmContactTags,
  crmTags,
  crmActivities,
  crmCustomFields,
  crmCustomFieldValues,
} from '@/lib/db/schema';
import { and, eq, desc, inArray } from 'drizzle-orm';
import { validateCrmName } from '@/lib/crm/parse';

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

  const contactId = parseInt(id, 10);
  if (isNaN(contactId))
    return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });

  const [contact] = await db
    .select({
      id: crmContacts.id,
      clientId: crmContacts.clientId,
      companyId: crmContacts.companyId,
      firstName: crmContacts.firstName,
      lastName: crmContacts.lastName,
      email: crmContacts.email,
      phone: crmContacts.phone,
      linkedinUrl: crmContacts.linkedinUrl,
      title: crmContacts.title,
      source: crmContacts.source,
      status: crmContacts.status,
      avatarUrl: crmContacts.avatarUrl,
      address: crmContacts.address,
      notes: crmContacts.notes,
      lastContactedAt: crmContacts.lastContactedAt,
      score: crmContacts.score,
      ownerId: crmContacts.ownerId,
      createdAt: crmContacts.createdAt,
      updatedAt: crmContacts.updatedAt,
      companyName: crmCompanies.name,
      companyDomain: crmCompanies.domain,
    })
    .from(crmContacts)
    .leftJoin(crmCompanies, eq(crmContacts.companyId, crmCompanies.id))
    .where(and(eq(crmContacts.id, contactId), eq(crmContacts.clientId, client.id)));

  if (!contact)
    return NextResponse.json({ success: false, message: 'Contact not found' }, { status: 404 });

  // Fetch tags
  const tags = await db
    .select({
      id: crmTags.id,
      name: crmTags.name,
      color: crmTags.color,
    })
    .from(crmContactTags)
    .innerJoin(crmTags, eq(crmContactTags.tagId, crmTags.id))
    .where(eq(crmContactTags.contactId, contactId));

  // Fetch recent activities
  const recentActivities = await db
    .select()
    .from(crmActivities)
    .where(
      and(
        eq(crmActivities.clientId, client.id),
        eq(crmActivities.contactId, contactId)
      )
    )
    .orderBy(desc(crmActivities.createdAt))
    .limit(10);

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
        eq(crmCustomFieldValues.entityId, contactId),
        eq(crmCustomFieldValues.entityType, 'contact')
      )
    )
    .where(
      and(
        eq(crmCustomFields.clientId, client.id),
        eq(crmCustomFields.entityType, 'contact')
      )
    );

  const customFields: Record<number, { name: string; type: string; value: string | null }> = {};
  for (const row of customFieldRows) {
    customFields[row.fieldId] = { name: row.fieldName, type: row.fieldType, value: row.value };
  }

  return NextResponse.json({
    success: true,
    data: { ...contact, tags, recentActivities, customFields },
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

  const contactId = parseInt(id, 10);
  if (isNaN(contactId))
    return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });

  // Verify ownership
  const [existing] = await db
    .select({ id: crmContacts.id })
    .from(crmContacts)
    .where(and(eq(crmContacts.id, contactId), eq(crmContacts.clientId, client.id)));

  if (!existing)
    return NextResponse.json({ success: false, message: 'Contact not found' }, { status: 404 });

  const body = await req.json();

  // Validate free-text inputs (see contacts/route.ts POST for rationale).
  for (const field of ['firstName', 'lastName', 'notes'] as const) {
    if (body[field] !== undefined) {
      const v = validateCrmName(body[field], field);
      if (!v.ok) {
        return NextResponse.json(
          { success: false, error: v.error, field },
          { status: 400 }
        );
      }
      // Replace on body so the downstream assignment uses the cleaned value.
      body[field] = v.value;
    }
  }

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (body.firstName !== undefined) {
    if (!body.firstName) {
      return NextResponse.json(
        { success: false, message: 'First name is required' },
        { status: 400 }
      );
    }
    updateData.firstName = body.firstName;
  }
  if (body.lastName !== undefined) updateData.lastName = body.lastName ?? null;
  if (body.email !== undefined) updateData.email = body.email?.trim() || null;
  if (body.phone !== undefined) updateData.phone = body.phone?.trim() || null;
  if (body.linkedinUrl !== undefined) updateData.linkedinUrl = body.linkedinUrl?.trim() || null;
  if (body.title !== undefined) updateData.title = body.title?.trim() || null;
  if (body.source !== undefined) updateData.source = body.source?.trim() || null;
  if (body.status !== undefined) updateData.status = body.status;
  if (body.companyId !== undefined) updateData.companyId = body.companyId || null;
  if (body.avatarUrl !== undefined) updateData.avatarUrl = body.avatarUrl || null;
  if (body.address !== undefined) updateData.address = body.address?.trim() || null;
  if (body.notes !== undefined) updateData.notes = body.notes ?? null;
  if (body.lastContactedAt !== undefined)
    updateData.lastContactedAt = body.lastContactedAt ? new Date(body.lastContactedAt) : null;
  if (body.ownerId !== undefined) updateData.ownerId = body.ownerId || null;

  const [updated] = await db
    .update(crmContacts)
    .set(updateData)
    .where(eq(crmContacts.id, contactId))
    .returning();

  // Update tags if provided
  if (body.tagIds !== undefined && Array.isArray(body.tagIds)) {
    await db.delete(crmContactTags).where(eq(crmContactTags.contactId, contactId));
    if (body.tagIds.length > 0) {
      await db.insert(crmContactTags).values(
        body.tagIds.map((tagId: number) => ({
          contactId,
          tagId,
        }))
      );
    }
  }

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

  const contactId = parseInt(id, 10);
  if (isNaN(contactId))
    return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });

  const [deleted] = await db
    .delete(crmContacts)
    .where(and(eq(crmContacts.id, contactId), eq(crmContacts.clientId, client.id)))
    .returning();

  if (!deleted)
    return NextResponse.json({ success: false, message: 'Contact not found' }, { status: 404 });

  return NextResponse.json({ success: true, data: deleted });
}
