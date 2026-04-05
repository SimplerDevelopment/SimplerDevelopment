import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { crmNotifications } from '@/lib/db/schema';
import { and, eq, desc, inArray, sql } from 'drizzle-orm';

async function getAuthedClient() {
  const session = await auth();
  if (!session?.user?.id) return { error: NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 }) };
  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return { error: NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 }) };
  return { client, userId };
}

export async function GET() {
  const result = await getAuthedClient();
  if ('error' in result) return result.error;
  const { client, userId } = result;

  const notifications = await db
    .select()
    .from(crmNotifications)
    .where(and(eq(crmNotifications.clientId, client.id), eq(crmNotifications.userId, userId)))
    .orderBy(desc(crmNotifications.createdAt))
    .limit(50);

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(crmNotifications)
    .where(
      and(
        eq(crmNotifications.clientId, client.id),
        eq(crmNotifications.userId, userId),
        eq(crmNotifications.read, false)
      )
    );

  return NextResponse.json({
    success: true,
    data: notifications,
    unreadCount: countRow?.count ?? 0,
  });
}

export async function PUT(req: Request) {
  const result = await getAuthedClient();
  if ('error' in result) return result.error;
  const { client, userId } = result;

  const body = await req.json();

  if (body.all === true) {
    await db
      .update(crmNotifications)
      .set({ read: true })
      .where(
        and(
          eq(crmNotifications.clientId, client.id),
          eq(crmNotifications.userId, userId),
          eq(crmNotifications.read, false)
        )
      );
    return NextResponse.json({ success: true });
  }

  if (Array.isArray(body.ids) && body.ids.length > 0) {
    await db
      .update(crmNotifications)
      .set({ read: true })
      .where(
        and(
          eq(crmNotifications.clientId, client.id),
          eq(crmNotifications.userId, userId),
          inArray(crmNotifications.id, body.ids)
        )
      );
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ success: false, message: 'Provide { ids: number[] } or { all: true }' }, { status: 400 });
}
