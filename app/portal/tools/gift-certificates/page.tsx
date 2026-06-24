'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pBtnPrimary, pBtnGhost, pCard, pInput } from '@/components/portal/portal-ui';

interface GiftCert {
  id: number;
  code: string;
  initialAmount: number;
  remainingAmount: number;
  status: string;
  purchaserName: string;
  purchaserEmail: string;
  recipientName: string | null;
  recipientEmail: string | null;
  redeemableAt: string;
  createdAt: string;
}

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

const STATUS_STYLES: Record<string, string> = {
  pending_payment: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  active: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  fully_redeemed: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  expired: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

export default function GiftCertificatesPage() {
  const [certs, setCerts] = useState<GiftCert[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  // Create form
  const [amount, setAmount] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [message, setMessage] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchCerts();
  }, []);

  function fetchCerts() {
    setLoading(true);
    fetch('/api/portal/tools/gift-certificates')
      .then(r => r.json())
      .then(json => { if (json.success) setCerts(json.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const cents = Math.round(parseFloat(amount) * 100);
    if (!cents || cents < 100) return;

    setCreating(true);
    try {
      const res = await fetch('/api/portal/tools/gift-certificates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: cents,
          recipientName: recipientName.trim() || undefined,
          recipientEmail: recipientEmail.trim() || undefined,
          personalMessage: message.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowCreate(false);
        setAmount('');
        setRecipientName('');
        setRecipientEmail('');
        setMessage('');
        fetchCerts();
      }
    } catch { /* ignore */ }
    finally { setCreating(false); }
  }

  const totalActive = certs.filter(c => c.status === 'active').reduce((sum, c) => sum + c.remainingAmount, 0);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Link href="/portal/tools/booking" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <span className="material-icons text-lg">arrow_back</span>
        Back
      </Link>
      <PortalPageHeader
        eyebrow="Gift Cards"
        title="Gift Certificates"
        subtitle="Manage gift certificates redeemable for bookings and store purchases"
        actions={
          <button onClick={() => setShowCreate(!showCreate)} className={showCreate ? pBtnGhost : pBtnPrimary}>
            <span className="material-icons text-base">{showCreate ? 'close' : 'add'}</span>
            {showCreate ? 'Cancel' : 'Create Gift Cert'}
          </button>
        }
      />

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-2xl p-4 text-center">
          <p className="text-2xl font-display font-extrabold tracking-[-0.02em] text-foreground">{certs.length}</p>
          <p className="text-xs text-muted-foreground">Total Issued</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4 text-center">
          <p className="text-2xl font-display font-extrabold tracking-[-0.02em] text-foreground">{certs.filter(c => c.status === 'active').length}</p>
          <p className="text-xs text-muted-foreground">Active</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4 text-center">
          <p className="text-2xl font-display font-extrabold tracking-[-0.02em] text-foreground">{formatCents(totalActive)}</p>
          <p className="text-xs text-muted-foreground">Outstanding Balance</p>
        </div>
      </div>

      {/* Create form */}
      {showCreate && (
        <form onSubmit={handleCreate} className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-display font-extrabold tracking-[-0.01em] text-foreground">Create Gift Certificate (Admin)</h2>
          <p className="text-xs text-muted-foreground">This creates an immediately active certificate - no payment required.</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Amount ($) *</label>
              <input type="number" step="0.01" min="1" required value={amount} onChange={e => setAmount(e.target.value)}
                placeholder="50.00" className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/15" />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Recipient Name</label>
              <input type="text" value={recipientName} onChange={e => setRecipientName(e.target.value)}
                className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/15" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Recipient Email</label>
            <input type="email" value={recipientEmail} onChange={e => setRecipientEmail(e.target.value)}
              className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/15" />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Personal Message</label>
            <textarea value={message} onChange={e => setMessage(e.target.value)} rows={2}
              className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/15 resize-none" />
          </div>
          <button type="submit" disabled={creating || !amount}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-sm font-bold text-background transition hover:-translate-y-px hover:shadow-lg hover:shadow-foreground/20 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0">
            {creating ? 'Creating...' : 'Create Certificate'}
          </button>
        </form>
      )}

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-muted-foreground/20 border-t-primary" />
        </div>
      ) : certs.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-12 text-center">
          <span className="material-icons text-4xl text-muted-foreground mb-3 block">card_giftcard</span>
          <h2 className="text-lg font-semibold text-foreground mb-1">No gift certificates yet</h2>
          <p className="text-sm text-muted-foreground">Create one above or customers can purchase them on your site</p>
        </div>
      ) : (
        <div className={`${pCard} overflow-hidden`}>
          <div className="divide-y divide-border">
            {certs.map(cert => (
              <div key={cert.id} className="flex items-center gap-4 px-4 py-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <span className="material-icons text-primary">card_giftcard</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-mono font-semibold text-foreground">{cert.code}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {cert.purchaserName}
                    {cert.recipientName ? ` → ${cert.recipientName}` : ''}
                    {' '}&middot; {cert.redeemableAt === 'both' ? 'Booking + Store' : cert.redeemableAt === 'booking' ? 'Booking only' : 'Store only'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-foreground">{formatCents(cert.remainingAmount)}</p>
                  {cert.remainingAmount < cert.initialAmount && (
                    <p className="text-xs text-muted-foreground">of {formatCents(cert.initialAmount)}</p>
                  )}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${STATUS_STYLES[cert.status] || STATUS_STYLES.active}`}>
                  {cert.status.replace('_', ' ')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
