import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import {
  crmContacts,
  crmActivities,
  crmDeals,
  crmContactTags,
  crmCustomFieldValues,
} from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json(
      { success: false, message: 'Unauthorized' },
      { status: 401 }
    );

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client)
    return NextResponse.json(
      { success: false, message: 'Client not found' },
      { status: 404 }
    );

  const body = await req.json();
  const { primaryId, secondaryId } = body;

  if (!primaryId || !secondaryId) {
    return NextResponse.json(
      { success: false, message: 'primaryId and secondaryId are required' },
      { status: 400 }
    );
  }

  if (primaryId === secondaryId) {
    return NextResponse.json(
      { success: false, message: 'primaryId and secondaryId must be different' },
      { status: 400 }
    );
  }

  // Verify both contacts exist and belong to this client
  const [primary] = await db
    .select()
    .from(crmContacts)
    .where(and(eq(crmContacts.id, primaryId), eq(crmContacts.clientId, client.id)));

  const [secondary] = await db
    .select()
    .from(crmContacts)
    .where(and(eq(crmContacts.id, secondaryId), eq(crmContacts.clientId, client.id)));

  if (!primary || !secondary) {
    return NextResponse.json(
      { success: false, message: 'One or both contacts not found' },
      { status: 404 }
    );
  }

  // Perform merge in a transaction
  const merged = await db.transaction(async (tx) => {
    // 1. Move all activities from secondary to primary
    await tx
      .update(crmActivities)
      .set({ contactId: primaryId })
      .where(eq(crmActivities.contactId, secondaryId));

    // 2. Move all deals from secondary to primary
    await tx
      .update(crmDeals)
      .set({ contactId: primaryId })
      .where(eq(crmDeals.contactId, secondaryId));

    // 3. Move tags from secondary to primary (skip duplicates)
    const primaryTags = await tx
      .select({ tagId: crmContactTags.tagId })
      .from(crmContactTags)
      .where(eq(crmContactTags.contactId, primaryId));

    const primaryTagIds = new Set(primaryTags.map((t) => t.tagId));

    const secondaryTags = await tx
      .select({ tagId: crmContactTags.tagId })
      .from(crmContactTags)
      .where(eq(crmContactTags.contactId, secondaryId));

    const newTags = secondaryTags.filter((t) => !primaryTagIds.has(t.tagId));
    if (newTags.length > 0) {
      await tx.insert(crmContactTags).values(
        newTags.map((t) => ({
          contactId: primaryId,
          tagId: t.tagId,
        }))
      );
    }

    // Remove secondary's tag associations
    await tx
      .delete(crmContactTags)
      .where(eq(crmContactTags.contactId, secondaryId));

    // 4. Move custom field values from secondary to primary (skip if primary already has value)
    const primaryFields = await tx
      .select({ customFieldId: crmCustomFieldValues.customFieldId })
      .from(crmCustomFieldValues)
      .where(
        and(
          eq(crmCustomFieldValues.entityId, primaryId),
          eq(crmCustomFieldValues.entityType, 'contact')
        )
      );

    const primaryFieldIds = new Set(primaryFields.map((f) => f.customFieldId));

    const secondaryFields = await tx
      .select()
      .from(crmCustomFieldValues)
      .where(
        and(
          eq(crmCustomFieldValues.entityId, secondaryId),
          eq(crmCustomFieldValues.entityType, 'contact')
        )
      );

    for (const field of secondaryFields) {
      if (!primaryFieldIds.has(field.customFieldId)) {
        await tx.insert(crmCustomFieldValues).values({
          customFieldId: field.customFieldId,
          entityId: primaryId,
          entityType: 'contact',
          value: field.value,
        });
      }
    }

    // Remove secondary's custom field values
    await tx
      .delete(crmCustomFieldValues)
      .where(
        and(
          eq(crmCustomFieldValues.entityId, secondaryId),
          eq(crmCustomFieldValues.entityType, 'contact')
        )
      );

    // 5. Fill in missing fields on primary from secondary
    const fillData: Record<string, unknown> = { updatedAt: new Date() };
    if (!primary.email && secondary.email) fillData.email = secondary.email;
    if (!primary.phone && secondary.phone) fillData.phone = secondary.phone;
    if (!primary.title && secondary.title) fillData.title = secondary.title;
    if (!primary.lastName && secondary.lastName) fillData.lastName = secondary.lastName;
    if (!primary.source && secondary.source) fillData.source = secondary.source;
    if (!primary.avatarUrl && secondary.avatarUrl) fillData.avatarUrl = secondary.avatarUrl;
    if (!primary.address && secondary.address) fillData.address = secondary.address;
    if (!primary.notes && secondary.notes) fillData.notes = secondary.notes;
    if (!primary.companyId && secondary.companyId) fillData.companyId = secondary.companyId;
    if (!primary.ownerId && secondary.ownerId) fillData.ownerId = secondary.ownerId;

    const [updated] = await tx
      .update(crmContacts)
      .set(fillData)
      .where(eq(crmContacts.id, primaryId))
      .returning();

    // 6. Delete the secondary contact
    await tx
      .delete(crmContacts)
      .where(eq(crmContacts.id, secondaryId));

    return updated;
  });

  return NextResponse.json({ success: true, data: merged });
}
