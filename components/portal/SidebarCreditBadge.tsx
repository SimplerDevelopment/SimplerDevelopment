'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

// Compact AI-credits readout for the sidebar footer (VEQA-003). Shows the
// remaining token balance and links to the AI settings page, where the full
// ledger + purchase controls (CreditPurchaseControls) live. Hidden when the
// client has no AI services (0 balance and 0 monthly grant), mirroring the
// former dashboard widget's visibility rule. Collapsed-rail behavior follows
// the footer's neighbors: icon-only via the group-data-[collapsed] classes,
// with a title tooltip carrying the balance.
export default function SidebarCreditBadge({ collapsed = false, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const [data, setData] = useState<{ balance: number; monthlyGrant: number } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/portal/credits', { signal: controller.signal })
      .then(r => r.json())
      .then(d => setData({ balance: d.balance ?? 0, monthlyGrant: d.monthlyGrant ?? 0 }))
      // Best-effort widget — ignore failures, including the AbortError a
      // navigation-cancelled fetch throws (see cleanup below).
      .catch(() => {});
    return () => controller.abort();
  }, []);

  if (!data || (data.monthlyGrant === 0 && data.balance === 0)) return null;

  return (
    <Link
      href="/portal/settings/ai"
      onClick={onNavigate}
      title={collapsed ? `AI Credits: ${formatTokens(data.balance)}` : undefined}
      className="flex items-center gap-3 w-full px-3 py-2 rounded-md text-[13.5px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors group-data-[collapsed=true]/sb:lg:justify-center group-data-[collapsed=true]/sb:lg:px-0"
    >
      <span className="material-icons text-xl shrink-0">token</span>
      <span className="flex-1 text-left group-data-[collapsed=true]/sb:lg:hidden">AI Credits</span>
      <span className="text-xs font-semibold text-foreground group-data-[collapsed=true]/sb:lg:hidden">{formatTokens(data.balance)}</span>
    </Link>
  );
}
