import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import {
  crmDeals,
  crmContacts,
  crmCompanies,
  crmPipelineStages,
} from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

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

  return NextResponse.json({ success: true, data: deal });
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
    .select({ id: crmDeals.id })
    .from(crmDeals)
    .where(and(eq(crmDeals.id, dealId), eq(crmDeals.clientId, client.id)));

  if (!existing)
    return NextResponse.json({ success: false, message: 'Deal not found' }, { status: 404 });

  const body = await req.json();

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

  const [updated] = await db
    .update(crmDeals)
    .set(updateData)
    .where(eq(crmDeals.id, dealId))
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
