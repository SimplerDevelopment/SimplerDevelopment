import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import {
  crmDeals,
  crmContacts,
  crmCompanies,
  crmPipelineStages,
  users,
} from '@/lib/db/schema';
import { and, eq, desc, asc, sql } from 'drizzle-orm';
import { emitEvent } from '@/lib/automation';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client)
    return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const url = req.nextUrl;
  const pipelineId = url.searchParams.get('pipelineId') || '';
  const stageId = url.searchParams.get('stageId') || '';
  const status = url.searchParams.get('status') || '';
  const search = url.searchParams.get('search') || '';

  const conditions = [eq(crmDeals.clientId, client.id)];

  if (pipelineId) {
    conditions.push(eq(crmDeals.pipelineId, parseInt(pipelineId, 10)));
  }
  if (stageId) {
    conditions.push(eq(crmDeals.stageId, parseInt(stageId, 10)));
  }
  if (status) {
    conditions.push(eq(crmDeals.status, status));
  }
  if (search) {
    conditions.push(sql`${crmDeals.title} ILIKE ${'%' + search + '%'}`);
  }

  const ownerId = url.searchParams.get('ownerId') || '';
  if (ownerId) {
    conditions.push(eq(crmDeals.ownerId, parseInt(ownerId, 10)));
  }

  const deals = await db
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
      companyName: crmCompanies.name,
      stageName: crmPipelineStages.name,
      stageColor: crmPipelineStages.color,
      ownerId: crmDeals.ownerId,
      ownerName: users.name,
      recurringValue: crmDeals.recurringValue,
      billingCycle: crmDeals.billingCycle,
    })
    .from(crmDeals)
    .leftJoin(crmContacts, eq(crmDeals.contactId, crmContacts.id))
    .leftJoin(crmCompanies, eq(crmDeals.companyId, crmCompanies.id))
    .leftJoin(crmPipelineStages, eq(crmDeals.stageId, crmPipelineStages.id))
    .leftJoin(users, eq(crmDeals.ownerId, users.id))
    .where(and(...conditions))
    .orderBy(asc(crmDeals.sortOrder), desc(crmDeals.createdAt));

  const data = deals.map(d => ({
    ...d,
    contactName: [d.contactFirstName, d.contactLastName].filter(Boolean).join(' ') || null,
  }));

  return NextResponse.json({ success: true, data });
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

  if (!body.title?.trim()) {
    return NextResponse.json(
      { success: false, message: 'Deal title is required' },
      { status: 400 }
    );
  }
  if (!body.pipelineId || !body.stageId) {
    return NextResponse.json(
      { success: false, message: 'Pipeline and stage are required' },
      { status: 400 }
    );
  }

  const [deal] = await db
    .insert(crmDeals)
    .values({
      clientId: client.id,
      pipelineId: body.pipelineId,
      stageId: body.stageId,
      contactId: body.contactId || null,
      companyId: body.companyId || null,
      title: body.title.trim(),
      value: body.value != null ? body.value : null,
      currency: body.currency || 'USD',
      status: body.status || 'open',
      priority: body.priority || 'medium',
      expectedCloseDate: body.expectedCloseDate ? new Date(body.expectedCloseDate) : null,
      notes: body.notes?.trim() || null,
      recurringValue: body.recurringValue != null ? body.recurringValue : null,
      billingCycle: body.billingCycle || null,
      sortOrder: body.sortOrder ?? 0,
      ownerId: body.ownerId ?? userId,
    })
    .returning();

  emitEvent('crm.deal.created', client.id, userId, { id: deal.id, title: deal.title, value: deal.value, status: deal.status, stageId: deal.stageId, contactId: deal.contactId });

  return NextResponse.json({ success: true, data: deal }, { status: 201 });
}
