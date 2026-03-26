import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { storeSettings, orders, orderItems, products, clientWebsites, clients, users } from '@/lib/db/schema';
import { eq, desc, sql, and } from 'drizzle-orm';

async function requireStaff() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') return null;
  return session;
}

export async function GET(req: Request) {
  if (!await requireStaff()) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const view = searchParams.get('view') ?? 'overview';

  if (view === 'overview') {
    // All stores with their stats
    const stores = await db
      .select({
        storeId: storeSettings.id,
        websiteId: storeSettings.websiteId,
        enabled: storeSettings.enabled,
        storeName: storeSettings.storeName,
        currency: storeSettings.currency,
        stripeConnected: storeSettings.stripeOnboardingComplete,
        platformFeePercent: storeSettings.platformFeePercent,
        websiteName: clientWebsites.name,
        domain: clientWebsites.domain,
        clientCompany: clients.company,
        clientName: users.name,
      })
      .from(storeSettings)
      .innerJoin(clientWebsites, eq(clientWebsites.id, storeSettings.websiteId))
      .innerJoin(clients, eq(clients.id, clientWebsites.clientId))
      .innerJoin(users, eq(users.id, clients.userId))
      .orderBy(desc(storeSettings.createdAt));

    // Aggregate order stats per website
    const orderStats = await db
      .select({
        websiteId: orders.websiteId,
        totalOrders: sql<number>`count(*)`.as('total_orders'),
        totalRevenue: sql<number>`coalesce(sum(case when ${orders.paymentStatus} = 'paid' then ${orders.total} else 0 end), 0)`.as('total_revenue'),
        totalPlatformFees: sql<number>`coalesce(sum(case when ${orders.paymentStatus} = 'paid' then ${orders.platformFee} else 0 end), 0)`.as('total_platform_fees'),
        pendingOrders: sql<number>`count(case when ${orders.status} = 'pending' then 1 end)`.as('pending_orders'),
      })
      .from(orders)
      .groupBy(orders.websiteId);

    const statsMap = Object.fromEntries(orderStats.map(s => [s.websiteId, s]));

    const storesWithStats = stores.map(store => ({
      ...store,
      totalOrders: statsMap[store.websiteId]?.totalOrders ?? 0,
      totalRevenue: statsMap[store.websiteId]?.totalRevenue ?? 0,
      totalPlatformFees: statsMap[store.websiteId]?.totalPlatformFees ?? 0,
      pendingOrders: statsMap[store.websiteId]?.pendingOrders ?? 0,
    }));

    // Platform-wide totals
    const platformTotals = {
      totalStores: stores.length,
      activeStores: stores.filter(s => s.enabled).length,
      totalRevenue: storesWithStats.reduce((sum, s) => sum + Number(s.totalRevenue), 0),
      totalPlatformFees: storesWithStats.reduce((sum, s) => sum + Number(s.totalPlatformFees), 0),
      totalOrders: storesWithStats.reduce((sum, s) => sum + Number(s.totalOrders), 0),
      pendingOrders: storesWithStats.reduce((sum, s) => sum + Number(s.pendingOrders), 0),
    };

    return NextResponse.json({ success: true, data: { stores: storesWithStats, platform: platformTotals } });
  }

  if (view === 'orders') {
    const page = parseInt(searchParams.get('page') ?? '1');
    const limit = parseInt(searchParams.get('limit') ?? '50');
    const offset = (page - 1) * limit;

    const allOrders = await db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        customerName: orders.customerName,
        customerEmail: orders.customerEmail,
        total: orders.total,
        platformFee: orders.platformFee,
        status: orders.status,
        paymentStatus: orders.paymentStatus,
        createdAt: orders.createdAt,
        websiteName: clientWebsites.name,
        websiteId: orders.websiteId,
      })
      .from(orders)
      .innerJoin(clientWebsites, eq(clientWebsites.id, orders.websiteId))
      .orderBy(desc(orders.createdAt))
      .limit(limit)
      .offset(offset);

    const [{ total }] = await db.select({ total: sql<number>`count(*)` }).from(orders);

    return NextResponse.json({ success: true, data: { orders: allOrders, total, page, limit } });
  }

  return NextResponse.json({ success: false, message: 'Invalid view' }, { status: 400 });
}
