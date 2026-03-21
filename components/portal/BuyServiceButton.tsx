'use client';

import { useState } from 'react';

interface Props {
  serviceId: number;
  label?: string;
}

export default function BuyServiceButton({ serviceId, label = 'Buy Now' }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleBuy() {
    setLoading(true);
    setError('');
    const res = await fetch(`/api/portal/services/${serviceId}/checkout`, { method: 'POST' });
    const data = await res.json();
    setLoading(false);
    if (!data.success || !data.data?.url) {
      setError(data.message ?? 'Could not start checkout.');
    } else {
      window.location.href = data.data.url;
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleBuy}
        disabled={loading}
        className="flex items-center gap-1 text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
      >
        {loading ? (
          <><span className="material-icons text-xs animate-spin">refresh</span>Redirecting...</>
        ) : (
          <><span className="material-icons text-xs">shopping_cart</span>{label}</>
        )}
      </button>
      {error && <p className="text-xs text-destructive mt-1">{error}</p>}
    </div>
  );
}
