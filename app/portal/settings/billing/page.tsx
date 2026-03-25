'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Invoice {
  id: number;
  number: string;
  status: string;
  total: number;
  dueDate: string | null;
  paidAt: string | null;
  createdAt: string;
}

interface ActiveService {
  id: number;
  serviceName: string;
  serviceCategory: string;
  servicePrice: number;
  billingCycle: string;
  status: string;
  renewalDate: string | null;
}

interface BillingData {
  invoices: Invoice[];
  services: ActiveService[];
  stripeCustomerId: string | null;
}

const statusStyles: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  sent: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  paid: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  overdue: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  cancelled: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500',
};

const serviceStatusStyles: Record<string, string> = {
  active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  suspended: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  cancelled: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500',
};

function formatCents(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function BillingSettingsPage() {
  const [data, setData] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/portal/settings/billing')
      .then(r => r.json())
      .then(res => { if (res.success) setData(res.data); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <span className="material-icons animate-spin text-primary text-2xl">refresh</span>
      </div>
    );
  }

  if (!data) {
    return <p className="text-sm text-muted-foreground">Unable to load billing information.</p>;
  }

  return (
    <div className="space-y-6">
      {/* Active services */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-foreground">Active Services</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Services managed by Simpler Development</p>
          </div>
          <Link
            href="/portal/services"
            className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
          >
            <span className="material-icons text-sm">add_circle</span>
            Add service
          </Link>
        </div>

        {data.services.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <span className="material-icons text-3xl text-muted-foreground/40">storefront</span>
            <p className="text-sm text-muted-foreground mt-2">No active services yet.</p>
            <Link href="/portal/services" className="mt-3 inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
              Browse services
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {data.services.map(s => (
              <li key={s.id} className="flex items-center gap-4 px-6 py-4">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="material-icons text-primary text-lg">
                    {s.serviceCategory === 'hosting' ? 'cloud' : s.serviceCategory === 'domain' ? 'language' : s.serviceCategory === 'email' ? 'email' : 'build'}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{s.serviceName}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatCents(s.servicePrice)} / {s.billingCycle}
                    {s.renewalDate && ` · renews ${formatDate(s.renewalDate)}`}
                  </p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${serviceStatusStyles[s.status] ?? serviceStatusStyles.active}`}>
                  {s.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Invoice history */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-foreground">Invoice History</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Your 10 most recent invoices</p>
          </div>
          <Link
            href="/portal/invoices"
            className="text-xs font-medium text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
          >
            View all
            <span className="material-icons text-sm">chevron_right</span>
          </Link>
        </div>

        {data.invoices.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <span className="material-icons text-3xl text-muted-foreground/40">receipt_long</span>
            <p className="text-sm text-muted-foreground mt-2">No invoices yet.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {data.invoices.map(inv => (
              <li key={inv.id} className="flex items-center gap-4 px-6 py-3.5">
                <span className="material-icons text-muted-foreground text-xl">receipt_long</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{inv.number}</p>
                  <p className="text-xs text-muted-foreground">
                    {inv.status === 'paid' ? `Paid ${formatDate(inv.paidAt)}` : `Due ${formatDate(inv.dueDate)}`}
                  </p>
                </div>
                <p className="text-sm font-semibold text-foreground">{formatCents(inv.total)}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${statusStyles[inv.status] ?? statusStyles.draft}`}>
                  {inv.status}
                </span>
                {(inv.status === 'sent' || inv.status === 'overdue') && (
                  <Link
                    href={`/portal/invoices/${inv.id}`}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Pay
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
