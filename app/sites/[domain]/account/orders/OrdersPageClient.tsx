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
  itemCount: number;
  createdAt: string;
}

const statusColor: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  processing: 'bg-blue-100 text-blue-800',
  shipped: 'bg-purple-100 text-purple-800',
  delivered: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
};

const formatCurrency = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export function OrdersPageClient({ siteId, domain }: { siteId: number; domain: string }) {
  const { token } = useCustomerAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/storefront/${siteId}/account/orders`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(res => { if (res.success) setOrders(res.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [siteId, token]);

  return (
    <RequireAuth>
      <AccountLayout siteId={siteId} domain={domain}>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">My Orders</h1>
              <p className="text-gray-500 text-sm mt-1">View and track your order history.</p>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <span className="material-icons text-gray-300 animate-spin" style={{ fontSize: '32px' }}>progress_activity</span>
            </div>
          ) : orders.length === 0 ? (
            <div className="border border-gray-200 rounded-xl p-12 text-center">
              <span className="material-icons text-gray-300" style={{ fontSize: '48px' }}>receipt_long</span>
              <p className="text-sm text-gray-500 mt-3">You haven&apos;t placed any orders yet.</p>
              <Link href="/shop" className="inline-block mt-4 px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800">
                Start Shopping
              </Link>
            </div>
          ) : (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              {/* Header */}
              <div className="hidden sm:grid grid-cols-12 gap-4 px-5 py-3 bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200">
                <div className="col-span-3">Order</div>
                <div className="col-span-3">Date</div>
                <div className="col-span-2">Status</div>
                <div className="col-span-2">Items</div>
                <div className="col-span-2 text-right">Total</div>
              </div>
              <div className="divide-y divide-gray-200">
                {orders.map(order => (
                  <Link
                    key={order.id}
                    href={`/account/orders/${order.orderNumber}`}
                    className="grid grid-cols-12 gap-4 items-center px-5 py-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="col-span-6 sm:col-span-3">
                      <p className="text-sm font-medium text-gray-900">{order.orderNumber}</p>
                    </div>
                    <div className="col-span-6 sm:col-span-3">
                      <p className="text-sm text-gray-500">
                        {new Date(order.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>
                    <div className="col-span-4 sm:col-span-2">
                      <span className={`inline-block text-xs px-2.5 py-1 rounded-full font-medium ${statusColor[order.status] ?? 'bg-gray-100 text-gray-700'}`}>
                        {order.status}
                      </span>
                    </div>
                    <div className="col-span-4 sm:col-span-2">
                      <p className="text-sm text-gray-500">{order.itemCount ?? '--'} item{order.itemCount !== 1 ? 's' : ''}</p>
                    </div>
                    <div className="col-span-4 sm:col-span-2 text-right flex items-center justify-end gap-2">
                      <span className="text-sm font-medium text-gray-900">{formatCurrency(order.total)}</span>
                      <span className="material-icons text-gray-400" style={{ fontSize: '18px' }}>chevron_right</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </AccountLayout>
    </RequireAuth>
  );
}
