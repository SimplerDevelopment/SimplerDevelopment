import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { crmActivities } from '@/lib/db/schema';
import { and, eq, desc, sql } from 'drizzle-orm';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client)
    return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const { id } = await params;
  const contactId = parseInt(id, 10);
  if (isNaN(contactId))
    return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });

  const url = req.nextUrl;
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const limit = Math.min(
    100,
    Math.max(1, parseInt(url.searchParams.get('limit') || '25', 10))
  );
  const offset = (page - 1) * limit;

  const where = and(
    eq(crmActivities.clientId, client.id),
    eq(crmActivities.contactId, contactId),
    eq(crmActivities.type, 'email')
  );

  const [countResult] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(crmActivities)
    .where(where);

  const emails = await db
    .select()
    .from(crmActivities)
    .where(where)
    .orderBy(desc(crmActivities.createdAt))
    .limit(limit)
    .offset(offset);

  return NextResponse.json({
    success: true,
    data: { emails, total: countResult.total, page, limit },
  });
}
