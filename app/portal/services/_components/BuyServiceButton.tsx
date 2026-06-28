'use client';

import { useState } from 'react';

interface Props {
  serviceId: number;
  label?: string;
}

export default function BuyServiceButton({ serviceId, label = 'Buy' }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleBuy() {
    setLoading(true);
    setError('');

    try {
      const res = await fetch(`/api/portal/services/${serviceId}/checkout`, { method: 'POST' });
      const json = await res.json();

      if (!json.success || !json.data?.url) {
        setError(json.message ?? 'Checkout unavailable');
        setLoading(false);
        return;
      }

      window.location.href = json.data.url;
    } catch {
      setError('Network error — please try again');
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleBuy}
        disabled={loading}
        className="flex items-center gap-1 text-sm px-4 py-2 bg-foreground text-background rounded-xl font-semibold transition hover:-translate-y-px hover:shadow-lg hover:shadow-foreground/20 disabled:opacity-60 disabled:hover:translate-y-0"
      >
        {loading ? (
          <>
            <span className="material-icons text-base animate-spin">refresh</span>
            Redirecting...
          </>
        ) : (
          <>
            {label}
            <span className="material-icons text-base">arrow_forward</span>
          </>
        )}
      </button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
