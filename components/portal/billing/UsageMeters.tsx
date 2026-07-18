'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SnapshotRow {
  resource: string;
  label: string;
  unit: string;
  used: number;
  included: number;
  pct: number;
  overageRateCents: number;
  overageUnitSize: number;
  waivedForByok: boolean;
}

interface CreditBalance {
  balance: number;
  monthlyGrant: number;
}

interface UsageData {
  snapshot: SnapshotRow[];
  payAsYouGo: boolean;
  creditBalance: CreditBalance;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

/** Compute estimated overage cost for a snapshot row. */
function computeOverage(row: SnapshotRow): number {
  if (row.used <= row.included || row.overageUnitSize === 0) return 0;
  const overageUnits = row.used - row.included;
  const billableUnits = Math.ceil(overageUnits / row.overageUnitSize);
  return billableUnits * row.overageRateCents;
}

/** Color class for the progress bar based on pct. */
function barColorClass(pct: number): string {
  if (pct >= 100) return 'bg-red-500';
  if (pct >= 80) return 'bg-amber-400';
  return 'bg-primary';
}

/** Text color class for pct label. */
function pctTextClass(pct: number): string {
  if (pct >= 100) return 'text-red-600 dark:text-red-400';
  if (pct >= 80) return 'text-amber-600 dark:text-amber-400';
  return 'text-muted-foreground';
}

// ── UsageMeterRow ─────────────────────────────────────────────────────────────

function UsageMeterRow({ row }: { row: SnapshotRow }) {
  const pct = Math.min(row.pct, 100); // cap bar at 100%
  const overageCents = computeOverage(row);
  const displayPct = Math.round(row.pct);

  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <div className="flex items-baseline justify-between gap-4 mb-1.5">
        <span className="text-sm font-medium text-foreground">{row.label}</span>
        <span className={`text-xs font-medium tabular-nums ${pctTextClass(row.pct)}`}>
          {formatNumber(row.used)} / {formatNumber(row.included)} {row.unit}
          <span className="ml-1.5 opacity-70">({displayPct}%)</span>
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColorClass(row.pct)}`}
          style={{ width: `${Math.max(pct, pct > 0 ? 1.5 : 0)}%` }}
        />
      </div>

      {/* Overage line */}
      {overageCents > 0 && (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400">
          <span className="material-icons text-xs align-text-bottom mr-0.5">warning</span>
          Approx. {formatCents(overageCents)} overage so far this month
        </p>
      )}
    </div>
  );
}

// ── UsageMeters ───────────────────────────────────────────────────────────────

export default function UsageMeters() {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/portal/billing/usage')
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          setData(res.data);
        } else {
          setError(res.message ?? 'Failed to load usage');
        }
      })
      .catch(() => setError('Failed to load usage'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="material-icons animate-spin text-primary text-2xl">refresh</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 text-sm text-destructive">
        <span className="material-icons text-base align-middle mr-1.5">error_outline</span>
        {error}
      </div>
    );
  }

  if (!data || data.snapshot.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-12 text-center">
        <span className="material-icons text-5xl text-muted-foreground/40">data_usage</span>
        <h3 className="mt-4 font-semibold text-foreground">No metered usage yet</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Usage meters appear here once you have active modules with included allowances.
        </p>
        <Link
          href="/portal/settings/billing/plans"
          className="mt-4 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
        >
          <span className="material-icons text-sm">add_circle_outline</span>
          Browse modules
        </Link>
      </div>
    );
  }

  const { snapshot, payAsYouGo, creditBalance } = data;

  // Separate ai_tokens from infra meters for distinct display.
  const aiRow = snapshot.find((r) => r.resource === 'ai_tokens');
  const infraRows = snapshot.filter((r) => r.resource !== 'ai_tokens');

  return (
    <div className="space-y-4">
      {/* Infra meters */}
      {infraRows.length > 0 && (
        <div className="bg-card border border-border rounded-xl px-6 py-5">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <span className="material-icons text-base text-muted-foreground">speed</span>
            Resource usage this month
          </h3>
          <div className="divide-y divide-border">
            {infraRows.map((row) => (
              <UsageMeterRow key={row.resource} row={row} />
            ))}
          </div>
        </div>
      )}

      {/* AI credits section */}
      <div className="bg-card border border-border rounded-xl px-6 py-5">
        <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <span className="material-icons text-base text-muted-foreground">psychology</span>
          AI credits
        </h3>

        {/* Credit balance */}
        <div className="flex items-center justify-between mb-4 p-3 bg-muted/50 rounded-lg">
          <div>
            <p className="text-xs text-muted-foreground">Current balance</p>
            <p className="text-lg font-semibold text-foreground tabular-nums">
              {formatNumber(creditBalance.balance)}
              <span className="text-sm font-normal text-muted-foreground ml-1">tokens</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Monthly grant</p>
            <p className="text-sm font-medium text-foreground tabular-nums">
              {formatNumber(creditBalance.monthlyGrant)} / mo
            </p>
          </div>
        </div>

        {/* Pay-as-you-go badge */}
        {payAsYouGo && (
          <div className="mb-4 flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
            <span className="material-icons text-sm">bolt</span>
            Pay-as-you-go is enabled — usage past your balance will be billed.
          </div>
        )}

        {/* Monthly usage bar from snapshot */}
        {aiRow && <UsageMeterRow row={aiRow} />}

        {/* CTAs */}
        <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-border">
          <Link
            href="/portal/settings/billing"
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <span className="material-icons text-sm">add</span>
            Buy credits
          </Link>
          <Link
            href="/portal/settings/billing/plans"
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-accent text-foreground hover:bg-accent/80 transition-colors"
          >
            <span className="material-icons text-sm">explore</span>
            Browse modules
          </Link>
        </div>
      </div>
    </div>
  );
}
