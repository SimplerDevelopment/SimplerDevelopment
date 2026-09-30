'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { pBtnGhost } from '@/components/portal/portal-ui';
import { formatCents } from '@/components/portal/billing/use-billing-data';

/** "Manage billing" card — opens the Stripe customer portal. */
export function ManageBillingCard() {
  const router = useRouter();
  const [openingPortal, setOpeningPortal] = useState(false);

  const handleManageBilling = async () => {
    setOpeningPortal(true);
    try {
      const res = await fetch('/api/portal/billing/customer-portal', { method: 'POST' });
      const data = await res.json();
      if (data.success && data.data?.url) {
        router.push(data.data.url);
      }
    } finally {
      setOpeningPortal(false);
    }
  };

  return (
    <div className="flex items-center justify-between bg-card border border-border rounded-2xl px-6 py-4">
      <div>
        <p className="text-sm font-display font-extrabold tracking-[-0.01em] text-foreground">Manage billing</p>
        <p className="text-xs text-muted-foreground mt-0.5">Update payment methods, download receipts, and manage subscriptions on Stripe.</p>
      </div>
      <button
        onClick={handleManageBilling}
        disabled={openingPortal}
        className={`${pBtnGhost} flex-shrink-0`}
      >
        {openingPortal
          ? <span className="material-icons text-base animate-spin">refresh</span>
          : <span className="material-icons text-base">open_in_new</span>
        }
        Manage billing
      </button>
    </div>
  );
}

/** Orange outstanding-balance banner. Renders nothing when cents <= 0. */
export function OutstandingBalanceBanner({ cents }: { cents: number }) {
  if (cents <= 0) return null;
  return (
    <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-center gap-3 dark:bg-orange-900/20 dark:border-orange-800">
      <span className="material-icons text-orange-600">payments</span>
      <div>
        <p className="text-sm font-semibold text-orange-800 dark:text-orange-300">Outstanding balance: {formatCents(cents)}</p>
        <p className="text-xs text-orange-600 dark:text-orange-400">Click an invoice below to pay securely via Stripe.</p>
      </div>
    </div>
  );
}
