'use client';

import { useState } from 'react';

interface Props {
  invoiceId: number;
  total: number;
}

export default function PayInvoiceButton({ invoiceId, total }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handlePay() {
    setLoading(true);
    setError('');

    const res = await fetch(`/api/portal/invoices/${invoiceId}/checkout`, {
      method: 'POST',
    });

    const data = await res.json();
    setLoading(false);

    if (!data.success || !data.data?.url) {
      setError(data.message ?? 'Payment setup failed. Please try again.');
    } else {
      window.location.href = data.data.url;
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handlePay}
        disabled={loading}
        className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors whitespace-nowrap"
      >
        {loading ? (
          <><span className="material-icons text-base animate-spin">refresh</span>Redirecting...</>
        ) : (
          <><span className="material-icons text-base">credit_card</span>Pay Now</>
        )}
      </button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
