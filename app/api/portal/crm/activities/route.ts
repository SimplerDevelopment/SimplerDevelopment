import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { crmActivities } from '@/lib/db/schema';
import { and, eq, desc, sql } from 'drizzle-orm';

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
