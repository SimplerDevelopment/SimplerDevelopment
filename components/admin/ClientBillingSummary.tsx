'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { formatCents } from '@/lib/portal-utils';

interface BillingModule {
  name: string;
  priceCents: number;
}

interface BillingSummaryData {
  billingMode: string;
  modules: BillingModule[];
  bundle: { priceCents: number } | null;
  seats: {
    effective: number;
    perSeatCents: number;
    seatTotalCents: number;
  };
  discountPercent: number;
  compDiscountPercent: number | null;
  byokEligible: boolean;
  grossMrrCents: number;
  netMrrCents: number;
}

interface Props {
  clientId: number;
}

export default function ClientBillingSummary({ clientId }: Props) {
  const [data, setData] = useState<BillingSummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/admin/portal/clients/${clientId}/billing`)
      .then((r) => {
        if (!r.ok) return r.json().then((d) => Promise.reject(d.message ?? 'Failed to load billing'));
        return r.json();
      })
      .then((d) => {
        if (!d.success) throw new Error(d.message ?? 'Failed to load billing');
        setData(d.data);
      })
      .catch((e) => setError(typeof e === 'string' ? e : (e?.message ?? 'Unknown error')))
      .finally(() => setLoading(false));
  }, [clientId]);

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-lg px-5 py-4 text-sm text-muted-foreground">
        Loading billing summary…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-card border border-border rounded-lg px-5 py-4 text-sm text-destructive">
        <span className="material-icons text-base align-middle mr-1">error_outline</span>
        {error ?? 'Could not load billing summary.'}
      </div>
    );
  }

  const hasBundle = !!data.bundle;
  const moduleLabel = hasBundle
    ? 'Everything bundle'
    : `${data.modules.length} module${data.modules.length !== 1 ? 's' : ''}`;

  return (
    <div className="bg-card border border-border rounded-lg">
      <header className="flex items-center justify-between px-5 py-3 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <span className="material-icons text-base text-primary">receipt_long</span>
          Billing summary
        </h2>
        <Link
          href={`/admin/clients/${clientId}/plan`}
          className="text-xs text-primary hover:underline flex items-center gap-0.5"
        >
          Manage billing
          <span className="material-icons text-sm">arrow_forward</span>
        </Link>
      </header>

      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4 px-5 py-4 text-sm">
        {/* Net MRR */}
        <div>
          <dt className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">Net MRR</dt>
          <dd className="text-lg font-bold text-foreground">{formatCents(data.netMrrCents)}</dd>
          {data.grossMrrCents !== data.netMrrCents && (
            <p className="text-xs text-muted-foreground">
              gross {formatCents(data.grossMrrCents)}
            </p>
          )}
        </div>

        {/* Modules / bundle */}
        <div>
          <dt className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">Plan</dt>
          <dd className="font-medium text-foreground flex items-center gap-1">
            <span className="material-icons text-base text-primary">
              {hasBundle ? 'all_inclusive' : 'view_module'}
            </span>
            {moduleLabel}
          </dd>
          <p className="text-xs text-muted-foreground capitalize">{data.billingMode} billing</p>
        </div>

        {/* Seats */}
        <div>
          <dt className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">Seats</dt>
          <dd className="font-medium text-foreground">{data.seats.effective}</dd>
          {data.seats.seatTotalCents > 0 && (
            <p className="text-xs text-muted-foreground">
              +{formatCents(data.seats.perSeatCents)}/seat → {formatCents(data.seats.seatTotalCents)}
            </p>
          )}
        </div>

        {/* Volume discount */}
        <div>
          <dt className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">Volume discount</dt>
          <dd className="font-medium text-foreground">
            {data.discountPercent > 0 ? `${data.discountPercent}% off` : '—'}
          </dd>
        </div>

        {/* Comp */}
        <div>
          <dt className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">Comp</dt>
          <dd className="font-medium text-foreground">
            {(data.compDiscountPercent ?? 0) > 0 ? `${data.compDiscountPercent}%` : '—'}
          </dd>
        </div>

        {/* BYOK */}
        <div>
          <dt className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">BYOK</dt>
          <dd className="flex items-center gap-1 font-medium text-foreground">
            <span className={`material-icons text-base ${data.byokEligible ? 'text-green-600' : 'text-muted-foreground'}`}>
              {data.byokEligible ? 'check_circle' : 'cancel'}
            </span>
            {data.byokEligible ? 'Eligible' : 'Not eligible'}
          </dd>
        </div>
      </dl>
    </div>
  );
}
