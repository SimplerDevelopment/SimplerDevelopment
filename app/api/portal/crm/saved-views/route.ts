import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { crmSavedViews } from '@/lib/db/schema';
import { and, eq, asc } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client)
    return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const entityType = req.nextUrl.searchParams.get('entityType') || '';

  const conditions = [eq(crmSavedViews.clientId, client.id)];
  if (entityType) {
    conditions.push(eq(crmSavedViews.entityType, entityType));
  }

  const views = await db
    .select()
    .from(crmSavedViews)
    .where(and(...conditions))
    .orderBy(asc(crmSavedViews.sortOrder), asc(crmSavedViews.name));

  return NextResponse.json({ success: true, data: views });
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
      { success: false, message: 'Name is required' },
      { status: 400 }
    );
  }

  if (!body.entityType?.trim()) {
    return NextResponse.json(
      { success: false, message: 'Entity type is required' },
      { status: 400 }
    );
  }

  if (!body.filters || typeof body.filters !== 'object') {
    return NextResponse.json(
      { success: false, message: 'Filters object is required' },
      { status: 400 }
    );
  }

  const [view] = await db
    .insert(crmSavedViews)
    .values({
      clientId: client.id,
      entityType: body.entityType.trim(),
      name: body.name.trim(),
      filters: body.filters,
      isDefault: body.isDefault ?? false,
      sortOrder: body.sortOrder ?? 0,
    })
    .returning();

  return NextResponse.json({ success: true, data: view }, { status: 201 });
}
