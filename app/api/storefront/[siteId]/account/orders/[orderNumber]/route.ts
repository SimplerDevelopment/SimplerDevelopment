import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { orders, orderItems, orderStatusHistory, productDesigns } from '@/lib/db/schema';
import { and, eq, desc, isNull } from 'drizzle-orm';
import { requireCustomer } from '@/lib/storefront/customer-auth';

/**
 * GET /api/storefront/[siteId]/account/orders/[orderNumber] — Order detail with items and history
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

  // Mirror the admin order-detail join so the customer's order-history
  // page can render the design thumbnail / name the same way the
  // /portal admin does.
  const [itemsWithDesign, history] = await Promise.all([
    db.select({
      id: orderItems.id,
      orderId: orderItems.orderId,
      productId: orderItems.productId,
      variantId: orderItems.variantId,
      designId: orderItems.designId,
      productName: orderItems.productName,
      variantName: orderItems.variantName,
      sku: orderItems.sku,
      unitPrice: orderItems.unitPrice,
      quantity: orderItems.quantity,
      total: orderItems.total,
      createdAt: orderItems.createdAt,
      designIdRow: productDesigns.id,
      designUuid: productDesigns.uuid,
      designName: productDesigns.name,
      designThumbnailUrl: productDesigns.thumbnailUrl,
    })
      .from(orderItems)
      .leftJoin(productDesigns, and(
        eq(productDesigns.id, orderItems.designId),
        isNull(productDesigns.deletedAt),
      ))
      .where(eq(orderItems.orderId, order.id)),
    db.select().from(orderStatusHistory).where(eq(orderStatusHistory.orderId, order.id)).orderBy(desc(orderStatusHistory.createdAt)),
  ]);

  const items = itemsWithDesign.map(row => ({
    id: row.id,
    orderId: row.orderId,
    productId: row.productId,
    variantId: row.variantId,
    designId: row.designId,
    productName: row.productName,
    variantName: row.variantName,
    sku: row.sku,
    unitPrice: row.unitPrice,
    quantity: row.quantity,
    total: row.total,
    createdAt: row.createdAt,
    design: row.designIdRow
      ? {
          id: row.designIdRow,
          uuid: row.designUuid,
          name: row.designName,
          thumbnailUrl: row.designThumbnailUrl,
        }
      : null,
  }));

  return NextResponse.json({
    success: true,
    data: { order, items, history },
  });
}
