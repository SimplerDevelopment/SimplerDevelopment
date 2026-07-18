'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pBtnPrimary, pBtnGhost, pInput } from '@/components/portal/portal-ui';

interface LineItem {
  name: string;
  quantity: number;
  unitPrice: number;
}

export default function NewQuotePage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [lineItems, setLineItems] = useState<LineItem[]>([{ name: '', quantity: 1, unitPrice: 0 }]);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const totalCents = lineItems.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);

  function addLineItem() {
    setLineItems([...lineItems, { name: '', quantity: 1, unitPrice: 0 }]);
  }

  function updateLineItem(index: number, field: keyof LineItem, value: string | number) {
    const updated = [...lineItems];
    if (field === 'name') updated[index].name = value as string;
    else if (field === 'quantity') updated[index].quantity = Math.max(1, parseInt(String(value)) || 1);
    else if (field === 'unitPrice') updated[index].unitPrice = Math.max(0, Math.round(parseFloat(String(value)) * 100) || 0);
    setLineItems(updated);
  }

  function removeLineItem(index: number) {
    if (lineItems.length <= 1) return;
    setLineItems(lineItems.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !customerName.trim() || !customerEmail.trim() || totalCents <= 0) return;

    setSaving(true);
    setError('');

    try {
      const res = await fetch('/api/portal/tools/booking/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          customerName: customerName.trim(),
          customerEmail: customerEmail.trim(),
          customerPhone: customerPhone.trim() || undefined,
          price: totalCents,
          lineItems: lineItems.filter(li => li.name.trim() && li.unitPrice > 0),
          startTime: startTime || undefined,
          endTime: endTime || undefined,
          expiresAt: expiresAt || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        router.push('/portal/tools/booking/quotes');
      } else {
        setError(data.message || 'Failed to create quote');
      }
    } catch {
      setError('Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <PortalPageHeader
        eyebrow="Booking"
        title="New Quote"
        actions={
          <Link href="/portal/tools/booking/quotes" className={pBtnGhost}>
            <span className="material-icons text-base">close</span>
            Cancel
          </Link>
        }
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-sm">
            <span className="material-icons text-lg">error</span>
            {error}
          </div>
        )}

        {/* Quote details */}
        <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-display font-extrabold tracking-[-0.01em] text-foreground">Quote Details</h2>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Title *</label>
            <input type="text" required value={title} onChange={e => setTitle(e.target.value)}
              placeholder="Private Tour Package" className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/15" />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
              placeholder="Custom guided tour for corporate team..." className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/15 resize-none" />
          </div>
        </div>

        {/* Customer */}
        <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-display font-extrabold tracking-[-0.01em] text-foreground">Customer</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Name *</label>
              <input type="text" required value={customerName} onChange={e => setCustomerName(e.target.value)}
                className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/15" />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Email *</label>
              <input type="email" required value={customerEmail} onChange={e => setCustomerEmail(e.target.value)}
                className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/15" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Phone</label>
            <input type="tel" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)}
              className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/15" />
          </div>
        </div>

        {/* Line items */}
        <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-display font-extrabold tracking-[-0.01em] text-foreground">Line Items</h2>
            <button type="button" onClick={addLineItem}
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
              <span className="material-icons text-sm">add</span> Add item
            </button>
          </div>
          {lineItems.map((item, i) => (
            <div key={i} className="flex items-end gap-3">
              <div className="flex-1">
                {i === 0 && <label className="block text-xs text-muted-foreground mb-1">Item</label>}
                <input type="text" value={item.name} onChange={e => updateLineItem(i, 'name', e.target.value)}
                  placeholder="Tour name" className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/15" />
              </div>
              <div className="w-20">
                {i === 0 && <label className="block text-xs text-muted-foreground mb-1">Qty</label>}
                <input type="number" min="1" value={item.quantity} onChange={e => updateLineItem(i, 'quantity', e.target.value)}
                  className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/15" />
              </div>
              <div className="w-28">
                {i === 0 && <label className="block text-xs text-muted-foreground mb-1">Price ($)</label>}
                <input type="number" min="0" step="0.01" value={(item.unitPrice / 100).toFixed(2)}
                  onChange={e => updateLineItem(i, 'unitPrice', e.target.value)}
                  className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/15" />
              </div>
              <button type="button" onClick={() => removeLineItem(i)} disabled={lineItems.length <= 1}
                className="p-2 text-muted-foreground hover:text-red-500 disabled:opacity-30">
                <span className="material-icons text-base">delete</span>
              </button>
            </div>
          ))}
          <div className="flex justify-end pt-2 border-t border-border">
            <p className="text-lg font-display font-extrabold tracking-[-0.02em] text-foreground">
              Total: ${(totalCents / 100).toFixed(2)}
            </p>
          </div>
        </div>

        {/* Optional scheduling */}
        <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-display font-extrabold tracking-[-0.01em] text-foreground">Scheduling (optional)</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Start</label>
              <input type="datetime-local" value={startTime} onChange={e => setStartTime(e.target.value)}
                className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/15" />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">End</label>
              <input type="datetime-local" value={endTime} onChange={e => setEndTime(e.target.value)}
                className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/15" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Quote expires on</label>
            <input type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)}
              className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/15" />
          </div>
        </div>

        <button type="submit" disabled={saving || !title.trim() || !customerName.trim() || !customerEmail.trim() || totalCents <= 0}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-sm font-bold text-background transition hover:-translate-y-px hover:shadow-lg hover:shadow-foreground/20 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 w-full">
          {saving ? 'Creating...' : 'Create Quote & Generate Payment Link'}
        </button>
      </form>
    </div>
  );
}
