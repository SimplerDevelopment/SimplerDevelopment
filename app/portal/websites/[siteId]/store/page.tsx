'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface StoreSettings {
  enabled: boolean;
  storeName?: string;
  currency?: string;
}

interface Analytics {
  totalRevenue: number;
  ordersToday: number;
  activeProducts: number;
  lowStockItems: number;
}

interface Order {
  id: number;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  totalCents: number;
  status: string;
  itemCount: number;
  createdAt: string;
}

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  confirmed: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  processing: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  shipped: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  delivered: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  refunded: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
};

function formatMoney(cents: number) {
  return '$' + (cents / 100).toFixed(2);
}

export default function StoreDashboardPage() {
  const { siteId } = useParams<{ siteId: string }>();
  const base = `/api/portal/websites/${siteId}/store`;

  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [enabling, setEnabling] = useState(false);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const settingsRes = await fetch(`${base}/settings`);
      const settingsData = await settingsRes.json();
      if (settingsData.success) {
        setSettings(settingsData.data);
        if (settingsData.data.enabled) {
          const [analyticsRes, ordersRes] = await Promise.all([
            fetch(`${base}/analytics?period=30d`),
            fetch(`${base}/orders?limit=10`),
          ]);
          const analyticsData = await analyticsRes.json();
          const ordersData = await ordersRes.json();
          if (analyticsData.success) setAnalytics(analyticsData.data);
          if (ordersData.success) setRecentOrders(ordersData.data || []);
        }
      }
    } catch {
      // fail silently
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const enableStore = async () => {
    setEnabling(true);
    try {
      const res = await fetch(`${base}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true }),
      });
      const data = await res.json();
      if (data.success) {
        loadDashboard();
      }
    } catch {
      // fail silently
    } finally {
      setEnabling(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <span className="material-icons animate-spin text-primary text-2xl">refresh</span>
      </div>
    );
  }

  if (!settings?.enabled) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Store</h1>
          <p className="text-muted-foreground text-sm mt-1">Sell products directly from your website.</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-10 flex flex-col items-center text-center">
          <span className="material-icons text-5xl text-muted-foreground/40 mb-3">storefront</span>
          <h2 className="text-xl font-semibold text-foreground mb-2">Enable Your Store</h2>
          <p className="text-sm text-muted-foreground mb-6 max-w-md">
            Activate eCommerce on your website to start listing products, accepting orders, and managing inventory.
          </p>
          <button
            onClick={enableStore}
            disabled={enabling}
            className="flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {enabling ? (
              <span className="material-icons text-base animate-spin">refresh</span>
            ) : (
              <span className="material-icons text-base">power_settings_new</span>
            )}
            {enabling ? 'Enabling...' : 'Enable Store'}
          </button>
        </div>
      </div>
    );
  }

  const quickLinks = [
    { label: 'Products', icon: 'inventory_2', href: `/portal/websites/${siteId}/store/products` },
    { label: 'Orders', icon: 'receipt_long', href: `/portal/websites/${siteId}/store/orders` },
    { label: 'Shipping', icon: 'local_shipping', href: `/portal/websites/${siteId}/store/shipping` },
    { label: 'Discounts', icon: 'sell', href: `/portal/websites/${siteId}/store/discounts` },
    { label: 'Categories', icon: 'category', href: `/portal/websites/${siteId}/store/categories` },
    { label: 'Settings', icon: 'settings', href: `/portal/websites/${siteId}/store/settings` },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Store Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {settings.storeName || 'Your store'} — last 30 days overview
          </p>
        </div>
        <Link
          href={`/portal/websites/${siteId}/store/products/new`}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors shrink-0"
        >
          <span className="material-icons text-base">add</span>
          Add Product
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="material-icons text-green-600 text-lg">payments</span>
            <p className="text-xs text-muted-foreground">Total Revenue</p>
          </div>
          <p className="text-2xl font-bold text-foreground">
            {analytics ? formatMoney(analytics.totalRevenue) : '$0.00'}
          </p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="material-icons text-blue-600 text-lg">shopping_cart</span>
            <p className="text-xs text-muted-foreground">Orders Today</p>
          </div>
          <p className="text-2xl font-bold text-foreground">{analytics?.ordersToday ?? 0}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="material-icons text-indigo-600 text-lg">inventory_2</span>
            <p className="text-xs text-muted-foreground">Active Products</p>
          </div>
          <p className="text-2xl font-bold text-foreground">{analytics?.activeProducts ?? 0}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="material-icons text-orange-600 text-lg">warning</span>
            <p className="text-xs text-muted-foreground">Low Stock Items</p>
          </div>
          <p className="text-2xl font-bold text-foreground">{analytics?.lowStockItems ?? 0}</p>
        </div>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
        {quickLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="bg-card border border-border rounded-xl p-4 flex flex-col items-center gap-2 hover:bg-accent/50 transition-colors group"
          >
            <span className="material-icons text-2xl text-muted-foreground group-hover:text-primary transition-colors">
              {link.icon}
            </span>
            <span className="text-xs font-medium text-foreground">{link.label}</span>
          </Link>
        ))}
      </div>

      {/* Recent Orders */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/20 flex items-center justify-between">
          <h2 className="font-semibold text-sm text-foreground">Recent Orders</h2>
          <Link
            href={`/portal/websites/${siteId}/store/orders`}
            className="text-xs text-primary hover:underline"
          >
            View All
          </Link>
        </div>
        {recentOrders.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <span className="material-icons text-4xl text-muted-foreground/40">receipt_long</span>
            <p className="text-sm text-muted-foreground mt-2">No orders yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-2 text-xs font-medium text-muted-foreground">Order</th>
                  <th className="px-4 py-2 text-xs font-medium text-muted-foreground">Customer</th>
                  <th className="px-4 py-2 text-xs font-medium text-muted-foreground">Items</th>
                  <th className="px-4 py-2 text-xs font-medium text-muted-foreground">Total</th>
                  <th className="px-4 py-2 text-xs font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-2 text-xs font-medium text-muted-foreground">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recentOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        href={`/portal/websites/${siteId}/store/orders/${order.id}`}
                        className="text-primary font-medium hover:underline"
                      >
                        {order.orderNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-foreground">{order.customerName}</td>
                    <td className="px-4 py-3 text-muted-foreground">{order.itemCount}</td>
                    <td className="px-4 py-3 font-medium text-foreground">{formatMoney(order.totalCents)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[order.status] || 'bg-gray-100 text-gray-700'}`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {new Date(order.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
