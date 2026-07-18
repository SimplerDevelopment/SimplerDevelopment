'use client';

import { useEffect, useState } from 'react';

interface CreditData {
  balance: number;
  monthlyGrant: number;
  payAsYouGo: boolean;
  monthlyUsage: number;
  packages: { id: number; name: string; tokens: number; price: number }[];
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

// Interactive AI-credit controls: quick-buy packages + the pay-as-you-go
// toggle. Extracted verbatim from the former dashboard CreditBalance widget
// (VEQA-003) — the fetch/POST flows are moved, not rewritten. The compact
// read-only balance now lives in the sidebar (SidebarCreditBadge).
export default function CreditPurchaseControls() {
  const [data, setData] = useState<CreditData | null>(null);
  const [toggling, setToggling] = useState(false);
  const [purchasing, setPurchasing] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/portal/credits')
      .then(r => r.json())
      .then(setData)
      .catch(() => {});
  }, []);

  // Treat a malformed/unexpected payload as not-loaded — this component renders
  // real purchase UI and must never crash or half-render on a bad response.
  if (!data || typeof data.balance !== 'number' || !Array.isArray(data.packages)) return null;

  // Don't show if client has no AI services (0 monthly grant and 0 balance)
  if (data.monthlyGrant === 0 && data.balance === 0) return null;

  const handleTogglePAYG = async () => {
    setToggling(true);
    try {
      const res = await fetch('/api/portal/credits/pay-as-you-go', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !data.payAsYouGo }),
      });
      if (res.ok) {
        const result = await res.json();
        setData(d => d ? { ...d, payAsYouGo: result.payAsYouGo } : d);
      }
    } finally {
      setToggling(false);
    }
  };

  const handlePurchase = async (packageId: number) => {
    setPurchasing(packageId);
    try {
      const res = await fetch('/api/portal/credits/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageId }),
      });
      if (res.ok) {
        const { url } = await res.json();
        if (url) window.location.href = url;
      }
    } finally {
      setPurchasing(null);
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="material-icons text-xl text-primary">token</span>
        <h3 className="font-semibold text-foreground text-sm">Buy AI Credits</h3>
      </div>

      {/* Quick buy + PAYG */}
      <div className="flex items-center gap-2 flex-wrap">
        {data.packages.slice(0, 3).map(pkg => (
          <button
            key={pkg.id}
            onClick={() => handlePurchase(pkg.id)}
            disabled={purchasing !== null}
            className="text-[11px] px-2.5 py-1 rounded-md border border-border hover:border-primary/50 hover:bg-primary/5 transition-colors disabled:opacity-50"
          >
            {purchasing === pkg.id ? '...' : `+${formatTokens(pkg.tokens)} $${(pkg.price / 100).toFixed(0)}`}
          </button>
        ))}
        <button
          onClick={handleTogglePAYG}
          disabled={toggling}
          className={`text-[11px] px-2.5 py-1 rounded-md border transition-colors ml-auto ${
            data.payAsYouGo
              ? 'border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/40 dark:text-green-400'
              : 'border-border text-muted-foreground hover:border-primary/50'
          }`}
          title={data.payAsYouGo ? 'Pay-as-you-go is ON — you won\'t be cut off when credits run out' : 'Enable pay-as-you-go — auto-charge when credits run out'}
        >
          {data.payAsYouGo ? 'PAYG On' : 'PAYG Off'}
        </button>
      </div>
    </div>
  );
}
