'use client';

import { useState, useEffect } from 'react';
import { formatCents, orderStatusColor, paymentStatusColor } from '@/lib/portal-utils';

interface Store {
  storeId: number;
  websiteId: number;
  enabled: boolean;
  storeName: string | null;
  currency: string;
  stripeConnected: boolean;
  platformFeePercent: string | null;
  websiteName: string;
  domain: string | null;
  clientCompany: string | null;
  clientName: string;
  totalOrders: number;
  totalRevenue: number;
  totalPlatformFees: number;
  pendingOrders: number;
}

interface PlatformTotals {
  totalStores: number;
  activeStores: number;
  totalRevenue: number;
  totalPlatformFees: number;
  totalOrders: number;
  pendingOrders: number;
}

interface Order {
  id: number;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  total: number;
  platformFee: number | null;
  status: string;
  paymentStatus: string;
  createdAt: string;
  websiteName: string;
  websiteId: number;
}

export default function AdminEcommercePage() {
  const [tab, setTab] = useState<'overview' | 'orders'>('overview');
  const [stores, setStores] = useState<Store[]>([]);
  const [platform, setPlatform] = useState<PlatformTotals | null>(null);
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [ordersPage, setOrdersPage] = useState(1);
  const [ordersTotal, setOrdersTotal] = useState(0);

  useEffect(() => {
    setLoading(true);
    if (tab === 'overview') {
      fetch('/api/admin/portal/ecommerce?view=overview')
        .then(r => r.json())
        .then(res => {
          if (res.success) {
            setStores(res.data.stores);
            setPlatform(res.data.platform);
          }
        })
        .finally(() => setLoading(false));
    } else {
      fetch(`/api/admin/portal/ecommerce?view=orders&page=${ordersPage}&limit=50`)
        .then(r => r.json())
        .then(res => {
          if (res.success) {
            setAllOrders(res.data.orders);
            setOrdersTotal(res.data.total);
          }
        })
        .finally(() => setLoading(false));
    }
  }, [tab, ordersPage]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <span className="material-icons animate-spin text-primary text-2xl">refresh</span>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">eCommerce</h1>
        <p className="text-muted-foreground mt-1">Platform-wide store management and order oversight.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-card border border-border rounded-lg p-1 w-fit">
        {(['overview', 'orders'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors capitalize ${
              tab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'overview' && platform && (
        <>
          {/* Platform Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon="store" label="Active Stores" value={String(platform.activeStores)} sub={`${platform.totalStores} total`} />
            <StatCard icon="payments" label="Total Revenue" value={formatCents(platform.totalRevenue)} />
            <StatCard icon="account_balance" label="Platform Fees" value={formatCents(platform.totalPlatformFees)} />
            <StatCard icon="shopping_bag" label="Total Orders" value={String(platform.totalOrders)} sub={`${platform.pendingOrders} pending`} />
          </div>

          {/* Stores Table */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-border">
              <h2 className="font-semibold text-foreground">All Stores</h2>
            </div>
            {stores.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <span className="material-icons text-4xl text-muted-foreground/40">shopping_cart</span>
                <p className="text-sm text-muted-foreground mt-2">No stores have been created yet.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="px-6 py-3 font-medium text-muted-foreground">Store</th>
                      <th className="px-6 py-3 font-medium text-muted-foreground">Client</th>
                      <th className="px-6 py-3 font-medium text-muted-foreground">Status</th>
                      <th className="px-6 py-3 font-medium text-muted-foreground">Stripe</th>
                      <th className="px-6 py-3 font-medium text-muted-foreground text-right">Revenue</th>
                      <th className="px-6 py-3 font-medium text-muted-foreground text-right">Platform Fees</th>
                      <th className="px-6 py-3 font-medium text-muted-foreground text-right">Orders</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {stores.map(store => (
                      <tr key={store.storeId} className="hover:bg-accent/50 transition-colors">
                        <td className="px-6 py-4">
                          <p className="font-medium text-foreground">{store.storeName || store.websiteName}</p>
                          <p className="text-xs text-muted-foreground">{store.domain || `Site #${store.websiteId}`}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-foreground">{store.clientName}</p>
                          {store.clientCompany && <p className="text-xs text-muted-foreground">{store.clientCompany}</p>}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                            store.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                          }`}>
                            <span className="material-icons text-xs">{store.enabled ? 'check_circle' : 'pause_circle'}</span>
                            {store.enabled ? 'Active' : 'Disabled'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1 text-xs ${
                            store.stripeConnected ? 'text-green-600' : 'text-yellow-600'
                          }`}>
                            <span className="material-icons text-xs">{store.stripeConnected ? 'check' : 'warning'}</span>
                            {store.stripeConnected ? 'Connected' : 'Not connected'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right font-mono text-foreground">{formatCents(store.totalRevenue)}</td>
                        <td className="px-6 py-4 text-right font-mono text-muted-foreground">{formatCents(store.totalPlatformFees)}</td>
                        <td className="px-6 py-4 text-right">
                          <span className="text-foreground">{store.totalOrders}</span>
                          {store.pendingOrders > 0 && (
                            <span className="ml-1 text-xs text-yellow-600">({store.pendingOrders} pending)</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'orders' && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <h2 className="font-semibold text-foreground">All Orders</h2>
            <span className="text-sm text-muted-foreground">{ordersTotal} total</span>
          </div>
          {allOrders.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <span className="material-icons text-4xl text-muted-foreground/40">receipt_long</span>
              <p className="text-sm text-muted-foreground mt-2">No orders yet.</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="px-6 py-3 font-medium text-muted-foreground">Order</th>
                      <th className="px-6 py-3 font-medium text-muted-foreground">Store</th>
                      <th className="px-6 py-3 font-medium text-muted-foreground">Customer</th>
                      <th className="px-6 py-3 font-medium text-muted-foreground">Status</th>
                      <th className="px-6 py-3 font-medium text-muted-foreground">Payment</th>
                      <th className="px-6 py-3 font-medium text-muted-foreground text-right">Total</th>
                      <th className="px-6 py-3 font-medium text-muted-foreground text-right">Fee</th>
                      <th className="px-6 py-3 font-medium text-muted-foreground">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {allOrders.map(order => (
                      <tr key={order.id} className="hover:bg-accent/50 transition-colors">
                        <td className="px-6 py-4 font-mono font-medium text-foreground">{order.orderNumber}</td>
                        <td className="px-6 py-4 text-muted-foreground">{order.websiteName}</td>
                        <td className="px-6 py-4">
                          <p className="text-foreground">{order.customerName}</p>
                          <p className="text-xs text-muted-foreground">{order.customerEmail}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${orderStatusColor(order.status)}`}>
                            {order.status}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${paymentStatusColor(order.paymentStatus)}`}>
                            {order.paymentStatus}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right font-mono text-foreground">{formatCents(order.total)}</td>
                        <td className="px-6 py-4 text-right font-mono text-muted-foreground">{order.platformFee ? formatCents(order.platformFee) : '-'}</td>
                        <td className="px-6 py-4 text-muted-foreground">{new Date(order.createdAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {ordersTotal > 50 && (
                <div className="px-6 py-4 border-t border-border flex items-center justify-between">
                  <button
                    onClick={() => setOrdersPage(p => Math.max(1, p - 1))}
                    disabled={ordersPage === 1}
                    className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-accent disabled:opacity-50 transition-colors"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-muted-foreground">Page {ordersPage} of {Math.ceil(ordersTotal / 50)}</span>
                  <button
                    onClick={() => setOrdersPage(p => p + 1)}
                    disabled={ordersPage >= Math.ceil(ordersTotal / 50)}
                    className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-accent disabled:opacity-50 transition-colors"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, sub }: { icon: string; label: string; value: string; sub?: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center gap-3">
        <span className="material-icons text-primary text-xl">{icon}</span>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
      <p className="text-2xl font-bold text-foreground mt-2">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}
