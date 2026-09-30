// Data layer for the billing page, extracted so both the legacy body
// (BillingLegacy) and the unified body (BillingUnified, PUX-137) share the
// exact same fetch/format logic instead of duplicating it.

import { useEffect, useState } from 'react';

export interface Invoice {
  id: number;
  number: string;
  status: string;
  total: number;
  dueDate: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface PaymentMethod {
  id: number;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
}

export function useInvoices(): { invoices: Invoice[]; loading: boolean } {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/portal/settings/billing')
      .then(r => r.json())
      .then(res => { if (res.success) setInvoices(res.data.invoices); })
      .finally(() => setLoading(false));
  }, []);

  return { invoices, loading };
}

export function usePaymentMethods(): {
  methods: PaymentMethod[];
  loading: boolean;
  removingId: number | null;
  remove: (id: number) => Promise<void>;
} {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/portal/billing/payment-methods')
      .then(r => r.json())
      .then(res => { if (res.success) setMethods(res.data); })
      .finally(() => setLoading(false));
  }, []);

  const remove = async (id: number) => {
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

  return { methods, loading, removingId, remove };
}

/** Sum of invoice totals still owed — status 'sent' or 'overdue'. */
export function outstandingCents(invoices: Invoice[]): number {
  return invoices
    .filter(i => i.status === 'sent' || i.status === 'overdue')
    .reduce((sum, i) => sum + i.total, 0);
}

export function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
