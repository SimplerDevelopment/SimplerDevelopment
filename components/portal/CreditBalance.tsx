'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

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

export default function CreditBalance() {
  const [data, setData] = useState<CreditData | null>(null);
  const [toggling, setToggling] = useState(false);
  const [purchasing, setPurchasing] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/portal/credits')
      .then(r => r.json())
      .then(setData)
      .catch(() => {});
  }, []);

  if (!data) return null;

  // Don't show if client has no AI services (0 monthly grant and 0 balance)
  if (data.monthlyGrant === 0 && data.balance === 0) return null;

  const usagePercent = data.monthlyGrant > 0
    ? Math.min(100, Math.round((data.monthlyUsage / data.monthlyGrant) * 100))
    : 0;

  const barColor = usagePercent > 90 ? 'bg-red-500' : usagePercent > 70 ? 'bg-amber-500' : 'bg-green-500';

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
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="material-icons text-xl text-primary">token</span>
          <h3 className="font-semibold text-foreground text-sm">AI Credits</h3>
        </div>
        <Link href="/portal/settings" className="text-xs text-primary hover:underline">Manage</Link>
      </div>

      {/* Balance */}
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-2xl font-bold text-foreground">{formatTokens(data.balance)}</span>
        <span className="text-xs text-muted-foreground">tokens remaining</span>
      </div>

      {/* Usage bar */}
      {data.monthlyGrant > 0 && (
        <div className="mb-3">
          <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
            <span>{formatTokens(data.monthlyUsage)} used this month</span>
            <span>{formatTokens(data.monthlyGrant)} monthly grant</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${usagePercent}%` }} />
          </div>
        </div>
      )}

      {/* Quick buy + PAYG */}
      <div className="flex items-center gap-2 flex-wrap mt-3">
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
