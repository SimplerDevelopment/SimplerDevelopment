'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useCustomerAuth } from '@/components/storefront/account/CustomerAuthContext';
import { RequireAuth } from '@/components/storefront/account/RequireAuth';
import { AccountLayout } from '@/components/storefront/account/AccountLayout';
import { formatMoney } from '@/lib/utils/money';

interface OrderItem {
  id: number;
  productName: string;
  variantName?: string;
  quantity: number;
  unitPrice: number;
  total: number;
  imageUrl?: string;
  designId?: number | null;
  design?: {
    id: number;
    uuid: string | null;
    name: string | null;
    thumbnailUrl: string | null;
  } | null;
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

type TrackingStatus =
  | 'pre_transit'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'return_to_sender'
  | 'failure'
  | 'cancelled'
  | 'error'
  | 'unknown';

interface Order {
  id: number;
  orderNumber: string;
  status: string;
  subtotal: number;
  tax: number;
  shipping: number;
  total: number;
  createdAt: string;
  carrier?: string | null;
  shippingMethod?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  latestTrackingStatus?: TrackingStatus | string | null;
  latestTrackingEventAt?: string | null;
  shippedAt?: string | null;
  deliveredAt?: string | null;
  shippingAddress?: Address;
  billingAddress?: Address;
}

interface TrackingEvent {
  processedAt: string | Date;
  eventType: string;
  payload: unknown;
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

// Map EasyPost tracking status → { label, pill class }
const trackingStatusMeta: Record<string, { label: string; pill: string }> = {
  pre_transit: { label: 'Label created', pill: 'bg-gray-100 text-gray-700' },
  in_transit: { label: 'In transit', pill: 'bg-blue-100 text-blue-800' },
  out_for_delivery: { label: 'Out for delivery', pill: 'bg-blue-100 text-blue-800' },
  delivered: { label: 'Delivered', pill: 'bg-green-100 text-green-800' },
  return_to_sender: { label: 'Returned', pill: 'bg-orange-100 text-orange-800' },
  failure: { label: 'Issue', pill: 'bg-red-100 text-red-800' },
  error: { label: 'Issue', pill: 'bg-red-100 text-red-800' },
  cancelled: { label: 'Cancelled', pill: 'bg-gray-100 text-gray-700' },
  unknown: { label: 'Updating', pill: 'bg-gray-100 text-gray-700' },
};

function getTrackingStatusMeta(status: string | null | undefined, hasTracking: boolean) {
  if (status && trackingStatusMeta[status]) return trackingStatusMeta[status];
  // Fallback: if a label was purchased (we have a tracking number) but no scan yet, show pre_transit-ish state
  if (hasTracking) return trackingStatusMeta.pre_transit;
  return trackingStatusMeta.unknown;
}

function relativeTime(input: string | Date | null | undefined): string {
  if (!input) return '';
  const date = input instanceof Date ? input : new Date(input);
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 0) return 'just now';
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}

// Pull a human-readable status from a webhook payload, falling back to "—".
function eventStatusFromPayload(payload: unknown): string {
  if (payload && typeof payload === 'object') {
    const result = (payload as { result?: unknown }).result;
    if (result && typeof result === 'object') {
      const status = (result as { status?: unknown }).status;
      if (typeof status === 'string' && status.length > 0) return status;
    }
  }
  return '—';
}

export function OrderDetailClient({ siteId, domain, orderNumber }: { siteId: number; domain: string; orderNumber: string }) {
  const { token } = useCustomerAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [trackingEvents, setTrackingEvents] = useState<TrackingEvent[]>([]);
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
          setTrackingEvents(res.data.trackingEvents ?? []);
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

                {/* Shipment tracking */}
                {(order.carrier || order.trackingNumber || order.latestTrackingStatus) && (() => {
                  const hasTracking = Boolean(order.trackingNumber);
                  const statusMeta = getTrackingStatusMeta(order.latestTrackingStatus, hasTracking);
                  return (
                    <div className="border border-gray-200 rounded-xl p-5 space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="material-icons text-gray-400" style={{ fontSize: '20px' }}>local_shipping</span>
                        <h2 className="text-sm font-semibold text-gray-900">Shipment</h2>
                        <span className={`ml-auto text-xs px-2.5 py-1 rounded-full font-medium ${statusMeta.pill}`}>
                          {statusMeta.label}
                        </span>
                      </div>

                      {(order.carrier || order.shippingMethod) && (
                        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-700">
                          {order.carrier && (
                            <div>
                              <span className="text-gray-500">Carrier: </span>
                              <span className="font-medium">{order.carrier}</span>
                            </div>
                          )}
                          {order.shippingMethod && (
                            <div>
                              <span className="text-gray-500">Service: </span>
                              <span className="font-medium">{order.shippingMethod}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {order.trackingNumber && (
                        <div className="text-sm">
                          <span className="text-gray-500">Tracking #: </span>
                          {order.trackingUrl ? (
                            <a
                              href={order.trackingUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-medium text-gray-900 hover:underline inline-flex items-center gap-1"
                            >
                              {order.trackingNumber}
                              <span className="material-icons" style={{ fontSize: '14px' }}>open_in_new</span>
                            </a>
                          ) : (
                            <span className="font-medium text-gray-900">{order.trackingNumber}</span>
                          )}
                        </div>
                      )}

                      {order.latestTrackingEventAt ? (
                        <p className="text-xs text-gray-500">
                          Last update: {relativeTime(order.latestTrackingEventAt)}
                        </p>
                      ) : (
                        hasTracking && (
                          <p className="text-xs text-gray-500">Awaiting carrier scan</p>
                        )
                      )}

                      {order.trackingUrl && (
                        <a
                          href={order.trackingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-medium text-gray-900 hover:underline inline-flex items-center gap-1"
                        >
                          View full tracking
                          <span className="material-icons" style={{ fontSize: '16px' }}>open_in_new</span>
                        </a>
                      )}
                    </div>
                  );
                })()}

                {/* Tracking history */}
                {trackingEvents.length > 0 && (
                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
                      <span className="material-icons text-gray-400" style={{ fontSize: '18px' }}>history</span>
                      <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider">Tracking history</h2>
                    </div>
                    <div className="divide-y divide-gray-200">
                      {trackingEvents.map((ev, i) => {
                        const status = eventStatusFromPayload(ev.payload);
                        return (
                          <div key={i} className="flex items-baseline gap-3 px-5 py-3 text-sm">
                            <span className="text-xs text-gray-400 whitespace-nowrap min-w-[7.5rem]">
                              {new Date(ev.processedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                            </span>
                            <span className="text-gray-900 font-medium">{ev.eventType}</span>
                            <span className="text-gray-500">— {status}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Items table */}
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
                    <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider">Items</h2>
                  </div>
                  <div className="divide-y divide-gray-200">
                    {items.map(item => {
                      // Prefer the customer's design thumbnail over the
                      // generic product photo when this line was a
                      // custom-designed item — that's the version the
                      // customer ordered and the version we shipped.
                      const thumb = item.design?.thumbnailUrl || item.imageUrl;
                      return (
                        <div key={item.id} className="flex items-center gap-4 px-5 py-4">
                          {thumb ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={thumb} alt={item.productName} className="w-14 h-14 object-cover rounded-lg border border-gray-200" />
                          ) : (
                            <div className="w-14 h-14 bg-gray-100 rounded-lg flex items-center justify-center">
                              <span className="material-icons text-gray-300" style={{ fontSize: '24px' }}>image</span>
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900">{item.productName}</p>
                            {item.variantName && <p className="text-xs text-gray-500">{item.variantName}</p>}
                            {item.design ? (
                              <p className="text-xs italic text-gray-500">Custom: {item.design.name || 'Untitled design'}</p>
                            ) : item.designId ? (
                              <p className="text-xs italic text-gray-400">Design no longer available</p>
                            ) : null}
                            <p className="text-xs text-gray-500">Qty: {item.quantity}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-medium text-gray-900">{formatMoney(item.total)}</p>
                            {item.quantity > 1 && (
                              <p className="text-xs text-gray-500">{formatMoney(item.unitPrice)} each</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {/* Totals */}
                  <div className="border-t border-gray-200 px-5 py-4 space-y-2">
                    <div className="flex justify-between text-sm text-gray-500">
                      <span>Subtotal</span>
                      <span>{formatMoney(order.subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-sm text-gray-500">
                      <span>Shipping</span>
                      <span>{formatMoney(order.shipping)}</span>
                    </div>
                    <div className="flex justify-between text-sm text-gray-500">
                      <span>Tax</span>
                      <span>{formatMoney(order.tax)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-semibold text-gray-900 pt-2 border-t border-gray-200">
                      <span>Total</span>
                      <span>{formatMoney(order.total)}</span>
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
