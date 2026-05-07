import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { crmNotifications } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

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

// PATCH /api/portal/crm/notifications/[id]
// Marks a single notification as read (or unread if `{ read: false }` is sent).
// Tenant-scoped — only updates rows owned by the active client + signed-in user.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await getAuthedClient();
  if ('error' in result) return result.error;
  const { client, userId } = result;

  const notificationId = parseInt(id, 10);
  if (isNaN(notificationId))
    return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });

  let body: { read?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    // empty body == default mark-as-read
  }
  const read = body.read === false ? false : true;

  const [updated] = await db
    .update(crmNotifications)
    .set({ read })
    .where(
      and(
        eq(crmNotifications.id, notificationId),
        eq(crmNotifications.clientId, client.id),
        eq(crmNotifications.userId, userId)
      )
    )
    .returning();

  if (!updated)
    return NextResponse.json({ success: false, message: 'Notification not found' }, { status: 404 });

  return NextResponse.json({ success: true, data: updated });
}
