import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { crmNotifications } from '@/lib/db/schema';
import { and, eq, sql } from 'drizzle-orm';

async function getAuthedClient() {
  const session = await auth();
  if (!session?.user?.id)
    return { error: NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 }) };
  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client)
    return { error: NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 }) };
  return { client, userId };
}

// POST /api/portal/crm/notifications/mark-all-read
// Marks every unread notification owned by the active client + signed-in user
// as read. Tenant-scoped via getPortalClient.
export async function POST() {
  const result = await getAuthedClient();
  if ('error' in result) return result.error;
  const { client, userId } = result;

  const updated = await db
    .update(crmNotifications)
    .set({ read: true })
    .where(
      and(
        eq(crmNotifications.clientId, client.id),
        eq(crmNotifications.userId, userId),
        eq(crmNotifications.read, false)
      )
    )
    .returning({ id: crmNotifications.id });

  return NextResponse.json({
    success: true,
    data: { updated: updated.length },
  });
}

// HEAD support — handy for clients that just want a fresh unread count.
export async function GET() {
  const result = await getAuthedClient();
  if ('error' in result) return result.error;
  const { client, userId } = result;

  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(crmNotifications)
    .where(
      and(
        eq(crmNotifications.clientId, client.id),
        eq(crmNotifications.userId, userId),
        eq(crmNotifications.read, false)
      )
    );

  return NextResponse.json({ success: true, data: { unreadCount: row?.count ?? 0 } });
}
