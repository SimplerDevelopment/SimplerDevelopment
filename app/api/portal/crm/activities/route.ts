import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { crmActivities, crmDeals } from '@/lib/db/schema';
import { and, eq, desc, sql } from 'drizzle-orm';
import { hasServiceAccess } from '@/lib/portal-auth';
import {
  assertContactInClient,
  assertCompanyInClient,
  OwnershipError,
} from '@/lib/security/assert-owned';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client)
    return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const url = req.nextUrl;
  const contactId = url.searchParams.get('contactId') || '';
  const dealId = url.searchParams.get('dealId') || '';
  const companyId = url.searchParams.get('companyId') || '';
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const limit = Math.min(
    100,
    Math.max(1, parseInt(url.searchParams.get('limit') || '25', 10))
  );
  const offset = (page - 1) * limit;

  const conditions = [eq(crmActivities.clientId, client.id)];

  if (contactId) {
    conditions.push(eq(crmActivities.contactId, parseInt(contactId, 10)));
  }
  if (dealId) {
    conditions.push(eq(crmActivities.dealId, parseInt(dealId, 10)));
  }
  if (companyId) {
    conditions.push(eq(crmActivities.companyId, parseInt(companyId, 10)));
  }

  const where = and(...conditions);

  const [countResult] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(crmActivities)
    .where(where);

  const activities = await db
    .select()
    .from(crmActivities)
    .where(where)
    .orderBy(desc(crmActivities.createdAt))
    .limit(limit)
    .offset(offset);

  return NextResponse.json({
    success: true,
    data: { activities, total: countResult.total, page, limit },
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client)
    return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  // Paid-module gate: CRM writes require an active CRM (or bundle) subscription.
  // Mirrors the MCP layer's requireService(clientId, 'crm').
  if (!(await hasServiceAccess(client.id, 'crm'))) {
    return NextResponse.json(
      {
        success: false,
        message: 'This feature requires an active crm subscription.',
        requiresService: 'crm',
        upsellUrl: '/portal/services',
      },
      { status: 403 }
    );
  }

  const body = await req.json();

  if (!body.type?.trim() || !body.title?.trim()) {
    return NextResponse.json(
      { success: false, message: 'Type and title are required' },
      { status: 400 }
    );
  }

  if (!body.contactId && !body.dealId && !body.companyId) {
    return NextResponse.json(
      { success: false, message: 'At least one of contactId, dealId, or companyId is required' },
      { status: 400 }
    );
  }

  // Verify every linked FK belongs to this client before inserting. Without
  // this an authenticated caller could attach an activity to another tenant's
  // contact / deal / company via mass-assignment (cross-tenant write).
  try {
    if (body.contactId) await assertContactInClient(Number(body.contactId), client.id);
    if (body.companyId) await assertCompanyInClient(Number(body.companyId), client.id);
    if (body.dealId) {
      // No assertDealInClient helper exists; scope the lookup inline.
      const [deal] = await db
        .select({ id: crmDeals.id })
        .from(crmDeals)
        .where(and(eq(crmDeals.id, Number(body.dealId)), eq(crmDeals.clientId, client.id)))
        .limit(1);
      if (!deal) throw new OwnershipError('dealId', Number(body.dealId));
    }
  } catch (err) {
    if (err instanceof OwnershipError) {
      return NextResponse.json({ success: false, message: err.message }, { status: 403 });
    }
    throw err;
  }

  const [activity] = await db
    .insert(crmActivities)
    .values({
      clientId: client.id,
      contactId: body.contactId || null,
      dealId: body.dealId || null,
      companyId: body.companyId || null,
      type: body.type.trim(),
      title: body.title.trim(),
      description: body.description?.trim() || null,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      completedAt: body.completedAt ? new Date(body.completedAt) : null,
      createdBy: userId,
    })
    .returning();

  return NextResponse.json({ success: true, data: activity }, { status: 201 });
}
