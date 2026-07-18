'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatCents } from '@/lib/portal-utils';

interface Client { id: number; company: string | null; userName: string; }
interface LineItem { description: string; quantity: number; unitPrice: number; }

export default function NewInvoicePage() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [form, setForm] = useState({ clientId: '', dueDate: '', notes: '', status: 'sent', tax: '0' });
  const [items, setItems] = useState<LineItem[]>([{ description: '', quantity: 1, unitPrice: 0 }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/admin/portal/clients').then(r => r.json()).then(d => setClients(d.data ?? []));
  }, []);

  const subtotal = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  // tax is entered in dollars (matching the line-item price inputs); convert to cents for the API.
  const taxDollars = parseFloat(form.tax) || 0;
  const tax = Math.round(taxDollars * 100);
  const total = subtotal + tax;

  function addItem() {
    setItems(prev => [...prev, { description: '', quantity: 1, unitPrice: 0 }]);
  }

  function removeItem(index: number) {
    setItems(prev => prev.filter((_, i) => i !== index));
  }

  function updateItem(index: number, field: keyof LineItem, value: string | number) {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');

    const res = await fetch('/api/admin/portal/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: parseInt(form.clientId, 10),
        dueDate: form.dueDate || null,
        notes: form.notes || null,
        status: form.status,
        tax,
        items: items.map(i => ({ ...i, unitPrice: Math.round(i.unitPrice * 100) })),
      }),
    });

    const data = await res.json();
    setSaving(false);

    if (!data.success) {
      setError(data.message ?? 'Failed to create invoice');
    } else {
      router.push('/admin/portal-invoices');
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <Link href="/admin/portal-invoices" className="hover:text-foreground">Invoices</Link>
          <span className="material-icons text-sm">chevron_right</span>
          <span className="text-foreground">New Invoice</span>
        </div>
        <h1 className="text-2xl font-bold text-foreground">Create Invoice</h1>
      </div>

      <div className="bg-card border border-border rounded-xl p-6">
        {error && (
          <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Client + meta */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Client <span className="text-destructive">*</span></label>
              <select required value={form.clientId} onChange={e => setForm({ ...form, clientId: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="">Select client...</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.company ?? c.userName}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Status</label>
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="draft">Draft</option>
                <option value="sent">Send to Client</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Due Date</label>
              <input type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Tax ($)</label>
              <input type="number" min="0" step="0.01" placeholder="0.00" value={form.tax} onChange={e => setForm({ ...form, tax: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              <p className="text-xs text-muted-foreground mt-0.5">Enter in dollars (e.g. 5.00 = $5.00)</p>
            </div>
          </div>

          {/* Line items */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground">Line Items</h3>
              <button type="button" onClick={addItem}
                className="flex items-center gap-1 text-xs text-primary hover:underline">
                <span className="material-icons text-sm">add</span>Add Item
              </button>
            </div>
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_80px_110px_36px] gap-2 items-center">
                  <input type="text" required placeholder="Description" value={item.description}
                    onChange={e => updateItem(idx, 'description', e.target.value)}
                    className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  <input type="number" min="1" placeholder="Qty" value={item.quantity}
                    onChange={e => updateItem(idx, 'quantity', parseInt(e.target.value, 10) || 1)}
                    className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  <input type="number" min="0" step="0.01" placeholder="Price ($)" value={item.unitPrice}
                    onChange={e => updateItem(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                    className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  <button type="button" onClick={() => removeItem(idx)} disabled={items.length === 1}
                    className="flex items-center justify-center text-muted-foreground hover:text-destructive disabled:opacity-30 transition-colors">
                    <span className="material-icons text-base">remove_circle_outline</span>
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Notes</label>
            <textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
          </div>

          {/* Totals */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-1 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span><span>{formatCents(Math.round(subtotal * 100))}</span>
            </div>
            {tax > 0 && <div className="flex justify-between text-muted-foreground"><span>Tax</span><span>{formatCents(tax)}</span></div>}
            <div className="flex justify-between font-bold text-foreground pt-1 border-t border-border mt-1">
              <span>Total</span><span>{formatCents(Math.round(subtotal * 100) + tax)}</span>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Link href="/admin/portal-invoices" className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Cancel</Link>
            <button type="submit" disabled={saving}
              className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
              {saving ? <><span className="material-icons text-base animate-spin">refresh</span>Creating...</> : 'Create Invoice'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
