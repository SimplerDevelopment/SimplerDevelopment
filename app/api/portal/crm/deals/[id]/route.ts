import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import {
  crmDeals,
  crmContacts,
  crmCompanies,
  crmPipelineStages,
  crmCustomFields,
  crmCustomFieldValues,
} from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { emitEvent } from '@/lib/automation';
import { createCrmNotification, notifyAllClientUsers } from '@/lib/crm/notifications';
import {
  assertStageInClient,
  assertPipelineInClient,
  assertContactInClient,
  assertCompanyInClient,
  assertUserVisibleToClient,
  OwnershipError,
} from '@/lib/security/assert-owned';

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

  const dealId = parseInt(id, 10);
  if (isNaN(dealId))
    return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });

  const [deal] = await db
    .select({
      id: crmDeals.id,
      clientId: crmDeals.clientId,
      pipelineId: crmDeals.pipelineId,
      stageId: crmDeals.stageId,
      contactId: crmDeals.contactId,
      companyId: crmDeals.companyId,
      title: crmDeals.title,
      value: crmDeals.value,
      currency: crmDeals.currency,
      status: crmDeals.status,
      priority: crmDeals.priority,
      expectedCloseDate: crmDeals.expectedCloseDate,
      closedAt: crmDeals.closedAt,
      notes: crmDeals.notes,
      sortOrder: crmDeals.sortOrder,
      createdAt: crmDeals.createdAt,
      updatedAt: crmDeals.updatedAt,
      contactFirstName: crmContacts.firstName,
      contactLastName: crmContacts.lastName,
      contactEmail: crmContacts.email,
      companyName: crmCompanies.name,
      stageName: crmPipelineStages.name,
      stageColor: crmPipelineStages.color,
    })
    .from(crmDeals)
    .leftJoin(crmContacts, eq(crmDeals.contactId, crmContacts.id))
    .leftJoin(crmCompanies, eq(crmDeals.companyId, crmCompanies.id))
    .leftJoin(crmPipelineStages, eq(crmDeals.stageId, crmPipelineStages.id))
    .where(and(eq(crmDeals.id, dealId), eq(crmDeals.clientId, client.id)));

  if (!deal)
    return NextResponse.json({ success: false, message: 'Deal not found' }, { status: 404 });

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
        eq(crmCustomFieldValues.entityId, dealId),
        eq(crmCustomFieldValues.entityType, 'deal')
      )
    )
    .where(
      and(
        eq(crmCustomFields.clientId, client.id),
        eq(crmCustomFields.entityType, 'deal')
      )
    );

  const customFields: Record<number, { name: string; type: string; value: string | null }> = {};
  for (const row of customFieldRows) {
    customFields[row.fieldId] = { name: row.fieldName, type: row.fieldType, value: row.value };
  }

  return NextResponse.json({ success: true, data: { ...deal, customFields } });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await getAuthedClient();
  if ('error' in result) return result.error;
  const { client } = result;

  const dealId = parseInt(id, 10);
  if (isNaN(dealId))
    return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });

  const [existing] = await db
    .select({ id: crmDeals.id, ownerId: crmDeals.ownerId })
    .from(crmDeals)
    .where(and(eq(crmDeals.id, dealId), eq(crmDeals.clientId, client.id)));

  if (!existing)
    return NextResponse.json({ success: false, message: 'Deal not found' }, { status: 404 });

  const body = await req.json();

  // Validate every foreign key supplied in the body belongs to this client.
  // Without these checks an attacker can point a deal at another tenant's
  // stage / pipeline / contact / company / owner via mass-assignment.
  try {
    if (body.stageId !== undefined && body.stageId !== null) {
      await assertStageInClient(Number(body.stageId), client.id);
    }
    if (body.pipelineId !== undefined && body.pipelineId !== null) {
      await assertPipelineInClient(Number(body.pipelineId), client.id);
    }
    if (body.contactId) await assertContactInClient(Number(body.contactId), client.id);
    if (body.companyId) await assertCompanyInClient(Number(body.companyId), client.id);
    if (body.ownerId) await assertUserVisibleToClient(Number(body.ownerId), client.id);
  } catch (err) {
    if (err instanceof OwnershipError) {
      return NextResponse.json({ success: false, message: err.message }, { status: 403 });
    }
    throw err;
  }

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (body.title !== undefined) updateData.title = body.title.trim();
  if (body.value !== undefined) updateData.value = body.value;
  if (body.currency !== undefined) updateData.currency = body.currency;
  if (body.status !== undefined) {
    updateData.status = body.status;
    if (body.status === 'won' || body.status === 'lost') {
      updateData.closedAt = new Date();
    } else if (body.status === 'open') {
      updateData.closedAt = null;
    }
  }
  if (body.priority !== undefined) updateData.priority = body.priority;
  if (body.stageId !== undefined) updateData.stageId = body.stageId;
  if (body.pipelineId !== undefined) updateData.pipelineId = body.pipelineId;
  if (body.contactId !== undefined) updateData.contactId = body.contactId || null;
  if (body.companyId !== undefined) updateData.companyId = body.companyId || null;
  if (body.expectedCloseDate !== undefined)
    updateData.expectedCloseDate = body.expectedCloseDate ? new Date(body.expectedCloseDate) : null;
  if (body.notes !== undefined) updateData.notes = body.notes?.trim() || null;
  if (body.sortOrder !== undefined) updateData.sortOrder = body.sortOrder;
  if (body.ownerId !== undefined) updateData.ownerId = body.ownerId || null;
  if (body.recurringValue !== undefined) updateData.recurringValue = body.recurringValue;
  if (body.billingCycle !== undefined) updateData.billingCycle = body.billingCycle || null;

  const [updated] = await db
    .update(crmDeals)
    .set(updateData)
    .where(eq(crmDeals.id, dealId))
    .returning();

  // Notify all client users when the deal stage changes
  if (body.stageId !== undefined) {
    let stageName = 'Unknown';
    const [stage] = await db
      .select({ name: crmPipelineStages.name })
      .from(crmPipelineStages)
      .where(eq(crmPipelineStages.id, body.stageId));
    if (stage) stageName = stage.name;

    notifyAllClientUsers({
      clientId: client.id,
      excludeUserId: result.userId,
      type: 'deal_stage_changed',
      title: `Deal '${updated.title}' moved to stage '${stageName}'`,
      entityType: 'deal',
      entityId: updated.id,
    });
  }

  // Notify the new owner when a deal is (re)assigned (only if owner actually
  // changed, and the new owner isn't the actor making the change).
  if (
    body.ownerId !== undefined &&
    updated.ownerId &&
    updated.ownerId !== existing.ownerId &&
    updated.ownerId !== result.userId
  ) {
    createCrmNotification({
      clientId: client.id,
      userId: updated.ownerId,
      type: 'deal_assigned',
      title: `You were assigned to deal: ${updated.title}`,
      entityType: 'deal',
      entityId: updated.id,
    });
  }

  // Emit specific event for won/lost, generic for other updates
  const eventPayload = { id: updated.id, title: updated.title, value: updated.value, status: updated.status, stageId: updated.stageId, contactId: updated.contactId };
  if (body.status === 'won') {
    emitEvent('crm.deal.won', client.id, result.userId, eventPayload);
  } else if (body.status === 'lost') {
    emitEvent('crm.deal.lost', client.id, result.userId, eventPayload);
  } else {
    emitEvent('crm.deal.updated', client.id, result.userId, eventPayload);
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

  const dealId = parseInt(id, 10);
  if (isNaN(dealId))
    return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });

  const [deleted] = await db
    .delete(crmDeals)
    .where(and(eq(crmDeals.id, dealId), eq(crmDeals.clientId, client.id)))
    .returning();

  if (!deleted)
    return NextResponse.json({ success: false, message: 'Deal not found' }, { status: 404 });

  return NextResponse.json({ success: true, data: deleted });
}
