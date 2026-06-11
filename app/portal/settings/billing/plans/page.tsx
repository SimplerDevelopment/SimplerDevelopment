'use client';

// Self-serve module pricing page — /portal/settings/billing/plans
//
// Fetches GET /api/portal/billing/modules, renders:
//   - Hero bundle card with savings badge
//   - Responsive grid of per-domain module cards
//   - Checkout (POST /checkout) and Cancel (POST /[id]/cancel) actions
//   - ?highlight=<key>   → scroll-to + ring highlight
//   - ?status=success    → green toast
//   - ?status=cancelled  → neutral banner
//
// Material Icons only — no emoji per repo convention.

import { type ReactNode, Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { TierPlans } from '@/components/portal/billing/TierPlans';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DomainMeter {
  resource: string;
  label: string;
  unit: string;
  includedPerMonth: number;
  overageRateCents: number;
  overageUnitSize: number;
  waivedForByok: boolean;
}

interface ModuleInfo {
  key: string;
  slug: string;
  name: string;
  tagline: string;
  icon: string;
  features: string[];
  meters: DomainMeter[];
  byokProviders: string[];
  monthlyPriceCents: number;
  serviceId: number | null;
  stripePriceId: string | null;
  purchasable: boolean;
  clientServiceId: number | null;
  status: string | null;
  renewalDate: string | null;
  selfServe: boolean;
}

interface BundleInfo {
  slug: string;
  name: string;
  tagline: string;
  icon: string;
  monthlyPriceCents: number;
  serviceId: number | null;
  stripePriceId: string | null;
  purchasable: boolean;
  clientServiceId: number | null;
  status: string | null;
  renewalDate: string | null;
  selfServe: boolean;
}

interface EntitlementsInfo {
  domains: string[];
  hasBundle: boolean;
  gatingBypassed: boolean;
}

interface ModulesResponse {
  success: boolean;
  data?: {
    billingMode: string;
    entitlements: EntitlementsInfo;
    bundle: BundleInfo;
    modules: ModuleInfo[];
  };
  message?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(0)}`;
}

function formatMeterLabel(meter: DomainMeter): string {
  const included = meter.includedPerMonth.toLocaleString();
  const overageUnit = meter.overageUnitSize === 1
    ? meter.unit
    : `${meter.overageUnitSize.toLocaleString()} ${meter.unit}`;
  const overageDollars = (meter.overageRateCents / 100).toFixed(2);
  return `${included} ${meter.unit}/mo included, then $${overageDollars} per ${overageUnit}`;
}

// ── Module Card ───────────────────────────────────────────────────────────────

interface ModuleCardProps {
  mod: ModuleInfo;
  hasBundle: boolean;
  billingMode: string;
  highlight: boolean;
  onSubscribe: (slug: string) => void;
  onCancel: (clientServiceId: number) => void;
  subscribing: string | null;
  cancelling: number | null;
}

function ModuleCard({
  mod,
  hasBundle,
  billingMode,
  highlight,
  onSubscribe,
  onCancel,
  subscribing,
  cancelling,
}: ModuleCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const isActive = mod.status === 'active';
  const isAgency = billingMode === 'agency';

  useEffect(() => {
    if (highlight && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlight]);

  // Determine state label + button
  let stateLabel: ReactNode = null;
  let actionButton: ReactNode = null;

  if (isActive && hasBundle) {
    stateLabel = (
      <span className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
        <span className="material-icons text-sm">all_inclusive</span>
        Included in bundle
      </span>
    );
  } else if (isActive && mod.selfServe) {
    stateLabel = (
      <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-2 py-0.5 rounded-full font-medium">
        <span className="material-icons text-sm">check_circle</span>
        Active
      </span>
    );
    if (!isAgency) {
      actionButton = (
        <button
          onClick={() => mod.clientServiceId && onCancel(mod.clientServiceId)}
          disabled={cancelling === mod.clientServiceId}
          className="w-full mt-3 px-4 py-2 rounded-md text-sm font-medium border border-border text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors disabled:opacity-50"
        >
          {cancelling === mod.clientServiceId ? 'Cancelling…' : 'Cancel at period end'}
        </button>
      );
    }
  } else if (isActive) {
    stateLabel = (
      <span className="inline-flex items-center gap-1 text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full font-medium">
        <span className="material-icons text-sm">manage_accounts</span>
        Managed
      </span>
    );
  } else if (!isAgency && mod.purchasable) {
    actionButton = (
      <button
        onClick={() => onSubscribe(mod.slug)}
        disabled={subscribing === mod.slug}
        className="w-full mt-3 px-4 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
      >
        {subscribing === mod.slug ? 'Redirecting…' : 'Subscribe'}
      </button>
    );
  }

  // BYOK waiver note
  const byokMeterNote =
    billingMode === 'byok' &&
    mod.meters.length > 0 &&
    mod.meters.every((m) => m.waivedForByok)
      ? 'Usage runs on your own API keys — no usage fees.'
      : null;

  return (
    <div
      ref={cardRef}
      className={`relative bg-card border rounded-lg p-5 flex flex-col transition-all ${
        highlight ? 'ring-2 ring-primary border-primary' : 'border-border'
      } ${isActive ? 'border-green-500/40' : ''}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="material-icons text-2xl text-primary">{mod.icon}</span>
          <div>
            <h3 className="text-base font-semibold text-foreground leading-tight">{mod.name}</h3>
          </div>
        </div>
        {stateLabel && <div className="shrink-0">{stateLabel}</div>}
      </div>

      <p className="text-sm text-muted-foreground mb-3">{mod.tagline}</p>

      {/* Price */}
      <div className="flex items-baseline gap-1 mb-4">
        <span className="text-2xl font-bold text-foreground">{formatCents(mod.monthlyPriceCents)}</span>
        <span className="text-sm text-muted-foreground">/mo</span>
      </div>

      {/* Feature bullets */}
      <ul className="space-y-1.5 mb-4 flex-1">
        {mod.features.map((feat, i) => (
          <li key={i} className="flex items-start gap-2 text-xs text-foreground">
            <span className="material-icons text-sm text-primary mt-0.5 shrink-0">check_circle</span>
            <span>{feat}</span>
          </li>
        ))}
      </ul>

      {/* Meters */}
      {mod.meters.length > 0 && (
        <div className="border-t border-border pt-3 mb-3 space-y-1">
          {mod.meters.map((m) => (
            <p key={m.resource} className="text-xs text-muted-foreground">
              <span className="material-icons text-xs align-middle mr-1">speed</span>
              {formatMeterLabel(m)}
            </p>
          ))}
        </div>
      )}

      {/* BYOK note */}
      {byokMeterNote && (
        <p className="text-xs text-blue-600 dark:text-blue-400 mb-2">
          <span className="material-icons text-xs align-middle mr-1">key</span>
          {byokMeterNote}
        </p>
      )}

      {/* Action */}
      {actionButton}
    </div>
  );
}

// ── Main Page (inner — needs Suspense for useSearchParams) ───────────────────

function BillingPlansInner() {
  const searchParams = useSearchParams();
  const highlight = searchParams.get('highlight') ?? '';
  const statusParam = searchParams.get('status');

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ModulesResponse['data'] | null>(null);
  const [error, setError] = useState('');
  const [subscribing, setSubscribing] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<number | null>(null);
  const [actionError, setActionError] = useState('');
  const [showModules, setShowModules] = useState(false);
  const [selectedTierSlug, setSelectedTierSlug] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/portal/billing/modules')
      .then((r) => r.json() as Promise<ModulesResponse>)
      .then((d) => {
        if (cancelled) return;
        if (!d.success) { setError(d.message ?? 'Failed to load modules'); setLoading(false); return; }
        setData(d.data ?? null);
        setLoading(false);
      })
      .catch((err) => { if (!cancelled) { setError(String(err)); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  async function handleSubscribe(slug: string) {
    setSubscribing(slug);
    setActionError('');
    try {
      const res = await fetch('/api/portal/billing/modules/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      });
      const json = await res.json();
      if (!json.success) { setActionError(json.message ?? 'Checkout failed.'); setSubscribing(null); return; }
      window.location.href = json.data.url;
    } catch (err) {
      setActionError(String(err));
      setSubscribing(null);
    }
  }

  async function handleCancel(clientServiceId: number) {
    setCancelling(clientServiceId);
    setActionError('');
    try {
      const res = await fetch(`/api/portal/billing/modules/${clientServiceId}/cancel`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!json.success) { setActionError(json.message ?? 'Cancel failed.'); setCancelling(null); return; }
      // Refresh data
      const refreshed = await fetch('/api/portal/billing/modules').then((r) => r.json() as Promise<ModulesResponse>);
      if (refreshed.success && refreshed.data) setData(refreshed.data);
    } catch (err) {
      setActionError(String(err));
    } finally {
      setCancelling(null);
    }
  }

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading plans…</div>;
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-4 py-3">
          <span className="material-icons text-base">error_outline</span>
          {error}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { billingMode, entitlements, bundle, modules } = data;
  const isAgency = billingMode === 'agency';
  const { hasBundle, gatingBypassed } = entitlements;

  // Live sum of individual module prices for savings badge
  const sumModulePrices = modules.reduce((sum, m) => sum + m.monthlyPriceCents, 0);
  const bundleSavings = sumModulePrices - bundle.monthlyPriceCents;

  const bundleActive = bundle.status === 'active';

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Link href="/portal/settings/billing" className="text-muted-foreground hover:text-foreground">
          <span className="material-icons text-base align-middle">arrow_back</span>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Plans &amp; Modules</h1>
          <p className="text-sm text-muted-foreground">Subscribe to individual modules or get everything at once.</p>
        </div>
      </div>

      {/* Status banners */}
      {statusParam === 'success' && (
        <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-4 py-3">
          <span className="material-icons text-base">check_circle</span>
          Subscription active — welcome aboard!
        </div>
      )}
      {statusParam === 'cancelled' && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted border border-border rounded-md px-4 py-3">
          <span className="material-icons text-base">info</span>
          Checkout cancelled. No changes were made.
        </div>
      )}
      {actionError && (
        <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-4 py-3">
          <span className="material-icons text-base">error_outline</span>
          {actionError}
        </div>
      )}

      {/* Agency managed banner */}
      {(isAgency || gatingBypassed) && (
        <div className="flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-lg px-5 py-4">
          <span className="material-icons text-2xl text-primary">verified</span>
          <div>
            <p className="font-semibold text-foreground">Everything is included in your managed plan</p>
            <p className="text-sm text-muted-foreground">
              Your plan is managed by SimplerDevelopment. Contact us to make changes.
            </p>
          </div>
        </div>
      )}

      {/* Tier plans — primary pricing */}
      <div>
        <h2 className="text-xl font-semibold text-foreground mb-2">Choose your plan</h2>
        <p className="text-sm text-muted-foreground mb-6">Start with a tier, or customize below.</p>
        <TierPlans
          selectedSlug={selectedTierSlug}
          onSelect={(slug) => setSelectedTierSlug(slug)}
        />
      </div>

      {/* Divider + toggle to show/hide module grid */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-border" />
        <button
          type="button"
          onClick={() => setShowModules((v) => !v)}
          className="text-sm text-primary underline font-medium"
        >
          {showModules ? 'Hide individual modules ▴' : 'Customize / build your own plan ▾'}
        </button>
        <div className="flex-1 h-px bg-border" />
      </div>

      {showModules && (
        <>
      {/* Hero bundle card */}
      <div className={`bg-card border rounded-xl p-6 ${bundleActive ? 'border-primary ring-2 ring-primary/20' : 'border-border'}`}>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="flex items-start gap-4">
            <span className="material-icons text-4xl text-primary">{bundle.icon}</span>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold text-foreground">{bundle.name}</h2>
                {bundleActive && (
                  <span className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                    <span className="material-icons text-sm">check</span>
                    Active
                  </span>
                )}
                {bundleSavings > 0 && !bundleActive && (
                  <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-2 py-0.5 rounded-full font-medium">
                    <span className="material-icons text-sm">savings</span>
                    Save {formatCents(bundleSavings)}/mo vs buying separately
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-1">{bundle.tagline}</p>
            </div>
          </div>

          <div className="flex items-center gap-6 shrink-0">
            <div className="text-right">
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold text-foreground">{formatCents(bundle.monthlyPriceCents)}</span>
                <span className="text-sm text-muted-foreground">/mo</span>
              </div>
              {bundleSavings > 0 && (
                <p className="text-xs text-muted-foreground line-through">{formatCents(sumModulePrices)}/mo</p>
              )}
            </div>

            {!isAgency && !gatingBypassed && (
              bundleActive ? (
                bundle.selfServe && bundle.clientServiceId ? (
                  <button
                    onClick={() => handleCancel(bundle.clientServiceId!)}
                    disabled={cancelling === bundle.clientServiceId}
                    className="px-5 py-2.5 rounded-md text-sm font-medium border border-border text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors disabled:opacity-50"
                  >
                    {cancelling === bundle.clientServiceId ? 'Cancelling…' : 'Cancel at period end'}
                  </button>
                ) : (
                  <span className="text-sm text-muted-foreground">Managed</span>
                )
              ) : bundle.purchasable ? (
                <button
                  onClick={() => handleSubscribe(bundle.slug)}
                  disabled={subscribing === bundle.slug}
                  className="px-6 py-2.5 rounded-md text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {subscribing === bundle.slug ? 'Redirecting…' : 'Subscribe to everything'}
                </button>
              ) : null
            )}
          </div>
        </div>
      </div>

      {/* Bundle active: note about included modules */}
      {bundleActive && (
        <div className="flex items-center gap-2 text-sm text-primary bg-primary/5 border border-primary/20 rounded-md px-4 py-3">
          <span className="material-icons text-base">all_inclusive</span>
          All modules are included in your bundle subscription.
        </div>
      )}

      {/* Module grid */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">Individual modules</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {modules.map((mod) => (
            <ModuleCard
              key={mod.key}
              mod={mod}
              hasBundle={hasBundle || bundleActive}
              billingMode={billingMode}
              highlight={highlight === mod.key}
              onSubscribe={handleSubscribe}
              onCancel={handleCancel}
              subscribing={subscribing}
              cancelling={cancelling}
            />
          ))}
        </div>
      </div>

      <p className="text-xs text-muted-foreground pb-4">
        Subscriptions are billed monthly via Stripe. You can cancel at any time; access continues until the end of the billing period.
      </p>
        </>
      )}
    </div>
  );
}

// useSearchParams() requires a Suspense boundary in App Router.
export default function BillingPlansPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading plans…</div>}>
      <BillingPlansInner />
    </Suspense>
  );
}
