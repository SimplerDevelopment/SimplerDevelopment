'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useCustomerAuth } from '@/components/storefront/account/CustomerAuthContext';
import { RequireAuth } from '@/components/storefront/account/RequireAuth';
import { AccountLayout } from '@/components/storefront/account/AccountLayout';

interface Order {
  id: number;
  orderNumber: string;
  status: string;
  total: number;
  createdAt: string;
}

export function AccountDashboardClient({ siteId, domain }: { siteId: number; domain: string }) {
  const { customer, token } = useCustomerAuth();
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/storefront/${siteId}/account/orders`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(res => { if (res.success) setRecentOrders(res.data.slice(0, 5)); })
      .catch(() => {});
  }, [siteId, token]);

  const formatCurrency = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  const statusColor: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    processing: 'bg-blue-100 text-blue-800',
    shipped: 'bg-purple-100 text-purple-800',
    delivered: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800',
  };

  return (
    <RequireAuth>
      <AccountLayout siteId={siteId} domain={domain}>
        <div className="space-y-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Welcome back{customer?.firstName ? `, ${customer.firstName}` : ''}
            </h1>
            <p className="text-gray-500 text-sm mt-1">Manage your orders, wishlist, and account settings.</p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Total Orders</p>
              <p className="text-2xl font-bold text-gray-900">{customer?.orderCount ?? 0}</p>
            </div>
            <div className="border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Total Spent</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(customer?.totalSpent ?? 0)}</p>
            </div>
            <div className="border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Member Since</p>
              <p className="text-lg font-semibold text-gray-900">
                {customer?.createdAt ? new Date(customer.createdAt as unknown as string).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '---'}
              </p>
            </div>
          </div>

          {/* Quick actions */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { href: '/account/orders', icon: 'receipt_long', label: 'My Orders' },
              { href: '/account/wishlist', icon: 'favorite', label: 'Wishlist' },
              { href: '/account/support', icon: 'support_agent', label: 'Get Help' },
              { href: '/account/profile', icon: 'person', label: 'Profile' },
            ].map(link => (
              <Link
                key={link.href}
                href={link.href}
                className="flex items-center gap-3 p-4 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
              >
                <span className="material-icons text-xl text-gray-400" style={{ fontSize: '24px' }}>{link.icon}</span>
                <span className="text-sm font-medium text-gray-900">{link.label}</span>
              </Link>
            ))}
          </div>

          {/* Recent orders */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Recent Orders</h2>
              <Link href="/account/orders" className="text-xs text-gray-500 hover:text-gray-900">View all</Link>
            </div>
            {recentOrders.length === 0 ? (
              <div className="p-8 text-center">
                <span className="material-icons text-4xl text-gray-300" style={{ fontSize: '48px' }}>receipt_long</span>
                <p className="text-sm text-gray-500 mt-2">No orders yet. Start shopping!</p>
                <Link href="/shop" className="inline-block mt-4 px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800">
                  Browse Products
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {recentOrders.map(order => (
                  <Link
                    key={order.id}
                    href={`/account/orders/${order.orderNumber}`}
                    className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{order.orderNumber}</p>
                      <p className="text-xs text-gray-500">{new Date(order.createdAt).toLocaleDateString()}</p>
                    </div>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusColor[order.status] ?? 'bg-gray-100 text-gray-700'}`}>
                      {order.status}
                    </span>
                    <span className="text-sm font-medium text-gray-900">{formatCurrency(order.total)}</span>
                    <span className="material-icons text-gray-400" style={{ fontSize: '18px' }}>chevron_right</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </AccountLayout>
    </RequireAuth>
  );
}
