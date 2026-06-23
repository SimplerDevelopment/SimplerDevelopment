'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { formatMoney } from '@/lib/utils/money';

interface Discount {
  id: number;
  code: string;
  type: string;
  amount: number;
  minOrderCents?: number | null;
  maxUses?: number | null;
  usedCount: number;
  active: boolean;
  startsAt?: string | null;
  expiresAt?: string | null;
}

interface DiscountForm {
  code: string;
  type: string;
  amount: number;
  minOrderCents: number;
  maxUses: string;
  active: boolean;
  startsAt: string;
  expiresAt: string;
}

function centsToDollars(cents: number) {
  return cents ? (cents / 100).toFixed(2) : '';
}

function dollarsToCents(dollars: string) {
  const num = parseFloat(dollars);
  return isNaN(num) ? 0 : Math.round(num * 100);
}

const defaultForm: DiscountForm = {
  code: '',
  type: 'percent',
  amount: 0,
  minOrderCents: 0,
  maxUses: '',
  active: true,
  startsAt: '',
  expiresAt: '',
};

export default function DiscountsPage() {
  const { siteId } = useParams<{ siteId: string }>();
  const base = `/api/portal/websites/${siteId}/store/discounts`;

  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Discount | null>(null);
  const [form, setForm] = useState<DiscountForm>({ ...defaultForm });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(base);
      const data = await res.json();
      if (data.success) setDiscounts(data.data || []);
    } catch {
      // fail silently
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() is reused by save/toggle handlers; setLoading(true) is intentional and does not cascade
    load();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...defaultForm });
    setShowModal(true);
    setError('');
  };

  const openEdit = (d: Discount) => {
    setEditing(d);
    setForm({
      code: d.code,
      type: d.type,
      amount: d.amount,
      minOrderCents: d.minOrderCents || 0,
      maxUses: d.maxUses != null ? String(d.maxUses) : '',
      active: d.active,
      startsAt: d.startsAt ? d.startsAt.slice(0, 10) : '',
      expiresAt: d.expiresAt ? d.expiresAt.slice(0, 10) : '',
    });
    setShowModal(true);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const payload = {
        code: form.code.toUpperCase(),
        type: form.type,
        amount: form.amount,
        minOrderCents: form.minOrderCents || null,
        maxUses: form.maxUses ? parseInt(form.maxUses) : null,
        active: form.active,
        startsAt: form.startsAt || null,
        expiresAt: form.expiresAt || null,
      };
      const url = editing ? `${base}/${editing.id}` : base;
      const method = editing ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        setShowModal(false);
        setEditing(null);
        setSuccess(editing ? 'Discount updated.' : 'Discount created.');
        load();
      } else {
        setError(data.message || 'Failed to save discount.');
      }
    } catch {
      setError('Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this discount code? This cannot be undone.')) return;
    try {
      await fetch(`${base}/${id}`, { method: 'DELETE' });
      setSuccess('Discount deleted.');
      load();
    } catch {
      setError('Failed to delete.');
    }
  };

  const inputClass =
    'w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <span className="material-icons animate-spin text-primary text-2xl">refresh</span>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Discount Codes</h1>
          <p className="text-muted-foreground text-sm mt-1">Create and manage discount codes for your store.</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <span className="material-icons text-base">add</span>
          Add Discount
        </button>
      </div>

      {/* Messages */}
      {error && !showModal && (
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

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowModal(false)}>
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <h2 className="font-semibold text-foreground">{editing ? 'Edit Discount' : 'New Discount'}</h2>
              <button onClick={() => setShowModal(false)} className="p-1 text-muted-foreground hover:text-foreground transition-colors">
                <span className="material-icons text-lg">close</span>
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Code</label>
                <input
                  value={form.code}
                  onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
                  required
                  placeholder="SAVE20"
                  className={`${inputClass} uppercase font-mono`}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Type</label>
                  <select value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))} className={inputClass}>
                    <option value="percent">Percentage</option>
                    <option value="fixed">Fixed Amount ($)</option>
                    <option value="free_shipping">Free Shipping</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">
                    {form.type === 'percent' ? 'Discount (%)' : form.type === 'fixed' ? 'Amount ($)' : 'Amount'}
                  </label>
                  <input
                    type="number"
                    step={form.type === 'percent' ? '1' : '0.01'}
                    min="0"
                    max={form.type === 'percent' ? '100' : undefined}
                    value={form.amount}
                    onChange={(e) => setForm((p) => ({ ...p, amount: parseFloat(e.target.value) || 0 }))}
                    disabled={form.type === 'free_shipping'}
                    className={inputClass}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Min Order ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={centsToDollars(form.minOrderCents)}
                    onChange={(e) => setForm((p) => ({ ...p, minOrderCents: dollarsToCents(e.target.value) }))}
                    placeholder="No minimum"
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Max Uses</label>
                  <input
                    type="number"
                    min="0"
                    value={form.maxUses}
                    onChange={(e) => setForm((p) => ({ ...p, maxUses: e.target.value }))}
                    placeholder="Unlimited"
                    className={inputClass}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Start Date</label>
                  <input
                    type="date"
                    value={form.startsAt}
                    onChange={(e) => setForm((p) => ({ ...p, startsAt: e.target.value }))}
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">End Date</label>
                  <input
                    type="date"
                    value={form.expiresAt}
                    onChange={(e) => setForm((p) => ({ ...p, expiresAt: e.target.value }))}
                    className={inputClass}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Active</label>
                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setForm((p) => ({ ...p, active: !p.active }))}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      form.active ? 'bg-primary' : 'bg-border'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        form.active ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                  <span className="text-sm text-muted-foreground">{form.active ? 'Active' : 'Inactive'}</span>
                </div>
              </div>

              {error && showModal && (
                <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1.5">
                  <span className="material-icons text-base">error</span>
                  {error}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm font-medium text-foreground bg-card border border-border rounded-lg hover:bg-accent transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {saving && <span className="material-icons text-base animate-spin">refresh</span>}
                  {editing ? 'Update' : 'Create'} Discount
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Discounts Table */}
      {discounts.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-10 flex flex-col items-center text-center">
          <span className="material-icons text-4xl text-muted-foreground/40 mb-2">sell</span>
          <h2 className="font-semibold text-foreground mb-1">No discount codes</h2>
          <p className="text-sm text-muted-foreground">Create your first discount code to offer promotions.</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Code</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Type</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Amount</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Min Order</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Uses</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Dates</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {discounts.map((d) => (
                  <tr key={d.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-mono font-medium text-foreground">{d.code}</td>
                    <td className="px-4 py-3 text-muted-foreground capitalize">{d.type === 'free_shipping' ? 'Free Ship' : d.type}</td>
                    <td className="px-4 py-3 text-foreground">
                      {d.type === 'percent'
                        ? `${d.amount}%`
                        : d.type === 'fixed'
                        ? `$${d.amount.toFixed(2)}`
                        : '--'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{d.minOrderCents ? formatMoney(d.minOrderCents) : '--'}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {d.usedCount}
                      {d.maxUses != null ? `/${d.maxUses}` : ''}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          d.active
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                        }`}
                      >
                        {d.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {d.startsAt ? new Date(d.startsAt).toLocaleDateString() : '--'}
                      {' - '}
                      {d.expiresAt ? new Date(d.expiresAt).toLocaleDateString() : '--'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEdit(d)}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                        >
                          <span className="material-icons text-base">edit</span>
                        </button>
                        <button
                          onClick={() => handleDelete(d.id)}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        >
                          <span className="material-icons text-base">delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
