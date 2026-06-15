'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatCents } from '@/lib/portal-utils';

interface Subscription {
  id: number;
  clientName: string;
  company: string | null;
  serviceName: string;
  serviceCategory: string;
  price: number;
  billingCycle: string;
  status: string;
  renewalDate: string | null;
  createdAt: string;
}

interface ServiceCatalogItem {
  id: number;
  name: string;
  category: string;
  price: number;
  billingCycle: string | null;
  stripePriceId: string | null;
  active: boolean;
}

interface InvoiceRow {
  id: number;
  number: string;
  status: string;
  total: number;
  paidAt: string | null;
  stripePaymentIntentId: string | null;
  createdAt: string;
}

type ActionKind = 'cancel' | 'change-plan' | 'refund';

const STATUS_TABS = ['all', 'active', 'pending', 'suspended', 'cancelled'] as const;

function statusColor(status: string) {
  switch (status) {
    case 'active': return 'bg-green-100 text-green-700';
    case 'pending': return 'bg-yellow-100 text-yellow-700';
    case 'suspended': return 'bg-orange-100 text-orange-700';
    case 'cancelled': return 'bg-gray-100 text-gray-600';
    default: return 'bg-gray-100 text-gray-600';
  }
}

function categoryColor(category: string) {
  switch (category) {
    case 'domain': return 'bg-blue-100 text-blue-700';
    case 'hosting': return 'bg-purple-100 text-purple-700';
    case 'development': return 'bg-indigo-100 text-indigo-700';
    case 'maintenance': return 'bg-teal-100 text-teal-700';
    default: return 'bg-gray-100 text-gray-600';
  }
}

export default function AdminSubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Per-row action state
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [activeAction, setActiveAction] = useState<{ kind: ActionKind; sub: Subscription } | null>(null);
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);

  // Change-plan dialog state
  const [services, setServices] = useState<ServiceCatalogItem[]>([]);
  const [newPriceId, setNewPriceId] = useState('');
  const [proration, setProration] = useState<'create_prorations' | 'none'>('create_prorations');

  // Refund dialog state
  const [invoiceList, setInvoiceList] = useState<InvoiceRow[]>([]);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(null);
  const [refundAmount, setRefundAmount] = useState(''); // dollars (UI), converted to cents
  const [refundReason, setRefundReason] = useState<'' | 'duplicate' | 'fraudulent' | 'requested_by_customer'>('');
  const [invoicesLoading, setInvoicesLoading] = useState(false);

  // Submit state
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch('/api/admin/portal/subscriptions')
      .then(r => r.json())
      .then(d => { setSubscriptions(d.data ?? []); setLoading(false); });
  }, []);

  // Auto-dismiss toast after 4s.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // Close action menu on outside click.
  useEffect(() => {
    if (openMenuId === null) return;
    const handler = () => setOpenMenuId(null);
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [openMenuId]);

  const openAction = useCallback(async (kind: ActionKind, sub: Subscription) => {
    setOpenMenuId(null);
    setActiveAction({ kind, sub });
    setNewPriceId('');
    setProration('create_prorations');
    setSelectedInvoiceId(null);
    setRefundAmount('');
    setRefundReason('');

    if (kind === 'change-plan' && services.length === 0) {
      const r = await fetch('/api/admin/portal/services').then(r => r.json());
      // Only plan tiers + the bundle are valid change-plan targets — never an
      // individual à-la-carte module (swapping one onto the plan line corrupts
      // the subscription; the API rejects it too).
      setServices((r.data ?? []).filter((s: ServiceCatalogItem) =>
        s.active && s.stripePriceId && (s.category.startsWith('plan-') || s.category === 'bundle'),
      ));
    }

    if (kind === 'refund') {
      setInvoicesLoading(true);
      const r = await fetch(`/api/admin/portal/subscriptions/${sub.id}/invoices`).then(r => r.json());
      setInvoiceList(r.data ?? []);
      setInvoicesLoading(false);
    }
  }, [services.length]);

  const closeAction = useCallback(() => {
    setActiveAction(null);
    setSubmitting(false);
  }, []);

  async function submitCancel() {
    if (!activeAction) return;
    if (!confirm(`Cancel the subscription for ${activeAction.sub.company ?? activeAction.sub.clientName}? It will end at the current period end (no immediate cut-off).`)) {
      return;
    }
    setSubmitting(true);
    const res = await fetch(`/api/admin/portal/subscriptions/${activeAction.sub.id}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ atPeriodEnd: true }),
    });
    const data = await res.json();
    if (data.success) {
      setToast({ kind: 'success', message: 'Cancellation scheduled. Stripe will sync the local state via webhook.' });
      closeAction();
    } else {
      setToast({ kind: 'error', message: data.message ?? 'Cancel failed' });
      setSubmitting(false);
    }
  }

  async function submitChangePlan() {
    if (!activeAction) return;
    if (!newPriceId) { setToast({ kind: 'error', message: 'Pick a target plan first.' }); return; }
    setSubmitting(true);
    const res = await fetch(`/api/admin/portal/subscriptions/${activeAction.sub.id}/change-plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newStripePriceId: newPriceId, proration }),
    });
    const data = await res.json();
    if (data.success) {
      setToast({ kind: 'success', message: 'Plan changed. Webhook will reconcile local state.' });
      closeAction();
    } else {
      setToast({ kind: 'error', message: data.message ?? 'Change plan failed' });
      setSubmitting(false);
    }
  }

  async function submitRefund() {
    if (!activeAction) return;
    if (!selectedInvoiceId) { setToast({ kind: 'error', message: 'Pick an invoice to refund.' }); return; }
    const inv = invoiceList.find(i => i.id === selectedInvoiceId);
    if (!inv) return;
    const dollarsStr = refundAmount.trim();
    let amountCents: number | undefined;
    if (dollarsStr) {
      const dollars = Number(dollarsStr);
      if (!Number.isFinite(dollars) || dollars <= 0) {
        setToast({ kind: 'error', message: 'Refund amount must be a positive number.' });
        return;
      }
      amountCents = Math.round(dollars * 100);
    }
    const human = amountCents ? `${formatCents(amountCents)} from invoice ${inv.number}` : `the full ${formatCents(inv.total)} of invoice ${inv.number}`;
    if (!confirm(`Refund ${human}? This is irreversible — Stripe will charge the refund immediately.`)) {
      return;
    }
    setSubmitting(true);
    const res = await fetch(`/api/admin/portal/subscriptions/${activeAction.sub.id}/refund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        invoiceId: selectedInvoiceId,
        amountCents,
        reason: refundReason || undefined,
      }),
    });
    const data = await res.json();
    if (data.success) {
      setToast({ kind: 'success', message: `Refund issued (status: ${data.data?.status ?? 'unknown'}).` });
      closeAction();
    } else {
      setToast({ kind: 'error', message: data.message ?? 'Refund failed' });
      setSubmitting(false);
    }
  }

  const filtered = statusFilter === 'all'
    ? subscriptions
    : subscriptions.filter(s => s.status === statusFilter);

  const activeCount = subscriptions.filter(s => s.status === 'active').length;
  const suspendedCount = subscriptions.filter(s => s.status === 'suspended').length;

  const mrr = subscriptions
    .filter(s => s.status === 'active' && s.billingCycle === 'monthly')
    .reduce((sum, s) => sum + s.price, 0);

  const annualRevenue = subscriptions
    .filter(s => s.status === 'active' && s.billingCycle === 'annually')
    .reduce((sum, s) => sum + s.price, 0);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Subscriptions</h1>
        <p className="text-muted-foreground mt-1">Manage client service subscriptions.</p>
      </div>

      {/* Summary */}
      <div className="grid sm:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-sm text-muted-foreground">Active Subscriptions</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{activeCount}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-sm text-muted-foreground">MRR</p>
          <p className="text-2xl font-bold text-foreground mt-1">{formatCents(mrr)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-sm text-muted-foreground">Annual Revenue</p>
          <p className="text-2xl font-bold text-foreground mt-1">{formatCents(annualRevenue)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-sm text-muted-foreground">Suspended</p>
          <p className="text-2xl font-bold text-orange-600 mt-1">{suspendedCount}</p>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 bg-muted/50 rounded-lg p-1 w-fit">
        {STATUS_TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setStatusFilter(tab)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${
              statusFilter === tab
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">
          <span className="material-icons animate-spin text-3xl">progress_activity</span>
          <p className="mt-2">Loading subscriptions...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <span className="material-icons text-5xl text-muted-foreground">subscriptions</span>
          <h3 className="mt-4 font-semibold text-foreground">No subscriptions found</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {statusFilter !== 'all' ? `No ${statusFilter} subscriptions.` : 'No client subscriptions yet.'}
          </p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-visible">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Client</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Service</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Category</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Price</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Billing</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Renewal</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(sub => (
                <tr key={sub.id} className="hover:bg-accent/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">{sub.company ?? sub.clientName}</td>
                  <td className="px-4 py-3 text-foreground">{sub.serviceName}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${categoryColor(sub.serviceCategory)}`}>
                      {sub.serviceCategory}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-foreground">{formatCents(sub.price)}</td>
                  <td className="px-4 py-3 text-muted-foreground capitalize">{sub.billingCycle}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${statusColor(sub.status)}`}>
                      {sub.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {sub.renewalDate ? new Date(sub.renewalDate).toLocaleDateString() : '--'}
                  </td>
                  <td className="px-4 py-3 relative">
                    <button
                      onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === sub.id ? null : sub.id); }}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md hover:bg-accent text-muted-foreground"
                      aria-label="Actions"
                    >
                      <span className="material-icons text-base">more_horiz</span>
                    </button>
                    {openMenuId === sub.id && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="absolute right-4 top-10 z-20 bg-card border border-border rounded-lg shadow-lg w-48 py-1"
                      >
                        <button
                          onClick={() => openAction('change-plan', sub)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2 text-foreground"
                        >
                          <span className="material-icons text-base">swap_horiz</span>
                          Change plan
                        </button>
                        <button
                          onClick={() => openAction('refund', sub)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2 text-foreground"
                        >
                          <span className="material-icons text-base">undo</span>
                          Refund
                        </button>
                        <button
                          onClick={() => openAction('cancel', sub)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2 text-red-600"
                          disabled={sub.status === 'cancelled'}
                        >
                          <span className="material-icons text-base">cancel</span>
                          Cancel
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Action dialog */}
      {activeAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-card border border-border rounded-xl w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div>
                <h2 className="font-semibold text-foreground">
                  {activeAction.kind === 'cancel' && 'Cancel subscription'}
                  {activeAction.kind === 'change-plan' && 'Change plan'}
                  {activeAction.kind === 'refund' && 'Issue refund'}
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {activeAction.sub.company ?? activeAction.sub.clientName} · {activeAction.sub.serviceName}
                </p>
              </div>
              <button
                onClick={closeAction}
                className="p-2 rounded-md hover:bg-accent text-muted-foreground"
                aria-label="Close"
                disabled={submitting}
              >
                <span className="material-icons text-base">close</span>
              </button>
            </div>

            <div className="p-4 space-y-4">
              {activeAction.kind === 'cancel' && (
                <div className="text-sm text-muted-foreground space-y-3">
                  <p>
                    This schedules the Stripe subscription to end at the current period end. The customer keeps access
                    until then. Local state will reconcile via the Stripe webhook.
                  </p>
                  <p className="text-xs">No immediate cut-off — submit to confirm.</p>
                </div>
              )}

              {activeAction.kind === 'change-plan' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Target plan</label>
                    <select
                      value={newPriceId}
                      onChange={e => setNewPriceId(e.target.value)}
                      className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm"
                    >
                      <option value="">— Pick a service from the catalog —</option>
                      {services.map(s => (
                        <option key={s.id} value={s.stripePriceId ?? ''}>
                          {s.name} ({formatCents(s.price)} / {s.billingCycle ?? 'once'})
                        </option>
                      ))}
                    </select>
                    {services.length === 0 && (
                      <p className="text-xs text-muted-foreground mt-1">Loading catalog…</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Proration</label>
                    <select
                      value={proration}
                      onChange={e => setProration(e.target.value as 'create_prorations' | 'none')}
                      className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm"
                    >
                      <option value="create_prorations">Prorate the change</option>
                      <option value="none">No proration</option>
                    </select>
                  </div>
                </>
              )}

              {activeAction.kind === 'refund' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Invoice</label>
                    {invoicesLoading ? (
                      <div className="text-xs text-muted-foreground">Loading invoices…</div>
                    ) : invoiceList.length === 0 ? (
                      <div className="text-xs text-muted-foreground">No invoices found for this client.</div>
                    ) : (
                      <select
                        value={selectedInvoiceId ?? ''}
                        onChange={e => setSelectedInvoiceId(e.target.value ? parseInt(e.target.value, 10) : null)}
                        className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm"
                      >
                        <option value="">— Pick an invoice —</option>
                        {invoiceList.map(inv => (
                          <option
                            key={inv.id}
                            value={inv.id}
                            disabled={!inv.stripePaymentIntentId}
                          >
                            {inv.number} · {formatCents(inv.total)} · {inv.status}
                            {!inv.stripePaymentIntentId ? ' (no payment intent)' : ''}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">
                      Amount (USD, optional)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Leave blank for full refund"
                      value={refundAmount}
                      onChange={e => setRefundAmount(e.target.value)}
                      className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Reason (optional)</label>
                    <select
                      value={refundReason}
                      onChange={e => setRefundReason(e.target.value as typeof refundReason)}
                      className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm"
                    >
                      <option value="">— Unspecified —</option>
                      <option value="duplicate">Duplicate charge</option>
                      <option value="fraudulent">Fraudulent</option>
                      <option value="requested_by_customer">Requested by customer</option>
                    </select>
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 p-4 border-t border-border">
              <button
                onClick={closeAction}
                className="px-4 py-2 text-sm rounded-md hover:bg-accent text-muted-foreground"
                disabled={submitting}
              >
                Close
              </button>
              {activeAction.kind === 'cancel' && (
                <button
                  onClick={submitCancel}
                  disabled={submitting}
                  className="px-4 py-2 text-sm rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {submitting ? 'Cancelling…' : 'Cancel at period end'}
                </button>
              )}
              {activeAction.kind === 'change-plan' && (
                <button
                  onClick={submitChangePlan}
                  disabled={submitting || !newPriceId}
                  className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {submitting ? 'Updating…' : 'Change plan'}
                </button>
              )}
              {activeAction.kind === 'refund' && (
                <button
                  onClick={submitRefund}
                  disabled={submitting || !selectedInvoiceId}
                  className="px-4 py-2 text-sm rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {submitting ? 'Refunding…' : 'Issue refund'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-[60] px-4 py-3 rounded-lg shadow-lg text-sm flex items-start gap-2 max-w-sm ${
            toast.kind === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
          }`}
        >
          <span className="material-icons text-base mt-0.5">
            {toast.kind === 'success' ? 'check_circle' : 'error'}
          </span>
          <div className="flex-1">{toast.message}</div>
          <button onClick={() => setToast(null)} aria-label="Dismiss" className="opacity-80 hover:opacity-100">
            <span className="material-icons text-base">close</span>
          </button>
        </div>
      )}
    </div>
  );
}
