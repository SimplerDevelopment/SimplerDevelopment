'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface OrderItem {
  id: number;
  productName: string;
  variantName?: string | null;
  sku?: string | null;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
}

interface Address {
  name?: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

interface StatusEvent {
  id: number;
  status: string;
  note?: string | null;
  createdAt: string;
}

interface Order {
  id: number;
  orderNumber: string;
  status: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string | null;
  shippingAddress?: Address | null;
  billingAddress?: Address | null;
  items: OrderItem[];
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  discountCents: number;
  totalCents: number;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  internalNotes?: string | null;
  statusHistory: StatusEvent[];
  createdAt: string;
  carrier?: string | null;
  shippingMethod?: string | null;
  labelUrl?: string | null;
  labelCostCents?: number | null;
  labelPurchasedAt?: string | null;
  easypostShipmentId?: string | null;
}

interface RateQuote {
  id: string;
  shipmentId: string;
  carrier: string;
  service: string;
  amountCents: number;
  currency: string;
  estDeliveryDays: number | null;
}

interface ParcelSummary {
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  weightOz: number;
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

const statusOptions = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'];

function formatMoney(cents: number) {
  return '$' + (cents / 100).toFixed(2);
}

function formatAddress(addr?: Address | null) {
  if (!addr) return null;
  const parts = [addr.name, addr.line1, addr.line2, [addr.city, addr.state, addr.postalCode].filter(Boolean).join(', '), addr.country].filter(
    Boolean
  );
  return parts;
}

export default function OrderDetailPage() {
  const { siteId, orderId } = useParams<{ siteId: string; orderId: string }>();
  const base = `/api/portal/websites/${siteId}/store`;

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [newStatus, setNewStatus] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [trackingUrl, setTrackingUrl] = useState('');
  const [internalNotes, setInternalNotes] = useState('');

  // ─── Shipping label state ──────────────────────────────────────────────
  const [rates, setRates] = useState<RateQuote[] | null>(null);
  const [parcelSummary, setParcelSummary] = useState<ParcelSummary | null>(null);
  const [selectedRateId, setSelectedRateId] = useState<string>('');
  const [ratesShipmentId, setRatesShipmentId] = useState<string>('');
  const [ratesLoading, setRatesLoading] = useState(false);
  const [labelBuying, setLabelBuying] = useState(false);
  const [labelRefunding, setLabelRefunding] = useState(false);
  const [labelError, setLabelError] = useState('');

  const loadOrder = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${base}/orders/${orderId}`);
      const data = await res.json();
      if (data.success && data.data) {
        setOrder(data.data);
        setNewStatus(data.data.status);
        setTrackingNumber(data.data.trackingNumber || '');
        setTrackingUrl(data.data.trackingUrl || '');
        setInternalNotes(data.data.internalNotes || '');
      }
    } catch {
      // fail silently
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrder();
  }, []);

  const updateStatus = async () => {
    if (!newStatus || newStatus === order?.status) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`${base}/orders/${orderId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, note: statusNote }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess('Status updated.');
        setStatusNote('');
        loadOrder();
      } else {
        setError(data.message || 'Failed to update status.');
      }
    } catch {
      setError('Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  const updateFulfillment = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`${base}/orders/${orderId}/fulfillment`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackingNumber, trackingUrl }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess('Fulfillment updated.');
        loadOrder();
      } else {
        setError(data.message || 'Failed to update.');
      }
    } catch {
      setError('Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  const markAsShipped = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`${base}/orders/${orderId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'shipped', note: trackingNumber ? `Tracking: ${trackingNumber}` : 'Marked as shipped' }),
      });
      const data = await res.json();
      if (data.success) {
        if (trackingNumber || trackingUrl) {
          await fetch(`${base}/orders/${orderId}/fulfillment`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ trackingNumber, trackingUrl }),
          });
        }
        setSuccess('Order marked as shipped.');
        loadOrder();
      } else {
        setError(data.message || 'Failed to update.');
      }
    } catch {
      setError('Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  const saveNotes = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`${base}/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ internalNotes }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess('Notes saved.');
      } else {
        setError(data.message || 'Failed to save notes.');
      }
    } catch {
      setError('Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  // ─── Shipping label handlers ───────────────────────────────────────────
  const computeRates = async () => {
    setRatesLoading(true);
    setLabelError('');
    setRates(null);
    setParcelSummary(null);
    setSelectedRateId('');
    setRatesShipmentId('');
    try {
      const res = await fetch(`${base}/orders/${orderId}/rates`, { method: 'POST' });
      const data = await res.json();
      if (data.success && data.data) {
        const fetched = (data.data.rates || []) as RateQuote[];
        const sorted = [...fetched].sort((a, b) => a.amountCents - b.amountCents);
        setRates(sorted);
        setParcelSummary(data.data.parcel as ParcelSummary);
        setRatesShipmentId(data.data.shipmentId as string);
        if (sorted.length > 0) setSelectedRateId(sorted[0].id);
      } else {
        setLabelError(data.message || 'Failed to compute rates.');
      }
    } catch {
      setLabelError('Failed to compute rates.');
    } finally {
      setRatesLoading(false);
    }
  };

  const buyLabel = async () => {
    if (!selectedRateId || !ratesShipmentId) return;
    setLabelBuying(true);
    setLabelError('');
    try {
      const res = await fetch(`${base}/orders/${orderId}/label`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rateId: selectedRateId, shipmentId: ratesShipmentId }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess('Label purchased.');
        setRates(null);
        setParcelSummary(null);
        setSelectedRateId('');
        setRatesShipmentId('');
        loadOrder();
      } else {
        setLabelError(data.message || 'Failed to purchase label.');
      }
    } catch {
      setLabelError('Failed to purchase label.');
    } finally {
      setLabelBuying(false);
    }
  };

  const refundLabel = async () => {
    if (typeof window !== 'undefined' && !window.confirm('Request a refund for this shipping label? The label will be voided and removed from the order.')) {
      return;
    }
    setLabelRefunding(true);
    setLabelError('');
    try {
      const res = await fetch(`${base}/orders/${orderId}/label`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setSuccess('Label refund requested.');
        loadOrder();
      } else {
        setLabelError(data.message || 'Failed to refund label.');
      }
    } catch {
      setLabelError('Failed to refund label.');
    } finally {
      setLabelRefunding(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <span className="material-icons animate-spin text-primary text-2xl">refresh</span>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="max-w-4xl mx-auto text-center py-16">
        <span className="material-icons text-4xl text-muted-foreground/40">error_outline</span>
        <p className="text-muted-foreground mt-2">Order not found.</p>
      </div>
    );
  }

  const shippingLines = formatAddress(order.shippingAddress);
  const billingLines = formatAddress(order.billingAddress);
  const inputClass =
    'w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40';

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <Link
        href={`/portal/websites/${siteId}/store/orders`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <span className="material-icons text-base">arrow_back</span>
        Orders
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-foreground">{order.orderNumber}</h1>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                statusColors[order.status] || 'bg-gray-100 text-gray-700'
              }`}
            >
              {order.status}
            </span>
          </div>
          <p className="text-muted-foreground text-sm mt-1">{new Date(order.createdAt).toLocaleString()}</p>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
          <span className="material-icons text-base">error</span>
          {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm dark:bg-green-900/20 dark:border-green-800 dark:text-green-400">
          <span className="material-icons text-base">check_circle</span>
          {success}
        </div>
      )}

      {/* Status Update */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h2 className="font-semibold text-foreground flex items-center gap-2">
          <span className="material-icons text-lg text-muted-foreground">swap_horiz</span>
          Update Status
        </h2>
        <div className="flex items-end gap-3">
          <div className="flex-1 space-y-1.5">
            <label className="text-sm font-medium text-foreground">New Status</label>
            <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)} className={inputClass}>
              {statusOptions.map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 space-y-1.5">
            <label className="text-sm font-medium text-foreground">Note (optional)</label>
            <input value={statusNote} onChange={(e) => setStatusNote(e.target.value)} placeholder="Add a note..." className={inputClass} />
          </div>
          <button
            onClick={updateStatus}
            disabled={saving || newStatus === order.status}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving && <span className="material-icons text-base animate-spin">refresh</span>}
            Update
          </button>
        </div>
      </div>

      {/* Customer + Addresses */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-5 space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Customer</h3>
          <p className="text-sm font-medium text-foreground">{order.customerName}</p>
          <p className="text-sm text-muted-foreground">{order.customerEmail}</p>
          {order.customerPhone && <p className="text-sm text-muted-foreground">{order.customerPhone}</p>}
        </div>
        <div className="bg-card border border-border rounded-xl p-5 space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Shipping Address</h3>
          {shippingLines ? (
            shippingLines.map((line, i) => (
              <p key={i} className="text-sm text-foreground">
                {line}
              </p>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No shipping address</p>
          )}
        </div>
        <div className="bg-card border border-border rounded-xl p-5 space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Billing Address</h3>
          {billingLines ? (
            billingLines.map((line, i) => (
              <p key={i} className="text-sm text-foreground">
                {line}
              </p>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">Same as shipping</p>
          )}
        </div>
      </div>

      {/* Order Items */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/20">
          <h2 className="font-semibold text-sm text-foreground">Order Items</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-2 text-xs font-medium text-muted-foreground">Product</th>
                <th className="px-4 py-2 text-xs font-medium text-muted-foreground">SKU</th>
                <th className="px-4 py-2 text-xs font-medium text-muted-foreground text-right">Qty</th>
                <th className="px-4 py-2 text-xs font-medium text-muted-foreground text-right">Unit Price</th>
                <th className="px-4 py-2 text-xs font-medium text-muted-foreground text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {order.items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{item.productName}</p>
                    {item.variantName && <p className="text-xs text-muted-foreground">{item.variantName}</p>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{item.sku || '--'}</td>
                  <td className="px-4 py-3 text-foreground text-right">{item.quantity}</td>
                  <td className="px-4 py-3 text-foreground text-right">{formatMoney(item.unitPriceCents)}</td>
                  <td className="px-4 py-3 font-medium text-foreground text-right">{formatMoney(item.totalCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-border p-4 space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="text-foreground">{formatMoney(order.subtotalCents)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Shipping</span>
            <span className="text-foreground">{formatMoney(order.shippingCents)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Tax</span>
            <span className="text-foreground">{formatMoney(order.taxCents)}</span>
          </div>
          {order.discountCents > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Discount</span>
              <span className="text-green-600">-{formatMoney(order.discountCents)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm font-bold pt-2 border-t border-border">
            <span className="text-foreground">Total</span>
            <span className="text-foreground">{formatMoney(order.totalCents)}</span>
          </div>
        </div>
      </div>

      {/* Fulfillment */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h2 className="font-semibold text-foreground flex items-center gap-2">
          <span className="material-icons text-lg text-muted-foreground">local_shipping</span>
          Fulfillment
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Tracking Number</label>
            <input value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} placeholder="Enter tracking number" className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Tracking URL</label>
            <input value={trackingUrl} onChange={(e) => setTrackingUrl(e.target.value)} placeholder="https://..." className={inputClass} />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={updateFulfillment}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-accent text-foreground rounded-lg text-sm font-medium hover:bg-accent/80 transition-colors disabled:opacity-50"
          >
            Save Tracking
          </button>
          {order.status !== 'shipped' && order.status !== 'delivered' && (
            <button
              onClick={markAsShipped}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <span className="material-icons text-base">local_shipping</span>
              Mark as Shipped
            </button>
          )}
        </div>
      </div>

      {/* Shipping Label */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h2 className="font-semibold text-foreground flex items-center gap-2">
          <span className="material-icons text-lg text-muted-foreground">local_shipping</span>
          Shipping Label
        </h2>

        {labelError && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
            <span className="material-icons text-base">error</span>
            {labelError}
          </div>
        )}

        {order.labelUrl ? (
          /* State B — label purchased */
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              {order.carrier && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Carrier</p>
                  <p className="text-foreground">{order.carrier}</p>
                </div>
              )}
              {order.shippingMethod && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Service</p>
                  <p className="text-foreground">{order.shippingMethod}</p>
                </div>
              )}
              {order.trackingNumber && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Tracking</p>
                  {order.trackingUrl ? (
                    <a
                      href={order.trackingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline font-mono text-xs"
                    >
                      {order.trackingNumber}
                    </a>
                  ) : (
                    <p className="text-foreground font-mono text-xs">{order.trackingNumber}</p>
                  )}
                </div>
              )}
              {order.labelPurchasedAt && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Purchased</p>
                  <p className="text-foreground">{new Date(order.labelPurchasedAt).toLocaleString()}</p>
                </div>
              )}
              {order.labelCostCents != null && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Label Cost</p>
                  <p className="text-foreground">{formatMoney(order.labelCostCents)}</p>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3 pt-2">
              <a
                href={order.labelUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                <span className="material-icons text-base">download</span>
                View Label
              </a>
              <button
                onClick={refundLabel}
                disabled={labelRefunding}
                className="flex items-center gap-2 px-4 py-2 bg-accent text-foreground rounded-lg text-sm font-medium hover:bg-accent/80 transition-colors disabled:opacity-50"
              >
                {labelRefunding ? (
                  <span className="material-icons text-base animate-spin">refresh</span>
                ) : (
                  <span className="material-icons text-base">cancel</span>
                )}
                Refund Label
              </button>
            </div>
          </div>
        ) : (
          /* State A — no label yet */
          <div className="space-y-4">
            {!rates && (
              <button
                onClick={computeRates}
                disabled={ratesLoading}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {ratesLoading ? (
                  <span className="material-icons text-base animate-spin">refresh</span>
                ) : (
                  <span className="material-icons text-base">calculate</span>
                )}
                Compute Rates
              </button>
            )}

            {rates && parcelSummary && (
              <>
                <div className="text-xs text-muted-foreground bg-muted/30 px-3 py-2 rounded-lg">
                  <span className="font-medium">Parcel:</span>{' '}
                  {parcelSummary.lengthIn} × {parcelSummary.widthIn} × {parcelSummary.heightIn} in,{' '}
                  {parcelSummary.weightOz} oz
                </div>

                {rates.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No rates returned for this shipment.</p>
                ) : (
                  <div className="space-y-2">
                    {rates.map((r, idx) => {
                      const isCheapest = idx === 0;
                      const checked = selectedRateId === r.id;
                      return (
                        <label
                          key={r.id}
                          className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                            checked
                              ? 'border-primary bg-primary/5'
                              : 'border-border hover:border-primary/40'
                          }`}
                        >
                          <input
                            type="radio"
                            name="rate"
                            value={r.id}
                            checked={checked}
                            onChange={() => setSelectedRateId(r.id)}
                            className="accent-primary"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-foreground">
                                {r.carrier} {r.service}
                              </p>
                              {isCheapest && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                  <span className="material-icons text-[10px]">star</span>
                                  Best value
                                </span>
                              )}
                            </div>
                            {r.estDeliveryDays != null && (
                              <p className="text-xs text-muted-foreground">
                                Est. {r.estDeliveryDays} day{r.estDeliveryDays === 1 ? '' : 's'}
                              </p>
                            )}
                          </div>
                          <p className="text-sm font-semibold text-foreground tabular-nums">
                            ${(r.amountCents / 100).toFixed(2)}
                          </p>
                        </label>
                      );
                    })}
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <button
                    onClick={buyLabel}
                    disabled={labelBuying || !selectedRateId}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {labelBuying ? (
                      <span className="material-icons text-base animate-spin">refresh</span>
                    ) : (
                      <span className="material-icons text-base">shopping_cart</span>
                    )}
                    Buy Label
                  </button>
                  <button
                    onClick={computeRates}
                    disabled={ratesLoading || labelBuying}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                  >
                    <span className="material-icons text-base">refresh</span>
                    Refresh rates
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Internal Notes */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h2 className="font-semibold text-foreground flex items-center gap-2">
          <span className="material-icons text-lg text-muted-foreground">sticky_note_2</span>
          Internal Notes
        </h2>
        <textarea
          value={internalNotes}
          onChange={(e) => setInternalNotes(e.target.value)}
          rows={4}
          placeholder="Add private notes about this order..."
          className={inputClass}
        />
        <button
          onClick={saveNotes}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-accent text-foreground rounded-lg text-sm font-medium hover:bg-accent/80 transition-colors disabled:opacity-50"
        >
          Save Notes
        </button>
      </div>

      {/* Status History Timeline */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h2 className="font-semibold text-foreground flex items-center gap-2">
          <span className="material-icons text-lg text-muted-foreground">history</span>
          Status History
        </h2>
        {order.statusHistory.length === 0 ? (
          <p className="text-sm text-muted-foreground">No status changes recorded.</p>
        ) : (
          <div className="relative pl-6 space-y-4">
            <div className="absolute left-2 top-1 bottom-1 w-0.5 bg-border" />
            {order.statusHistory.map((event) => (
              <div key={event.id} className="relative">
                <div className="absolute -left-4 top-1 w-2.5 h-2.5 rounded-full bg-primary border-2 border-card" />
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        statusColors[event.status] || 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {event.status}
                    </span>
                    <span className="text-xs text-muted-foreground">{new Date(event.createdAt).toLocaleString()}</span>
                  </div>
                  {event.note && <p className="text-sm text-muted-foreground mt-1">{event.note}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
