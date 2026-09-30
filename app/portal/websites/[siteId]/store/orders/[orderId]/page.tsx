'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { formatMoney } from '@/lib/utils/money';
import PortalPageHeader from '@/components/portal/PortalPageHeader';
import { pBtnPrimary, pBtnGhost, pCard, pInput, pSelect, pSectionTitle, sBtn, sBtnGhost } from '@/components/portal/portal-ui';
import { useFeatureFlag } from '@/components/portal/FeatureFlagsProvider';
import { canFulfil } from '@/lib/store/order-steps';
import OrderStepper from './_components/OrderStepper';
import ShippingLabelCard from './_components/ShippingLabelCard';
import CustomerCards from './_components/CustomerCards';
import StatusTimeline from './_components/StatusTimeline';
import { statusColors, type Order, type RateQuote, type ParcelSummary } from './_components/types';

const printfulStatusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  in_process: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  fulfilled: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

const statusOptions = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'];

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

  // ─── Printful fulfillment state ────────────────────────────────────────
  const [fulfillmentProvider, setFulfillmentProvider] = useState<string>('manual');
  const [printfulSubmitting, setPrintfulSubmitting] = useState(false);
  const [printfulError, setPrintfulError] = useState('');

  // ─── Shipping label state ──────────────────────────────────────────────
  const [rates, setRates] = useState<RateQuote[] | null>(null);
  const [parcelSummary, setParcelSummary] = useState<ParcelSummary | null>(null);
  const [selectedRateId, setSelectedRateId] = useState<string>('');
  const [ratesShipmentId, setRatesShipmentId] = useState<string>('');
  const [ratesLoading, setRatesLoading] = useState(false);
  const [labelBuying, setLabelBuying] = useState(false);
  const [labelRefunding, setLabelRefunding] = useState(false);
  const [labelError, setLabelError] = useState('');
  // PUX-187: under the flag the customer card links to the CRM contact that
  // shares the order's email. The contacts route has no exact-email param —
  // `search` ILIKEs name/email — so match exactly on the client side.
  const studio = useFeatureFlag('portal-redesign');
  const [contactId, setContactId] = useState<number | null>(null);
  const customerEmail = order?.customerEmail;
  useEffect(() => {
    if (!studio || !customerEmail) return;
    let cancelled = false;
    fetch(`/api/portal/crm/contacts?search=${encodeURIComponent(customerEmail)}&limit=5`)
      .then((r) => r.json())
      .then((data) => {
        const hit = data?.data?.contacts?.find((c: { email?: string | null }) => c.email?.toLowerCase() === customerEmail.toLowerCase());
        if (!cancelled) setContactId(hit?.id ?? null);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [studio, customerEmail]);

  const loadOrder = async () => {
    setLoading(true);
    try {
      const [orderRes, settingsRes] = await Promise.all([
        fetch(`${base}/orders/${orderId}`),
        fetch(`${base}/settings`),
      ]);
      const [orderData, settingsData] = await Promise.all([orderRes.json(), settingsRes.json()]);
      if (orderData.success && orderData.data) {
        setOrder(orderData.data);
        setNewStatus(orderData.data.status);
        setTrackingNumber(orderData.data.trackingNumber || '');
        setTrackingUrl(orderData.data.trackingUrl || '');
        setInternalNotes(orderData.data.internalNotes || '');
      }
      if (settingsData.success && settingsData.data) {
        setFulfillmentProvider(settingsData.data.fulfillmentProvider || 'manual');
      }
    } catch {
      // fail silently
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadOrder(); // eslint-disable-line react-hooks/set-state-in-effect
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  const submitToPrintful = async () => {
    setPrintfulSubmitting(true);
    setPrintfulError('');
    setSuccess('');
    try {
      const res = await fetch(`${base}/orders/${orderId}/printful/submit`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setSuccess('Order submitted to Printful.');
        loadOrder();
      } else {
        setPrintfulError(data.message || 'Failed to submit order to Printful.');
      }
    } catch {
      setPrintfulError('Failed to submit order to Printful.');
    } finally {
      setPrintfulSubmitting(false);
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

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Back-link — kept above PortalPageHeader per sweep convention */}
      <Link
        href={`/portal/websites/${siteId}/store/orders`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <span className="material-icons text-base">arrow_back</span>
        Orders
      </Link>

      <PortalPageHeader
        eyebrow="Store"
        title={
          <span className="inline-flex items-center gap-3">
            {order.orderNumber}
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                statusColors[order.status] || 'bg-muted text-muted-foreground'
              }`}
            >
              {order.status}
            </span>
          </span>
        }
        subtitle={new Date(order.createdAt).toLocaleString()}
        actions={studio && canFulfil(order.status) ? (
          <button type="button" onClick={markAsShipped} disabled={saving} className={sBtn}>
            <span className="material-icons text-base">local_shipping</span>
            Mark fulfilled
          </button>
        ) : undefined}
      />
      {studio && <OrderStepper status={order.status} />}

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
      <div className={`${pCard} p-6 space-y-4`}>
        <h2 className={`${pSectionTitle} flex items-center gap-2`}>
          <span className="material-icons text-lg text-muted-foreground">swap_horiz</span>
          Update Status
        </h2>
        <div className="flex items-end gap-3">
          <div className="flex-1 space-y-1.5">
            <label className="text-sm font-medium text-foreground">New Status</label>
            <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)} className={pSelect}>
              {statusOptions.map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 space-y-1.5">
            <label className="text-sm font-medium text-foreground">Note (optional)</label>
            <input value={statusNote} onChange={(e) => setStatusNote(e.target.value)} placeholder="Add a note..." className={pInput} />
          </div>
          <button
            onClick={updateStatus}
            disabled={saving || newStatus === order.status}
            className={studio ? sBtnGhost : pBtnPrimary}
          >
            {saving && <span className="material-icons text-base animate-spin">refresh</span>}
            Update
          </button>
        </div>
      </div>

      {/* Customer + Addresses */}
      <CustomerCards order={order} contactHref={contactId ? `/portal/crm/contacts/${contactId}` : undefined} />

      {/* Order Items */}
      <div className={`${pCard} overflow-hidden`}>
        <div className="px-4 py-3 border-b border-border bg-muted/20">
          <h2 className={pSectionTitle}>Order Items</h2>
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
                    <div className="flex items-start gap-3">
                      {item.design?.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.design.thumbnailUrl}
                          alt={item.design.name || 'Custom design'}
                          className="w-12 h-12 rounded border border-border object-cover bg-white flex-shrink-0"
                        />
                      ) : item.design ? (
                        <div className="w-12 h-12 rounded border border-border bg-muted/20 flex items-center justify-center flex-shrink-0">
                          <span className="material-icons text-muted-foreground/40 text-base">brush</span>
                        </div>
                      ) : null}
                      <div className="min-w-0">
                        <p className="font-medium text-foreground">{item.productName}</p>
                        {item.variantName && <p className="text-xs text-muted-foreground">{item.variantName}</p>}
                        {item.design ? (
                          <p className="text-xs italic text-muted-foreground mt-0.5">
                            Custom design: {item.design.name || 'Untitled design'}
                          </p>
                        ) : item.designId ? (
                          <p className="text-xs italic text-muted-foreground/70 mt-0.5">
                            Design no longer available
                          </p>
                        ) : null}
                      </div>
                    </div>
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
          <div className="flex justify-between pt-2 border-t border-border">
            <span className="font-display font-extrabold tracking-[-0.02em] text-foreground">Total</span>
            <span className="font-display font-extrabold tracking-[-0.02em] text-foreground">{formatMoney(order.totalCents)}</span>
          </div>
        </div>
      </div>

      {/* Fulfillment */}
      <div className={`${pCard} p-6 space-y-4`}>
        <h2 className={`${pSectionTitle} flex items-center gap-2`}>
          <span className="material-icons text-lg text-muted-foreground">local_shipping</span>
          Fulfillment
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Tracking Number</label>
            <input value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} placeholder="Enter tracking number" className={pInput} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Tracking URL</label>
            <input value={trackingUrl} onChange={(e) => setTrackingUrl(e.target.value)} placeholder="https://..." className={pInput} />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={updateFulfillment}
            disabled={saving}
            className={pBtnGhost}
          >
            Save Tracking
          </button>
          {!studio && order.status !== 'shipped' && order.status !== 'delivered' && (
            <button
              onClick={markAsShipped}
              disabled={saving}
              className={pBtnPrimary}
            >
              <span className="material-icons text-base">local_shipping</span>
              Mark as Shipped
            </button>
          )}
        </div>
      </div>

      {/* Shipping Label */}
      <ShippingLabelCard
        order={order}
        labelError={labelError}
        rates={rates}
        parcelSummary={parcelSummary}
        selectedRateId={selectedRateId}
        setSelectedRateId={setSelectedRateId}
        ratesLoading={ratesLoading}
        labelBuying={labelBuying}
        labelRefunding={labelRefunding}
        computeRates={computeRates}
        buyLabel={buyLabel}
        refundLabel={refundLabel}
      />

      {/* Printful Fulfillment */}
      {fulfillmentProvider === 'printful' && (
        <div className={`${pCard} p-6 space-y-4`}>
          <h2 className={`${pSectionTitle} flex items-center gap-2`}>
            <span className="material-icons text-lg text-muted-foreground">print</span>
            Printful Fulfillment
          </h2>

          {printfulError && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
              <span className="material-icons text-base">error</span>
              {printfulError}
            </div>
          )}

          {order.printfulOrderId ? (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</p>
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mt-1 ${
                      printfulStatusColors[order.printfulFulfillmentStatus || ''] || 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {order.printfulFulfillmentStatus || 'unknown'}
                  </span>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Printful Order ID</p>
                  <p className="text-foreground font-mono text-xs mt-1">#{order.printfulOrderId}</p>
                </div>
                {order.printfulSubmittedAt && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Submitted At</p>
                    <p className="text-foreground mt-1">{new Date(order.printfulSubmittedAt).toLocaleString()}</p>
                  </div>
                )}
              </div>
              {order.printfulFulfillmentStatus === 'failed' && order.printfulFulfillmentError && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
                  <span className="material-icons text-base flex-shrink-0">error_outline</span>
                  <p>{order.printfulFulfillmentError}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Not yet submitted to Printful.</p>
              {order.paymentStatus === 'paid' && (
                <button
                  onClick={submitToPrintful}
                  disabled={printfulSubmitting}
                  className={pBtnPrimary}
                >
                  {printfulSubmitting ? (
                    <span className="material-icons text-base animate-spin">refresh</span>
                  ) : (
                    <span className="material-icons text-base">send</span>
                  )}
                  Submit to Printful
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Internal Notes */}
      <div className={`${pCard} p-6 space-y-4`}>
        <h2 className={`${pSectionTitle} flex items-center gap-2`}>
          <span className="material-icons text-lg text-muted-foreground">sticky_note_2</span>
          Internal Notes
        </h2>
        <textarea
          value={internalNotes}
          onChange={(e) => setInternalNotes(e.target.value)}
          rows={4}
          placeholder="Add private notes about this order..."
          className={pInput}
        />
        <button
          onClick={saveNotes}
          disabled={saving}
          className={pBtnGhost}
        >
          Save Notes
        </button>
      </div>

      {/* Status History Timeline */}
      <StatusTimeline statusHistory={order.statusHistory} />
    </div>
  );
}
