import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { notificationPreferences, NOTIFICATION_TYPES, NOTIFICATION_DELIVERIES } from '@/lib/db/schema';
import type { NotificationDelivery } from '@/lib/db/schema';
import { and, eq, inArray } from 'drizzle-orm';

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

// GET /api/portal/crm/notification-preferences
// Returns the delivery preference for every known notification type.
// Rows absent from the DB default to 'instant'.
export async function GET() {
  const result = await getAuthedClient();
  if ('error' in result) return result.error;
  const { client, userId } = result;

  const rows = await db
    .select()
    .from(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.clientId, client.id),
        eq(notificationPreferences.userId, userId),
        inArray(notificationPreferences.notificationType, [...NOTIFICATION_TYPES])
      )
    );

  // Merge stored rows with the canonical type list; default absent types to 'instant'.
  const byType = new Map(rows.map(r => [r.notificationType, r.delivery]));
  const data = NOTIFICATION_TYPES.map(notificationType => ({
    notificationType,
    delivery: (byType.get(notificationType) ?? 'instant') as NotificationDelivery,
  }));

  return NextResponse.json({ success: true, data });
}

// PUT /api/portal/crm/notification-preferences
// Body: { preferences: Array<{ notificationType: string; delivery: 'instant' | 'digest_daily' | 'off' }> }
// Upserts each entry (one row per type, unique on clientId+userId+notificationType).
export async function PUT(req: Request) {
  const result = await getAuthedClient();
  if ('error' in result) return result.error;
  const { client, userId } = result;

  const body = await req.json();
  if (!Array.isArray(body.preferences) || body.preferences.length === 0) {
    return NextResponse.json({ success: false, message: 'preferences array required' }, { status: 400 });
  }

  const typeSet = new Set<string>(NOTIFICATION_TYPES);
  const deliverySet = new Set<string>(NOTIFICATION_DELIVERIES);

  const valid = (body.preferences as { notificationType: string; delivery: string }[]).filter(
    p => typeSet.has(p.notificationType) && deliverySet.has(p.delivery)
  );

  if (valid.length === 0) {
    return NextResponse.json({ success: false, message: 'No valid preferences provided' }, { status: 400 });
  }

  const upserted = await Promise.all(
    valid.map(p =>
      db
        .insert(notificationPreferences)
        .values({
          clientId: client.id,
          userId,
          notificationType: p.notificationType,
          delivery: p.delivery as NotificationDelivery,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [
            notificationPreferences.clientId,
            notificationPreferences.userId,
            notificationPreferences.notificationType,
          ],
          set: { delivery: p.delivery as NotificationDelivery, updatedAt: new Date() },
        })
        .returning()
    )
  );

  return NextResponse.json({ success: true, data: upserted.flat() });
}
