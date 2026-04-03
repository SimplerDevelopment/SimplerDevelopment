'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useCustomerAuth } from '@/components/storefront/account/CustomerAuthContext';
import { RequireAuth } from '@/components/storefront/account/RequireAuth';
import { AccountLayout } from '@/components/storefront/account/AccountLayout';

interface OrderItem {
  id: number;
  productName: string;
  variantName?: string;
  quantity: number;
  unitPrice: number;
  total: number;
  imageUrl?: string;
}

interface Address {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

interface HistoryEntry {
  id: number;
  status: string;
  note?: string;
  createdAt: string;
}

interface Order {
  id: number;
  orderNumber: string;
  status: string;
  subtotal: number;
  tax: number;
  shipping: number;
  total: number;
  createdAt: string;
  trackingNumber?: string;
  trackingUrl?: string;
  shippingAddress?: Address;
  billingAddress?: Address;
}

const statusColor: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  processing: 'bg-blue-100 text-blue-800',
  shipped: 'bg-purple-100 text-purple-800',
  delivered: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
};

const timelineIcon: Record<string, string> = {
  pending: 'schedule',
  processing: 'inventory_2',
  shipped: 'local_shipping',
  delivered: 'check_circle',
  cancelled: 'cancel',
};

const formatCurrency = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export function OrderDetailClient({ siteId, domain, orderNumber }: { siteId: number; domain: string; orderNumber: string }) {
  const { token } = useCustomerAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/storefront/${siteId}/account/orders/${orderNumber}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(res => {
        if (res.success) {
          setOrder(res.data.order);
          setItems(res.data.items ?? []);
          setHistory(res.data.history ?? []);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [siteId, token, orderNumber]);

  const renderAddress = (addr: Address | undefined, label: string) => {
    if (!addr) return null;
    return (
      <div>
        <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">{label}</h3>
        <div className="text-sm text-gray-900 space-y-0.5">
          <p className="font-medium">{addr.name}</p>
          <p>{addr.line1}</p>
          {addr.line2 && <p>{addr.line2}</p>}
          <p>{addr.city}, {addr.state} {addr.zip}</p>
          <p>{addr.country}</p>
        </div>
      </div>
    );
  };

  return (
    <RequireAuth>
      <AccountLayout siteId={siteId} domain={domain}>
        <div className="space-y-6">
          {/* Back link + header */}
          <div>
            <Link href="/account/orders" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 mb-3">
              <span className="material-icons" style={{ fontSize: '18px' }}>arrow_back</span>
              Back to orders
            </Link>

            {loading ? (
              <div className="text-center py-12">
                <span className="material-icons text-gray-300 animate-spin" style={{ fontSize: '32px' }}>progress_activity</span>
              </div>
            ) : !order ? (
              <div className="border border-gray-200 rounded-xl p-12 text-center">
                <span className="material-icons text-gray-300" style={{ fontSize: '48px' }}>error_outline</span>
                <p className="text-sm text-gray-500 mt-3">Order not found.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Order header */}
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900">Order {order.orderNumber}</h1>
                    <p className="text-sm text-gray-500 mt-1">
                      Placed on {new Date(order.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                  <span className={`text-sm px-3 py-1.5 rounded-full font-medium ${statusColor[order.status] ?? 'bg-gray-100 text-gray-700'}`}>
                    {order.status}
                  </span>
                </div>

                {/* Tracking */}
                {order.trackingNumber && (
                  <div className="border border-gray-200 rounded-xl p-4 flex items-center gap-3">
                    <span className="material-icons text-gray-400" style={{ fontSize: '20px' }}>local_shipping</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-500">Tracking Number</p>
                      <p className="text-sm font-medium text-gray-900">{order.trackingNumber}</p>
                    </div>
                    {order.trackingUrl && (
                      <a
                        href={order.trackingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-gray-900 hover:underline flex items-center gap-1"
                      >
                        Track Package
                        <span className="material-icons" style={{ fontSize: '16px' }}>open_in_new</span>
                      </a>
                    )}
                  </div>
                )}

                {/* Items table */}
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
                    <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider">Items</h2>
                  </div>
                  <div className="divide-y divide-gray-200">
                    {items.map(item => (
                      <div key={item.id} className="flex items-center gap-4 px-5 py-4">
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt={item.productName} className="w-14 h-14 object-cover rounded-lg border border-gray-200" />
                        ) : (
                          <div className="w-14 h-14 bg-gray-100 rounded-lg flex items-center justify-center">
                            <span className="material-icons text-gray-300" style={{ fontSize: '24px' }}>image</span>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900">{item.productName}</p>
                          {item.variantName && <p className="text-xs text-gray-500">{item.variantName}</p>}
                          <p className="text-xs text-gray-500">Qty: {item.quantity}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium text-gray-900">{formatCurrency(item.total)}</p>
                          {item.quantity > 1 && (
                            <p className="text-xs text-gray-500">{formatCurrency(item.unitPrice)} each</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Totals */}
                  <div className="border-t border-gray-200 px-5 py-4 space-y-2">
                    <div className="flex justify-between text-sm text-gray-500">
                      <span>Subtotal</span>
                      <span>{formatCurrency(order.subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-sm text-gray-500">
                      <span>Shipping</span>
                      <span>{formatCurrency(order.shipping)}</span>
                    </div>
                    <div className="flex justify-between text-sm text-gray-500">
                      <span>Tax</span>
                      <span>{formatCurrency(order.tax)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-semibold text-gray-900 pt-2 border-t border-gray-200">
                      <span>Total</span>
                      <span>{formatCurrency(order.total)}</span>
                    </div>
                  </div>
                </div>

                {/* Addresses */}
                {(order.shippingAddress || order.billingAddress) && (
                  <div className="grid sm:grid-cols-2 gap-6">
                    <div className="border border-gray-200 rounded-xl p-5">
                      {renderAddress(order.shippingAddress, 'Shipping Address')}
                    </div>
                    <div className="border border-gray-200 rounded-xl p-5">
                      {renderAddress(order.billingAddress, 'Billing Address')}
                    </div>
                  </div>
                )}

                {/* Order timeline */}
                {history.length > 0 && (
                  <div className="border border-gray-200 rounded-xl p-5">
                    <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-4">Order History</h2>
                    <div className="space-y-4">
                      {history.map((entry, i) => (
                        <div key={entry.id} className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <span
                              className={`material-icons ${i === 0 ? 'text-gray-900' : 'text-gray-300'}`}
                              style={{ fontSize: '20px' }}
                            >
                              {timelineIcon[entry.status] ?? 'circle'}
                            </span>
                            {i < history.length - 1 && <div className="w-px flex-1 bg-gray-200 mt-1" />}
                          </div>
                          <div className="pb-4">
                            <p className={`text-sm font-medium ${i === 0 ? 'text-gray-900' : 'text-gray-500'}`}>
                              {entry.status.charAt(0).toUpperCase() + entry.status.slice(1)}
                            </p>
                            {entry.note && <p className="text-xs text-gray-500 mt-0.5">{entry.note}</p>}
                            <p className="text-xs text-gray-400 mt-0.5">
                              {new Date(entry.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </AccountLayout>
    </RequireAuth>
  );
}
