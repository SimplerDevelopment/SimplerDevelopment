'use client';

import { useState, useEffect } from 'react';
import { BookingPaymentForm } from '@/components/blocks/render/BookingPaymentForm';

interface QuoteData {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  price: number;
  customerName: string;
  lineItems: { name: string; quantity: number; unitPrice: number }[];
  startTime: string | null;
  endTime: string | null;
  status: string;
  alreadyPaid?: boolean;
}

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function QuotePaymentPage({ params }: { params: Promise<{ slug: string }> }) {
  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState(false);

  useEffect(() => {
    params.then(({ slug }) => {
      fetch(`/api/public/booking/quote/${slug}`)
        .then(r => r.json())
        .then(data => {
          if (data.success) {
            setQuote(data.data);
            if (data.data.alreadyPaid) setPaid(true);
          } else {
            setError(data.message || 'Quote not found');
          }
        })
        .catch(() => setError('Failed to load quote'))
        .finally(() => setLoading(false));
    });
  }, [params]);

  async function handlePay() {
    if (!quote) return;
    setPaying(true);
    try {
      const { slug } = await params;
      const res = await fetch(`/api/public/booking/quote/${slug}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.success) {
        setClientSecret(data.data.clientSecret);
      } else {
        setError(data.message || 'Failed to initiate payment');
      }
    } catch {
      setError('Something went wrong');
    } finally {
      setPaying(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-300 border-t-blue-600" />
      </div>
    );
  }

  if (error && !quote) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="text-center p-8">
          <span className="material-icons text-4xl text-gray-400 mb-3 block">error_outline</span>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Quote Not Found</h1>
          <p className="text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  if (!quote) return null;

  const accent = '#2563eb';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 py-12 px-4">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center mx-auto mb-4">
            <span className="material-icons text-3xl text-blue-600">request_quote</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{quote.title}</h1>
          {quote.description && (
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-2 max-w-md mx-auto">{quote.description}</p>
          )}
          <p className="text-sm text-gray-400 mt-1">Prepared for {quote.customerName}</p>
        </div>

        {paid ? (
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-green-50 dark:bg-green-900/20 flex items-center justify-center mx-auto mb-4">
              <span className="material-icons text-3xl text-green-600">check_circle</span>
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">Payment Complete</h2>
            <p className="text-gray-500 text-sm">Thank you! A confirmation has been sent to your email.</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 p-6 space-y-5">
            {/* Line items */}
            {quote.lineItems && quote.lineItems.length > 0 && (
              <div className="space-y-2">
                {quote.lineItems.map((item, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-gray-700 dark:text-gray-300">
                      {item.name}{item.quantity > 1 ? ` x${item.quantity}` : ''}
                    </span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {formatCents(item.unitPrice * item.quantity)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Scheduling */}
            {quote.startTime && (
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
                <span className="material-icons text-base">event</span>
                <span>
                  {new Date(quote.startTime).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                  {' at '}
                  {new Date(quote.startTime).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                </span>
              </div>
            )}

            {/* Total */}
            <div className="flex justify-between items-center py-3 border-t border-gray-200 dark:border-gray-700">
              <span className="text-lg font-bold text-gray-900 dark:text-gray-100">Total</span>
              <span className="text-2xl font-bold" style={{ color: accent }}>{formatCents(quote.price)}</span>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-sm">
                <span className="material-icons text-lg">error</span>
                {error}
              </div>
            )}

            {clientSecret ? (
              <BookingPaymentForm
                clientSecret={clientSecret}
                total={quote.price}
                accent={accent}
                btnBg={accent}
                btnText="#ffffff"
                btnRadius="12px"
                onSuccess={() => setPaid(true)}
                onError={(msg) => setError(msg)}
              />
            ) : (
              <button onClick={handlePay} disabled={paying}
                className="w-full py-3 rounded-xl font-medium text-white transition-all hover:shadow-md disabled:opacity-50"
                style={{ backgroundColor: accent }}>
                {paying ? 'Loading payment...' : `Pay ${formatCents(quote.price)}`}
              </button>
            )}

            <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400">
              <span className="material-icons text-sm">lock</span>
              Secured by Stripe
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
