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

const STATUS_TABS = ['all', 'draft', 'sent', 'paid', 'overdue', 'cancelled'] as const;

export default function AdminPortalInvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/admin/portal/invoices')
      .then(r => r.json())
      .then(d => { setInvoices(d.data ?? []); setLoading(false); });
  }, []);

  const filtered = invoices.filter(i => {
    if (statusFilter !== 'all' && i.status !== statusFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return i.number.toLowerCase().includes(s) ||
        (i.company || '').toLowerCase().includes(s) ||
        i.clientName.toLowerCase().includes(s);
    }
    return true;
  });

  const totalOutstanding = invoices.filter(i => i.status === 'sent' || i.status === 'overdue').reduce((s, i) => s + i.total, 0);
  const totalPaid = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.total, 0);
  const overdueCount = invoices.filter(i => i.status === 'overdue').length;
  const draftCount = invoices.filter(i => i.status === 'draft').length;

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
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Invoices</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Manage client billing and payments across the platform.</p>
        </div>
        <Link href="/admin/portal-invoices/new"
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
          <span className="material-icons text-base">add</span>New Invoice
        </Link>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="material-icons text-base text-orange-600">account_balance_wallet</span>
            <span className="text-xs text-muted-foreground font-medium">Outstanding</span>
          </div>
          <p className="text-2xl font-bold text-orange-600">{formatCents(totalOutstanding)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="material-icons text-base text-green-600">payments</span>
            <span className="text-xs text-muted-foreground font-medium">Total Collected</span>
          </div>
          <p className="text-2xl font-bold text-green-600">{formatCents(totalPaid)}</p>
        </div>
        <div className={`bg-card border rounded-xl p-4 ${overdueCount > 0 ? 'border-red-200' : 'border-border'}`}>
          <div className="flex items-center gap-2 mb-1">
            <span className={`material-icons text-base ${overdueCount > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>warning</span>
            <span className="text-xs text-muted-foreground font-medium">Overdue</span>
          </div>
          <p className={`text-2xl font-bold ${overdueCount > 0 ? 'text-red-600' : 'text-foreground'}`}>{overdueCount}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="material-icons text-base text-muted-foreground">edit_note</span>
            <span className="text-xs text-muted-foreground font-medium">Drafts</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{draftCount}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2 px-3 py-2 bg-card border border-border rounded-lg flex-1 max-w-sm">
          <span className="material-icons text-muted-foreground text-base">search</span>
          <input
            className="bg-transparent text-sm outline-none flex-1 text-foreground placeholder:text-muted-foreground"
            placeholder="Search invoices..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1">
          {STATUS_TABS.map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${
                statusFilter === s ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground hover:bg-accent'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <span className="material-icons animate-spin text-primary text-3xl">refresh</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <span className="material-icons text-5xl text-muted-foreground">receipt_long</span>
          <h3 className="mt-4 font-semibold text-foreground">No invoices found</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {search || statusFilter !== 'all' ? 'Try adjusting your filters.' : 'Create your first invoice.'}
          </p>
          {!search && statusFilter === 'all' && (
            <Link href="/admin/portal-invoices/new" className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium">
              Create First Invoice
            </Link>
          )}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Invoice</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Client</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Due</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Paid</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(inv => {
                  const isOverdue = inv.status === 'overdue' || (
                    inv.status === 'sent' && inv.dueDate && new Date(inv.dueDate) < new Date()
                  );
                  return (
                    <tr key={inv.id} className={`hover:bg-accent/50 transition-colors ${isOverdue ? 'bg-red-50/30' : ''}`}>
                      <td className="px-4 py-3">
                        <Link href={`/portal/invoices/${inv.id}`} className="font-medium text-foreground hover:text-primary hover:underline font-mono">
                          {inv.number}
                        </Link>
                        <p className="text-xs text-muted-foreground mt-0.5">{new Date(inv.createdAt).toLocaleDateString()}</p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{inv.company ?? inv.clientName}</td>
                      <td className="px-4 py-3 text-right font-mono font-medium text-foreground">{formatCents(inv.total)}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${invoiceStatusColor(inv.status)}`}>
                          {inv.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {inv.dueDate ? (
                          <span className={`text-xs ${isOverdue ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>
                            {new Date(inv.dueDate).toLocaleDateString()}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">--</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {inv.paidAt ? (
                          <span className="text-xs text-green-600">{new Date(inv.paidAt).toLocaleDateString()}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">--</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
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
                          <Link href={`/portal/invoices/${inv.id}`} className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
                            <span className="material-icons text-sm">open_in_new</span>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
