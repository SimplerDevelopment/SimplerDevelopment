'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pCard, pBtnPrimary, pBtnGhost, pInput, pSelect } from '@/components/portal/portal-ui';

export default function NewTicketPage() {
  const router = useRouter();
  const [form, setForm] = useState({ subject: '', category: 'general', priority: 'medium', body: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const res = await fetch('/api/portal/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });

    const data = await res.json();
    setLoading(false);

    if (!data.success) {
      setError(data.message ?? 'Failed to create ticket.');
    } else {
      router.push(`/portal/tickets/${data.data.id}`);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <PortalPageHeader
        eyebrow="Support"
        title="Open a Support Ticket"
        subtitle="We'll get back to you as soon as possible."
        actions={
          <Link href="/portal/tickets" className={pBtnGhost}>
            <span className="material-icons text-base">arrow_back</span>
            All Tickets
          </Link>
        }
      />

      <div className={`${pCard} p-6`}>
        {error && (
          <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-xl flex items-center gap-2 text-sm text-destructive">
            <span className="material-icons text-base">error_outline</span>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Subject <span className="text-destructive">*</span></label>
            <input
              type="text"
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              required
              placeholder="Briefly describe your issue"
              className={pInput}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className={pSelect}
              >
                <option value="general">General</option>
                <option value="billing">Billing</option>
                <option value="technical">Technical</option>
                <option value="domain">Domain</option>
                <option value="hosting">Hosting</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Priority</label>
              <select
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
                className={pSelect}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Description <span className="text-destructive">*</span></label>
            <textarea
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              required
              rows={6}
              placeholder="Provide as much detail as possible..."
              className={`${pInput} resize-y`}
            />
          </div>

          <div className="flex items-center justify-end gap-3">
            <Link href="/portal/tickets" className={pBtnGhost}>
              Cancel
            </Link>
            <button
              type="submit"
              disabled={loading}
              className={pBtnPrimary}
            >
              {loading ? (
                <><span className="material-icons text-base animate-spin">refresh</span>Submitting...</>
              ) : (
                <><span className="material-icons text-base">send</span>Submit Ticket</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
