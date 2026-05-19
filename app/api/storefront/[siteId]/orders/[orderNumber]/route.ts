import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { storeSettings, orders, orderItems, easypostEvents } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ siteId: string; orderNumber: string }> }
) {
  try {
    const { siteId, orderNumber } = await params;
    const websiteId = parseInt(siteId, 10);
    if (isNaN(websiteId)) {
      return NextResponse.json({ success: false, message: 'Invalid site ID' }, { status: 400 });
    }

    // Verify store is enabled
    const [store] = await db.select().from(storeSettings)
      .where(and(eq(storeSettings.websiteId, websiteId), eq(storeSettings.enabled, true)))
      .limit(1);

    if (!store) {
      return NextResponse.json({ success: false, message: 'Store not found' }, { status: 404 });
    }

    // Require email for verification
    const url = new URL(req.url);
    const email = url.searchParams.get('email');
    if (!email) {
      return NextResponse.json({ success: false, message: 'Email is required for order verification' }, { status: 400 });
    }

    // Find order
    const [order] = await db.select().from(orders)
      .where(and(
        eq(orders.websiteId, websiteId),
        eq(orders.orderNumber, orderNumber),
        eq(orders.customerEmail, email),
      ))
      .limit(1);

    if (!order) {
      return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
    }

    // Fetch order items + last 10 EasyPost tracking events in parallel
    const [items, trackingEvents] = await Promise.all([
      db.select().from(orderItems).where(eq(orderItems.orderId, order.id)),
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
      data: {
        orderNumber: order.orderNumber,
        status: order.status,
        paymentStatus: order.paymentStatus,
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        shippingAddress: order.shippingAddress,
        billingAddress: order.billingAddress,
        subtotal: order.subtotal,
        shippingTotal: order.shippingTotal,
        taxTotal: order.taxTotal,
        discountTotal: order.discountTotal,
        total: order.total,
        shippingMethod: order.shippingMethod,
        carrier: order.carrier,
        trackingNumber: order.trackingNumber,
        trackingUrl: order.trackingUrl,
        latestTrackingStatus: order.latestTrackingStatus,
        latestTrackingEventAt: order.latestTrackingEventAt,
        customerNote: order.customerNote,
        paidAt: order.paidAt,
        shippedAt: order.shippedAt,
        deliveredAt: order.deliveredAt,
        createdAt: order.createdAt,
        items,
        trackingEvents,
      },
    });
  } catch (err) {
    console.error('Storefront order detail error:', err);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
