'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { formatCents, invoiceStatusColor } from '@/lib/portal-utils';

interface Invoice {
  id: number;
  number: string;
  status: string;
  total: number;
  dueDate: string | null;
  paidAt: string | null;
  createdAt: string;
  company: string | null;
  clientName: string;
}

export default function AdminPortalInvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/portal/invoices')
      .then(r => r.json())
      .then(d => { setInvoices(d.data ?? []); setLoading(false); });
  }, []);

  const totalOutstanding = invoices.filter(i => i.status === 'sent' || i.status === 'overdue').reduce((s, i) => s + i.total, 0);
  const totalPaid = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.total, 0);

  async function updateStatus(id: number, status: string) {
    const res = await fetch(`/api/admin/portal/invoices/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    const data = await res.json();
    if (data.success) {
      setInvoices(prev => prev.map(i => i.id === id ? { ...i, status } : i));
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Invoices</h1>
          <p className="text-muted-foreground mt-1">Manage client billing and payments.</p>
        </div>
        <Link href="/admin/portal-invoices/new"
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
          <span className="material-icons text-base">add</span>New Invoice
        </Link>
      </div>

      {/* Summary */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-sm text-muted-foreground">Outstanding</p>
          <p className="text-2xl font-bold text-orange-600 mt-1">{formatCents(totalOutstanding)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-sm text-muted-foreground">Total Collected</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{formatCents(totalPaid)}</p>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : invoices.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <span className="material-icons text-5xl text-muted-foreground">receipt_long</span>
          <h3 className="mt-4 font-semibold text-foreground">No invoices yet</h3>
          <Link href="/admin/portal-invoices/new" className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium">
            Create First Invoice
          </Link>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Invoice</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Client</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Amount</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Due</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {invoices.map(inv => (
                <tr key={inv.id} className="hover:bg-accent/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">
                    <Link href={`/portal/invoices/${inv.id}`} className="hover:text-primary hover:underline">{inv.number}</Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{inv.company ?? inv.clientName}</td>
                  <td className="px-4 py-3 font-medium text-foreground">{formatCents(inv.total)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${invoiceStatusColor(inv.status)}`}>{inv.status}</span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : '—'}</td>
                  <td className="px-4 py-3">
                    <select
                      value={inv.status}
                      onChange={e => updateStatus(inv.id, e.target.value)}
                      className="text-xs px-2 py-1 rounded border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="draft">Draft</option>
                      <option value="sent">Sent</option>
                      <option value="paid">Paid</option>
                      <option value="overdue">Overdue</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
