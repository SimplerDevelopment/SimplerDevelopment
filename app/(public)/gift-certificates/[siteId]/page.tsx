'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { BookingPaymentForm } from '@/components/blocks/render/BookingPaymentForm';

const PRESET_AMOUNTS = [2500, 5000, 7500, 10000, 15000, 20000]; // cents

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function GiftCertificatePurchasePage() {
  const { siteId } = useParams<{ siteId: string }>();

  const [amount, setAmount] = useState(5000);
  const [customAmount, setCustomAmount] = useState('');
  const [isCustom, setIsCustom] = useState(false);

  const [purchaserName, setPurchaserName] = useState('');
  const [purchaserEmail, setPurchaserEmail] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [message, setMessage] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [certCode, setCertCode] = useState<string | null>(null);
  const [purchased, setPurchased] = useState(false);

  const effectiveAmount = isCustom ? Math.round((parseFloat(customAmount) || 0) * 100) : amount;
  const accent = '#2563eb';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (effectiveAmount < 100 || !purchaserName.trim() || !purchaserEmail.trim()) return;

    setSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/public/gift-certificates/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          websiteId: parseInt(siteId, 10),
          amount: effectiveAmount,
          purchaserName: purchaserName.trim(),
          purchaserEmail: purchaserEmail.trim(),
          recipientName: recipientName.trim() || undefined,
          recipientEmail: recipientEmail.trim() || undefined,
          personalMessage: message.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setClientSecret(data.data.clientSecret);
        setCertCode(data.data.code);
      } else {
        setError(data.message || 'Failed to create gift certificate');
      }
    } catch {
      setError('Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  if (purchased) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 py-12 px-4">
        <div className="max-w-lg mx-auto">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-green-50 dark:bg-green-900/20 flex items-center justify-center mx-auto mb-4">
              <span className="material-icons text-3xl text-green-600">card_giftcard</span>
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">Gift Certificate Purchased!</h2>
            <p className="text-gray-500 text-sm mb-4">
              {recipientEmail
                ? `A gift certificate has been sent to ${recipientEmail}`
                : 'Your gift certificate is ready'}
            </p>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
              <p className="text-xs text-gray-400 mb-1">Certificate Code</p>
              <p className="text-2xl font-mono font-bold text-gray-900 dark:text-gray-100 tracking-wider">{certCode}</p>
              <p className="text-lg font-semibold mt-2" style={{ color: accent }}>{formatCents(effectiveAmount)}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 py-12 px-4">
      <div className="max-w-lg mx-auto">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center mx-auto mb-4">
            <span className="material-icons text-3xl text-blue-600">card_giftcard</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Gift Certificate</h1>
          <p className="text-gray-500 text-sm mt-1">Give the gift of an experience</p>
        </div>

        {clientSecret ? (
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 p-6">
            <div className="text-center mb-4">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Complete Payment</h2>
              <p className="text-sm text-gray-500 mt-1">
                {formatCents(effectiveAmount)} gift certificate
                {recipientName ? ` for ${recipientName}` : ''}
              </p>
            </div>
            <BookingPaymentForm
              clientSecret={clientSecret}
              total={effectiveAmount}
              accent={accent}
              btnBg={accent}
              btnText="#ffffff"
              btnRadius="12px"
              onSuccess={() => setPurchased(true)}
              onError={(msg) => setError(msg)}
            />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Amount selection */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 p-6">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Select Amount</h2>
              <div className="grid grid-cols-3 gap-2 mb-3">
                {PRESET_AMOUNTS.map(a => (
                  <button key={a} type="button"
                    onClick={() => { setAmount(a); setIsCustom(false); }}
                    className={`py-2.5 rounded-xl text-sm font-medium border transition-all ${
                      !isCustom && amount === a
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                        : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-300'
                    }`}>
                    {formatCents(a)}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setIsCustom(true)}
                  className={`text-sm ${isCustom ? 'text-blue-600 font-medium' : 'text-gray-500 hover:text-gray-700'}`}>
                  Custom:
                </button>
                <input type="number" step="0.01" min="1" value={customAmount}
                  onChange={e => { setCustomAmount(e.target.value); setIsCustom(true); }}
                  onFocus={() => setIsCustom(true)}
                  placeholder="Enter amount"
                  className="flex-1 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-gray-900 dark:text-gray-100" />
              </div>
            </div>

            {/* Your info */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 p-6 space-y-4">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Your Information</h2>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Your Name *</label>
                <input type="text" required value={purchaserName} onChange={e => setPurchaserName(e.target.value)}
                  className="w-full text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2.5 text-gray-900 dark:text-gray-100" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Your Email *</label>
                <input type="email" required value={purchaserEmail} onChange={e => setPurchaserEmail(e.target.value)}
                  className="w-full text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2.5 text-gray-900 dark:text-gray-100" />
              </div>
            </div>

            {/* Recipient */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 p-6 space-y-4">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Recipient (optional)</h2>
              <p className="text-xs text-gray-500">Leave blank to keep the certificate for yourself</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
                  <input type="text" value={recipientName} onChange={e => setRecipientName(e.target.value)}
                    className="w-full text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2.5 text-gray-900 dark:text-gray-100" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                  <input type="email" value={recipientEmail} onChange={e => setRecipientEmail(e.target.value)}
                    className="w-full text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2.5 text-gray-900 dark:text-gray-100" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Personal Message</label>
                <textarea value={message} onChange={e => setMessage(e.target.value)} rows={2}
                  placeholder="Enjoy this gift!"
                  className="w-full text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2.5 text-gray-900 dark:text-gray-100 resize-none" />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-sm">
                <span className="material-icons text-lg">error</span>
                {error}
              </div>
            )}

            <button type="submit" disabled={submitting || effectiveAmount < 100 || !purchaserName.trim() || !purchaserEmail.trim()}
              className="w-full py-3 rounded-xl font-medium text-white transition-all hover:shadow-md disabled:opacity-50"
              style={{ backgroundColor: accent }}>
              {submitting ? 'Processing...' : `Purchase ${formatCents(effectiveAmount)} Gift Certificate`}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
