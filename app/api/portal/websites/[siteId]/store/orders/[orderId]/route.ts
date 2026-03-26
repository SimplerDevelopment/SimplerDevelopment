import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { orders, orderItems, orderStatusHistory } from '@/lib/db/schema';
import { and, eq, asc } from 'drizzle-orm';
import { resolveClientSite } from '@/lib/portal-client';

type Params = { params: Promise<{ siteId: string; orderId: string }> };

async function resolveOrder(userId: number, siteId: string, orderId: string) {
  const site = await resolveClientSite(userId, parseInt(siteId));
  if (!site) return null;

  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, parseInt(orderId)), eq(orders.websiteId, site.id)))
    .limit(1);

  return order || null;
}

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId, orderId } = await params;
  const order = await resolveOrder(parseInt(session.user.id, 10), siteId, orderId);
  if (!order) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const [items, history] = await Promise.all([
    db.select().from(orderItems).where(eq(orderItems.orderId, order.id)),
    db.select().from(orderStatusHistory).where(eq(orderStatusHistory.orderId, order.id)).orderBy(asc(orderStatusHistory.createdAt)),
  ]);

  return NextResponse.json({
    success: true,
    data: { ...order, items, statusHistory: history },
  });
}

export async function PUT(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId, orderId } = await params;
  const order = await resolveOrder(parseInt(session.user.id, 10), siteId, orderId);
  if (!order) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const body = await req.json();
  const updateData: Record<string, unknown> = { updatedAt: new Date() };

  if (body.trackingNumber !== undefined) updateData.trackingNumber = body.trackingNumber;
  if (body.trackingUrl !== undefined) updateData.trackingUrl = body.trackingUrl;
  if (body.internalNote !== undefined) updateData.internalNote = body.internalNote;

  // Handle status change
  if (body.status !== undefined && body.status !== order.status) {
    updateData.status = body.status;

    // Set timestamps based on status
    if (body.status === 'shipped' && !order.shippedAt) {
      updateData.shippedAt = new Date();
    }
    if (body.status === 'delivered' && !order.deliveredAt) {
      updateData.deliveredAt = new Date();
    }

    // Insert status history
    await db.insert(orderStatusHistory).values({
      orderId: order.id,
      status: body.status,
      note: body.statusNote || null,
      changedBy: parseInt(session.user.id, 10),
    });
  }

  const [updated] = await db
    .update(orders)
    .set(updateData)
    .where(eq(orders.id, order.id))
    .returning();

  return NextResponse.json({ success: true, data: updated });
}
