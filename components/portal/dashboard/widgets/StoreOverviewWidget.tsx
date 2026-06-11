import { db } from '@/lib/db';
import { clientWebsites, products, orders } from '@/lib/db/schema';
import { eq, and, count, desc, inArray } from 'drizzle-orm';
import Link from 'next/link';
import { formatCents } from '@/lib/portal';

export default async function StoreOverviewWidget({
  clientId,
}: {
  clientId: number;
  userId: number;
}) {
  // Resolve the client's active site ids first
  const siteRows = await db
    .select({ id: clientWebsites.id })
    .from(clientWebsites)
    .where(and(eq(clientWebsites.clientId, clientId), eq(clientWebsites.active, true)));

  const siteIds = siteRows.map((r) => r.id);

  if (siteIds.length === 0) {
    return (
      <div>
        <div className="mb-3">
          <span className="text-2xl font-bold text-foreground">—</span>
          <span className="ml-2 text-sm text-muted-foreground">no active stores</span>
        </div>
        <p className="text-sm text-muted-foreground py-2 text-center">
          No websites set up yet.
        </p>
      </div>
    );
  }

  // Parallel: product count, order count, last 3 orders
  const [productResult, orderResult, recentOrders] = await Promise.all([
    db
      .select({ count: count() })
      .from(products)
      .where(inArray(products.websiteId, siteIds)),
    db
      .select({ count: count() })
      .from(orders)
      .where(inArray(orders.websiteId, siteIds)),
    db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        total: orders.total,
        status: orders.status,
        websiteId: orders.websiteId,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .where(inArray(orders.websiteId, siteIds))
      .orderBy(desc(orders.createdAt))
      .limit(3),
  ]);

  const productCount = productResult[0]?.count ?? 0;
  const orderCount = orderResult[0]?.count ?? 0;

  return (
    <div>
      <div className="mb-3 flex items-baseline gap-4">
        <div>
          <span className="text-2xl font-bold text-foreground">{orderCount}</span>
          <span className="ml-2 text-sm text-muted-foreground">
            order{orderCount !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{productCount}</span> product{productCount !== 1 ? 's' : ''}
        </div>
      </div>

      {recentOrders.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2 text-center">No orders yet.</p>
      ) : (
        <ul className="space-y-2">
          {recentOrders.map((o) => (
            <li key={o.id}>
              <Link
                href={`/portal/websites/${o.websiteId}/store/orders/${o.id}`}
                className="flex items-center justify-between gap-2 hover:bg-accent p-2 rounded-lg transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    #{o.orderNumber}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(o.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-medium text-foreground">
                    {formatCents(o.total)}
                  </p>
                  <p className="text-xs text-muted-foreground capitalize">{o.status}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {recentOrders.length > 0 && (
        <div className="mt-3 text-center">
          <Link
            href={`/portal/websites/${siteIds[0]}/store/orders`}
            className="text-xs text-primary hover:underline inline-flex items-center gap-1"
          >
            <span className="material-icons text-sm">shopping_bag</span>
            View all orders
          </Link>
        </div>
      )}

      {recentOrders.length === 0 && productCount === 0 && (
        <div className="mt-3 text-center">
          <Link
            href={`/portal/websites/${siteIds[0]}/store/products`}
            className="text-xs text-primary hover:underline inline-flex items-center gap-1"
          >
            <span className="material-icons text-sm">add_circle_outline</span>
            Add your first product
          </Link>
        </div>
      )}
    </div>
  );
}
