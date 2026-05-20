import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { orders, orderItems, orderStatusHistory, easypostEvents } from '@/lib/db/schema';
import { and, eq, desc } from 'drizzle-orm';
import { requireCustomer } from '@/lib/storefront/customer-auth';

/**
 * GET /api/storefront/[siteId]/account/orders/[orderNumber] — Order detail with items, history, and EasyPost tracking events
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ siteId: string; orderNumber: string }> }) {
  const { siteId, orderNumber } = await params;
  const websiteId = parseInt(siteId);
  const session = await requireCustomer(req, websiteId);
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const [order] = await db.select()
    .from(orders)
    .where(and(
      eq(orders.websiteId, websiteId),
      eq(orders.orderNumber, orderNumber),
      eq(orders.customerEmail, session.email),
    ))
    .limit(1);

  if (!order) return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });

  const [items, history, trackingEvents] = await Promise.all([
    db.select().from(orderItems).where(eq(orderItems.orderId, order.id)),
    db.select().from(orderStatusHistory).where(eq(orderStatusHistory.orderId, order.id)).orderBy(desc(orderStatusHistory.createdAt)),
    db.select({
      processedAt: easypostEvents.processedAt,
      eventType: easypostEvents.eventType,
      payload: easypostEvents.payload,
    })
      .from(easypostEvents)
      .where(eq(easypostEvents.orderId, order.id))
      .orderBy(desc(easypostEvents.processedAt))
      .limit(10),
  ]);

  return NextResponse.json({
    success: true,
    data: { order, items, history, trackingEvents },
  });
}
