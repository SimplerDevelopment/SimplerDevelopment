'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Invoice {
  id: number;
  number: string;
  status: string;
  total: number;
  dueDate: string | null;
  paidAt: string | null;
  createdAt: string;
}

interface PaymentMethod {
  id: number;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCents(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const invoiceStatusStyles: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  sent: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  paid: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  overdue: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  cancelled: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500',
};

const brandIcons: Record<string, string> = {
  visa: 'credit_card',
  mastercard: 'credit_card',
  amex: 'credit_card',
  discover: 'credit_card',
};

// ── Component ─────────────────────────────────────────────────────────────────

type Tab = 'invoices' | 'payment-methods';

export default function BillingPage() {
  const [tab, setTab] = useState<Tab>('invoices');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(true);
  const [loadingMethods, setLoadingMethods] = useState(true);
  const [removingId, setRemovingId] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/portal/settings/billing')
      .then(r => r.json())
      .then(res => { if (res.success) setInvoices(res.data.invoices); })
      .finally(() => setLoadingInvoices(false));

    fetch('/api/portal/billing/payment-methods')
      .then(r => r.json())
      .then(res => { if (res.success) setMethods(res.data); })
      .finally(() => setLoadingMethods(false));
  }, []);

  const totalDue = invoices
    .filter(i => i.status === 'sent' || i.status === 'overdue')
    .reduce((sum, i) => sum + i.total, 0);

  const handleRemoveMethod = async (id: number) => {
    if (!confirm('Remove this payment method?')) return;
    setRemovingId(id);
    try {
      const res = await fetch('/api/portal/billing/payment-methods', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (data.success) setMethods(prev => prev.filter(m => m.id !== id));
    } finally {
      setRemovingId(null);
    }
  };

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'invoices', label: 'Invoices', icon: 'receipt_long' },
    { key: 'payment-methods', label: 'Payment Methods', icon: 'credit_card' },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Billing</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage invoices and payment methods.</p>
      </div>

      {/* Outstanding balance banner */}
      {totalDue > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-center gap-3 dark:bg-orange-900/20 dark:border-orange-800">
          <span className="material-icons text-orange-600">payments</span>
          <div>
            <p className="text-sm font-semibold text-orange-800 dark:text-orange-300">Outstanding balance: {formatCents(totalDue)}</p>
            <p className="text-xs text-orange-600 dark:text-orange-400">Click an invoice below to pay securely via Stripe.</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            }`}
          >
            <span className="material-icons text-base">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'invoices' && (
        <InvoicesTab invoices={invoices} loading={loadingInvoices} />
      )}
      {tab === 'payment-methods' && (
        <PaymentMethodsTab
          methods={methods}
          loading={loadingMethods}
          removingId={removingId}
          onRemove={handleRemoveMethod}
        />
      )}
    </div>
  );
}

// ── Invoices Tab ──────────────────────────────────────────────────────────────

function InvoicesTab({ invoices, loading }: { invoices: Invoice[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <span className="material-icons animate-spin text-primary text-2xl">refresh</span>
      </div>
    );
  }

  if (invoices.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-12 text-center">
        <span className="material-icons text-5xl text-muted-foreground/40">receipt_long</span>
        <h3 className="mt-4 font-semibold text-foreground">No invoices yet</h3>
        <p className="mt-2 text-sm text-muted-foreground">Invoices will appear here when created.</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 border-b border-border">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Invoice</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Amount</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Date</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {invoices.map((inv) => (
            <tr key={inv.id} className="hover:bg-accent/50 transition-colors">
              <td className="px-4 py-3">
                <Link href={`/portal/invoices/${inv.id}`} className="font-medium text-foreground hover:text-primary hover:underline">
                  {inv.number}
                </Link>
              </td>
              <td className="px-4 py-3 font-medium text-foreground">{formatCents(inv.total)}</td>
              <td className="px-4 py-3">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${invoiceStatusStyles[inv.status] ?? invoiceStatusStyles.draft}`}>
                  {inv.status}
                </span>
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {inv.status === 'paid' ? formatDate(inv.paidAt) : formatDate(inv.dueDate)}
              </td>
              <td className="px-4 py-3">
                {(inv.status === 'sent' || inv.status === 'overdue') && (
                  <Link
                    href={`/portal/invoices/${inv.id}`}
                    className="flex items-center gap-1 text-xs px-3 py-1 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors w-fit"
                  >
                    <span className="material-icons text-xs">credit_card</span>
                    Pay Now
                  </Link>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Payment Methods Tab ───────────────────────────────────────────────────────

function PaymentMethodsTab({
  methods,
  loading,
  removingId,
  onRemove,
}: {
  methods: PaymentMethod[];
  loading: boolean;
  removingId: number | null;
  onRemove: (id: number) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <span className="material-icons animate-spin text-primary text-2xl">refresh</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {methods.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <span className="material-icons text-5xl text-muted-foreground/40">credit_card_off</span>
          <h3 className="mt-4 font-semibold text-foreground">No payment methods</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Payment methods are saved automatically when you pay an invoice via Stripe.
          </p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-base font-semibold text-foreground">Saved Cards</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{methods.length} card{methods.length !== 1 ? 's' : ''} on file</p>
          </div>
          <ul className="divide-y divide-border">
            {methods.map(m => (
              <li key={m.id} className="flex items-center gap-4 px-6 py-4">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="material-icons text-primary text-lg">
                    {brandIcons[m.brand] ?? 'credit_card'}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground capitalize">
                    {m.brand} ending in {m.last4}
                    {m.isDefault && (
                      <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">Default</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Expires {String(m.expMonth).padStart(2, '0')}/{m.expYear}
                  </p>
                </div>
                <button
                  onClick={() => onRemove(m.id)}
                  disabled={removingId === m.id}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-40"
                  title="Remove card"
                >
                  {removingId === m.id
                    ? <span className="material-icons text-base animate-spin">refresh</span>
                    : <span className="material-icons text-base">delete</span>
                  }
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
