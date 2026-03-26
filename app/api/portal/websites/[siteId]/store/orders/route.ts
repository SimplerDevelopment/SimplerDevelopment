import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { orders, orderItems } from '@/lib/db/schema';
import { and, eq, ilike, or, count, desc, asc, sql } from 'drizzle-orm';
import { resolveClientSite } from '@/lib/portal-client';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId } = await params;
  const site = await resolveClientSite(parseInt(session.user.id, 10), parseInt(siteId));
  if (!site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  const search = url.searchParams.get('search');
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '25')));
  const sort = url.searchParams.get('sort') || 'newest';
  const offset = (page - 1) * limit;

  const conditions = [eq(orders.websiteId, site.id)];
  if (status) conditions.push(eq(orders.status, status));
  if (search) {
    conditions.push(
      or(
        ilike(orders.orderNumber, `%${search}%`),
        ilike(orders.customerName, `%${search}%`),
        ilike(orders.customerEmail, `%${search}%`),
      )!,
    );
  }

  const where = and(...conditions);

  const [totalResult] = await db
    .select({ total: count() })
    .from(orders)
    .where(where);

  const orderBy = sort === 'oldest' ? asc(orders.createdAt) : desc(orders.createdAt);

  const orderRows = await db
    .select()
    .from(orders)
    .where(where)
    .orderBy(orderBy)
    .limit(limit)
    .offset(offset);

  // Fetch items for all orders
  const orderIds = orderRows.map((o) => o.id);
  let itemsMap: Record<number, typeof orderItems.$inferSelect[]> = {};

  if (orderIds.length > 0) {
    const allItems = await db
      .select()
      .from(orderItems)
      .where(sql`${orderItems.orderId} IN (${sql.join(orderIds.map(id => sql`${id}`), sql`, `)})`);

    for (const item of allItems) {
      if (!itemsMap[item.orderId]) itemsMap[item.orderId] = [];
      itemsMap[item.orderId].push(item);
    }
  }

  const data = orderRows.map((o) => ({
    ...o,
    items: itemsMap[o.id] || [],
  }));

  return NextResponse.json({
    success: true,
    data,
    pagination: {
      page,
      limit,
      total: totalResult.total,
      totalPages: Math.ceil(totalResult.total / limit),
    },
  });
}
