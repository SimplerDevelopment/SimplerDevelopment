import { NextResponse } from 'next/server';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { db } from '@/lib/db';
import {
  notificationPreferences,
  NOTIFICATION_TYPES,
  NOTIFICATION_DELIVERIES,
  type NotificationDelivery,
  type NotificationType,
} from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

const TYPE_SET = new Set<string>(NOTIFICATION_TYPES);
const DELIVERY_SET = new Set<string>(NOTIFICATION_DELIVERIES);

/**
 * Per-user notification delivery preferences.
 *
 * GET — returns one row per known notification type, defaulting to `instant`
 *       when no row exists for the caller. UI can render the table in one pass.
 * PUT — upserts a single { notificationType, delivery } pair.
 */
export async function GET() {
  const result = await authorizePortal({ action: 'read' });
  if (isAuthError(result)) return result.response;

  const rows = await db
    .select({
      notificationType: notificationPreferences.notificationType,
      delivery: notificationPreferences.delivery,
    })
    .from(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.clientId, result.client.id),
        eq(notificationPreferences.userId, result.userId),
      ),
    );

  const byType = new Map<string, NotificationDelivery>();
  for (const r of rows) byType.set(r.notificationType, r.delivery);

  // Always echo the full type set so the UI doesn't have to merge defaults.
  const items = NOTIFICATION_TYPES.map((notificationType) => ({
    notificationType,
    delivery: byType.get(notificationType) ?? ('instant' as NotificationDelivery),
  }));

  return NextResponse.json({ success: true, data: { items } });
}

export async function PUT(request: Request) {
  const result = await authorizePortal({ action: 'write' });
  if (isAuthError(result)) return result.response;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ success: false, message: 'Invalid body' }, { status: 400 });
  }

  const notificationType = typeof body.notificationType === 'string' ? body.notificationType : '';
  const delivery = typeof body.delivery === 'string' ? body.delivery : '';

  if (!TYPE_SET.has(notificationType)) {
    return NextResponse.json(
      { success: false, message: `Unknown notificationType: ${notificationType}` },
      { status: 400 },
    );
  }
  if (!DELIVERY_SET.has(delivery)) {
    return NextResponse.json(
      { success: false, message: `Unknown delivery: ${delivery} (must be one of ${NOTIFICATION_DELIVERIES.join(', ')})` },
      { status: 400 },
    );
  }

  const upserted = await db
    .insert(notificationPreferences)
    .values({
      clientId: result.client.id,
      userId: result.userId,
      notificationType: notificationType as NotificationType,
      delivery: delivery as NotificationDelivery,
    })
    .onConflictDoUpdate({
      target: [
        notificationPreferences.clientId,
        notificationPreferences.userId,
        notificationPreferences.notificationType,
      ],
      set: {
        delivery: delivery as NotificationDelivery,
        updatedAt: new Date(),
      },
    })
    .returning({
      notificationType: notificationPreferences.notificationType,
      delivery: notificationPreferences.delivery,
    });

  return NextResponse.json({
    success: true,
    data: upserted[0] ?? { notificationType, delivery },
  });
}
