import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { orders, orderItems, products } from '@/lib/db/schema';
import { and, eq, gte, sql, desc, count, sum } from 'drizzle-orm';
import { resolveClientSite } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'read', requireService: 'store' });
  if (isAuthError(authResult)) return authResult.response;

  const { siteId } = await params;
  const site = await resolveClientSite(parseInt(session.user.id, 10), parseInt(siteId));
  if (!site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const url = new URL(req.url);
  const period = url.searchParams.get('period') || '30d';

  // Calculate the start date based on period
  const now = new Date();
  let startDate: Date;
  switch (period) {
    case '7d':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '90d':
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    case '12m':
      startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
    default:
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
  }

  const baseConditions = and(
    eq(orders.websiteId, site.id),
    gte(orders.createdAt, startDate),
  );

  const paidConditions = and(
    eq(orders.websiteId, site.id),
    eq(orders.paymentStatus, 'paid'),
    gte(orders.createdAt, startDate),
  );

  // Total revenue and order count (paid orders only)
  const [revenueResult] = await db
    .select({
      totalRevenue: sum(orders.total),
      totalOrders: count(),
    })
    .from(orders)
    .where(paidConditions);

  const totalRevenue = parseInt(revenueResult.totalRevenue || '0');
  const totalOrders = revenueResult.totalOrders;
  const averageOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

  // Top products by revenue
  const topProducts = await db
    .select({
      productId: orderItems.productId,
      productName: orderItems.productName,
      totalRevenue: sum(orderItems.total),
      totalQuantity: sum(orderItems.quantity),
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(paidConditions)
    .groupBy(orderItems.productId, orderItems.productName)
    .orderBy(desc(sum(orderItems.total)))
    .limit(5);

  // Revenue by day
  const revenueByDay = await db
    .select({
      date: sql<string>`DATE(${orders.createdAt})`.as('date'),
      revenue: sum(orders.total),
      orderCount: count(),
    })
    .from(orders)
    .where(paidConditions)
    .groupBy(sql`DATE(${orders.createdAt})`)
    .orderBy(sql`DATE(${orders.createdAt})`);

  // Orders by status (all orders in the period, not just paid)
  const ordersByStatus = await db
    .select({
      status: orders.status,
      count: count(),
    })
    .from(orders)
    .where(baseConditions)
    .groupBy(orders.status);

  const statusCounts: Record<string, number> = {};
  for (const row of ordersByStatus) {
    statusCounts[row.status] = row.count;
  }

  return NextResponse.json({
    success: true,
    data: {
      totalRevenue,
      totalOrders,
      averageOrderValue,
      topProducts: topProducts.map((p) => ({
        productId: p.productId,
        productName: p.productName,
        totalRevenue: parseInt(p.totalRevenue || '0'),
        totalQuantity: parseInt(String(p.totalQuantity || '0')),
      })),
      revenueByDay: revenueByDay.map((r) => ({
        date: r.date,
        revenue: parseInt(r.revenue || '0'),
        orderCount: r.orderCount,
      })),
      ordersByStatus: statusCounts,
      period,
    },
  });
}
