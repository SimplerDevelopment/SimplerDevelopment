'use client';

// Admin tier-assignment UI. Lives at /admin/clients/[id]/plan and is reached
// via a link from the client detail page's settings tab. Loads tier catalog
// + currently-active tier in a single round-trip from
// /api/admin/portal/clients/[id]/plan, then POSTs to switch tiers.
//
// Also manages billingMode (agency / saas / byok) via
// /api/admin/portal/clients/[id]/billing-mode.
//
// Material Icons only — no emoji per repo convention.

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { BYOK_PROVIDER_LABELS, FEATURE_DOMAINS } from '@/lib/billing/domain-catalog';
import { formatCents } from '@/lib/portal-utils';

interface Tier {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  price: number;
  billingCycle: string | null;
  features: string[] | null;
  usageLimits: Record<string, number | string> | null;
  active: boolean;
}

interface ActiveTier {
  clientServiceId: number;
  serviceId: number;
  slug: string;
  name: string;
  startDate: string | null;
}

interface PlanResponse {
  success: boolean;
  data?: { active: ActiveTier | null; catalog: Tier[] };
  message?: string;
}

type BillingModeValue = 'agency' | 'saas' | 'byok';

interface ByokStatus {
  requiredProviders: string[];
  connectedProviders: string[];
  missingProviders: string[];
}

interface BillingModeResponse {
  success: boolean;
  data?: { billingMode: BillingModeValue; byok: ByokStatus };
  message?: string;
}

function formatLimit(value: number | string | undefined): string {
  if (value === undefined || value === null) return '—';
  if (typeof value === 'string') return value;
  if (value >= 9_000) return 'Unlimited';
  return value.toLocaleString();
}

export default function ClientPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const clientId = parseInt(id, 10);

  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<ActiveTier | null>(null);
  const [catalog, setCatalog] = useState<Tier[]>([]);
  const [saving, setSaving] = useState<number | 'cancel' | null>(null);
  const [error, setError] = useState('');
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Billing mode state
  const [billingMode, setBillingMode] = useState<BillingModeValue | null>(null);
  const [savingMode, setSavingMode] = useState(false);
  const [byokStatus, setByokStatus] = useState<ByokStatus | null>(null);

  // billing read-model
  interface BillingData {
    billingMode: string;
    hasSubscription: boolean;
    modules: Array<{ clientServiceId: number; key: string; slug: string; name: string; priceCents: number }>;
    bundle: { clientServiceId: number; priceCents: number } | null;
    seats: {
      derived: number; override: number | null; effective: number;
      included: number; additional: number; perSeatCents: number; seatTotalCents: number;
    };
    moduleSubtotalCents: number;
    discountPercent: number;
    compDiscountPercent: number | null;
    compDiscountCents: number;
    byokEligibleOverride: boolean | null;
    byokEligible: boolean;
    grossMrrCents: number;
    netMrrCents: number;
  }

  const [billing, setBilling] = useState<BillingData | null>(null);
  const [billingLoading, setBillingLoading] = useState(true);
  const [billingInFlight, setBillingInFlight] = useState(false);
  const [billingError, setBillingError] = useState('');
  const [seatsInput, setSeatsInput] = useState('');
  const [compInput, setCompInput] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`/api/admin/portal/clients/${clientId}/plan`).then(r => r.json() as Promise<PlanResponse>),
      fetch(`/api/admin/portal/clients/${clientId}/billing-mode`).then(r => r.json() as Promise<BillingModeResponse>),
    ])
      .then(([planData, modeData]) => {
        if (cancelled) return;
        if (!planData.success) {
          setError(planData.message ?? 'Failed to load plan');
          setLoading(false);
          return;
        }
        setActive(planData.data?.active ?? null);
        // Sort by price ascending so Starter -> Growth -> Scale renders left-to-right.
        const sorted = [...(planData.data?.catalog ?? [])].sort((a, b) => a.price - b.price);
        setCatalog(sorted);
        if (modeData.success && modeData.data) {
          setBillingMode(modeData.data.billingMode);
          setByokStatus(modeData.data.byok);
        }
        setLoading(false);
      })
      .catch(err => {
        if (!cancelled) {
          setError(String(err));
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [clientId]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/portal/clients/${clientId}/billing`)
      .then(r => r.json())
      .then((data: { success: boolean; data?: BillingData; message?: string }) => {
        if (cancelled) return;
        if (data.success && data.data) {
          setBilling(data.data);
          setSeatsInput(data.data.seats.override != null ? String(data.data.seats.override) : '');
          setCompInput(data.data.compDiscountPercent != null ? String(data.data.compDiscountPercent) : '');
        }
        setBillingLoading(false);
      })
      .catch(() => { if (!cancelled) setBillingLoading(false); });
    return () => { cancelled = true; };
  }, [clientId]);

  async function billingAction(body: Record<string, unknown>) {
    setBillingInFlight(true);
    setBillingError('');
    try {
      const res = await fetch(`/api/admin/portal/clients/${clientId}/billing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json() as { success: boolean; message?: string };
      if (!data.success) {
        setBillingError(data.message ?? 'Action failed');
        return;
      }
      // Refetch read-model
      const refreshed = await fetch(`/api/admin/portal/clients/${clientId}/billing`).then(r => r.json()) as { success: boolean; data?: BillingData };
      if (refreshed.success && refreshed.data) {
        setBilling(refreshed.data);
        setSeatsInput(refreshed.data.seats.override != null ? String(refreshed.data.seats.override) : '');
        setCompInput(refreshed.data.compDiscountPercent != null ? String(refreshed.data.compDiscountPercent) : '');
      }
    } catch (err) {
      setBillingError(String(err));
    } finally {
      setBillingInFlight(false);
    }
  }

  async function switchBillingMode(mode: BillingModeValue) {
    setSavingMode(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/portal/clients/${clientId}/billing-mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ billingMode: mode }),
      });
      const data = await res.json() as BillingModeResponse;
      if (!data.success) {
        setError(data.message ?? 'Failed to update billing mode');
        return;
      }
      if (data.data) {
        setBillingMode(data.data.billingMode);
        setByokStatus(data.data.byok);
      }
      // Pure updater — react-hooks/purity rejects Date.now() here; the banner
      // only needs truthiness, so a counter works.
      setSavedAt((n) => (n ?? 0) + 1);
    } catch (err) {
      setError(String(err));
    } finally {
      setSavingMode(false);
    }
  }

  async function assign(serviceId: number | null) {
    setSaving(serviceId === null ? 'cancel' : serviceId);
    setError('');
    try {
      const res = await fetch(`/api/admin/portal/clients/${clientId}/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceId }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.message ?? 'Failed to update plan');
        return;
      }
      // Refresh active state by re-fetching to avoid local-state drift.
      const refreshed = await fetch(`/api/admin/portal/clients/${clientId}/plan`).then(r => r.json() as Promise<PlanResponse>);
      if (refreshed.success && refreshed.data) {
        setActive(refreshed.data.active);
      }
      setSavedAt((n) => (n ?? 0) + 1);
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(null);
    }
  }

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading plan…</div>;
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <Link href={`/admin/clients/${clientId}`} className="text-muted-foreground hover:text-foreground">
          <span className="material-icons text-base align-middle">arrow_back</span>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Subscription plan</h1>
          <p className="text-sm text-muted-foreground">
            Assign a bundled monthly tier. AI usage runs on the client&apos;s own Anthropic / OpenAI key (BYOK).
          </p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-4 py-3">
          <span className="material-icons text-base">error_outline</span>
          {error}
        </div>
      )}
      {savedAt && (
        <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-4 py-3">
          <span className="material-icons text-base">check_circle</span>
          Plan updated.
        </div>
      )}

      {/* Billing mode card */}
      {billingMode !== null && (
        <div className="bg-card border border-border rounded-lg p-5 space-y-4">
          <div className="flex items-center gap-2">
            <span className="material-icons text-xl text-primary">account_balance_wallet</span>
            <h2 className="text-base font-semibold text-foreground">Billing mode</h2>
          </div>

          {/* Segmented control */}
          <div className="inline-flex rounded-md border border-border overflow-hidden text-sm">
            {(
              [
                { value: 'agency' as const, label: 'Agency-managed', description: 'Legacy managed; module gating is bypassed.' },
                { value: 'saas' as const, label: 'SaaS', description: 'Client pays per-module subscriptions with usage overage.' },
                { value: 'byok' as const, label: 'BYOK', description: 'Client brings their own API keys; metered costs are waived.' },
              ] as const
            ).map((opt, idx, arr) => {
              const isActive = billingMode === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => switchBillingMode(opt.value)}
                  disabled={savingMode || isActive}
                  title={opt.description}
                  className={[
                    'px-4 py-2 font-medium transition-colors disabled:cursor-not-allowed',
                    idx < arr.length - 1 ? 'border-r border-border' : '',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-background text-foreground hover:bg-muted disabled:opacity-50',
                  ].join(' ')}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* Description of current selection */}
          <p className="text-xs text-muted-foreground">
            {billingMode === 'agency' && 'Legacy managed; module gating is bypassed.'}
            {billingMode === 'saas' && 'Client pays per-module subscriptions with usage overage.'}
            {billingMode === 'byok' && 'Client brings their own API keys; metered costs are waived.'}
          </p>

          {/* BYOK provider checklist — only shown in byok mode */}
          {billingMode === 'byok' && byokStatus && (
            <div className="border-t border-border pt-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <span className="material-icons text-base">vpn_key</span>
                Required API keys
              </div>
              <ul className="space-y-1.5">
                {byokStatus.requiredProviders.map((provider) => {
                  const connected = byokStatus.connectedProviders.includes(provider);
                  return (
                    <li key={provider} className="flex items-center gap-2 text-sm">
                      {connected ? (
                        <span className="material-icons text-base text-green-600">check_circle</span>
                      ) : (
                        <span className="material-icons text-base text-amber-500">warning</span>
                      )}
                      <span className={connected ? 'text-foreground' : 'text-amber-700 dark:text-amber-400'}>
                        {BYOK_PROVIDER_LABELS[provider] ?? provider}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Currently-active tier banner */}
      <div className="bg-card border border-border rounded-lg p-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="material-icons text-2xl text-primary">card_membership</span>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Current tier</p>
            <p className="text-lg font-semibold text-foreground">{active ? active.name : 'No tier assigned'}</p>
            {active?.startDate && (
              <p className="text-xs text-muted-foreground">
                Started {new Date(active.startDate).toLocaleDateString()}
              </p>
            )}
          </div>
        </div>
        {active && (
          <button
            onClick={() => assign(null)}
            disabled={saving !== null}
            className="flex items-center gap-1 text-sm text-red-600 hover:text-red-700 disabled:opacity-50"
          >
            <span className="material-icons text-base">cancel</span>
            {saving === 'cancel' ? 'Cancelling…' : 'Cancel tier'}
          </button>
        )}
      </div>

      {/* Tier catalog */}
      {catalog.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-8 text-center text-sm text-muted-foreground">
          <span className="material-icons text-3xl text-muted-foreground mb-2 block">inventory_2</span>
          No pricing tiers in the catalog. Run <code className="bg-muted px-1.5 py-0.5 rounded text-xs">tsx scripts/seed-pricing-tiers.ts</code> first.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {catalog.map(tier => {
            const isActive = active?.serviceId === tier.id;
            const isSaving = saving === tier.id;
            return (
              <div
                key={tier.id}
                className={`relative bg-card border rounded-lg p-5 flex flex-col ${isActive ? 'border-primary ring-2 ring-primary/20' : 'border-border'}`}
              >
                {isActive && (
                  <span className="absolute top-3 right-3 inline-flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                    <span className="material-icons text-sm">check</span>
                    Active
                  </span>
                )}
                <h3 className="text-lg font-semibold text-foreground">{tier.name}</h3>
                <p className="text-sm text-muted-foreground mt-1 min-h-[3rem]">{tier.description ?? ''}</p>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-foreground">${(tier.price / 100).toFixed(0)}</span>
                  <span className="text-sm text-muted-foreground">/{tier.billingCycle ?? 'month'}</span>
                </div>

                {/* Usage limits */}
                <div className="mt-4 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between border-b border-border pb-1">
                    <span className="text-muted-foreground">Sites</span>
                    <span className="font-medium text-foreground">{formatLimit(tier.usageLimits?.sites as number)}</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-border pb-1">
                    <span className="text-muted-foreground">Seats</span>
                    <span className="font-medium text-foreground">{formatLimit(tier.usageLimits?.seats as number)}</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-border pb-1">
                    <span className="text-muted-foreground">CRM contacts</span>
                    <span className="font-medium text-foreground">{formatLimit(tier.usageLimits?.contacts as number)}</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-border pb-1">
                    <span className="text-muted-foreground">Brain storage</span>
                    <span className="font-medium text-foreground">{tier.usageLimits?.brainGb ? `${tier.usageLimits.brainGb} GB` : '—'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Automations</span>
                    <span className="font-medium text-foreground">{formatLimit(tier.usageLimits?.automations as number)}</span>
                  </div>
                </div>

                {/* Feature bullets */}
                {tier.features && tier.features.length > 0 && (
                  <ul className="mt-4 space-y-1.5">
                    {tier.features.map((feat, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-foreground">
                        <span className="material-icons text-sm text-primary mt-0.5">check_circle</span>
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-5 pt-4 border-t border-border">
                  <button
                    onClick={() => assign(tier.id)}
                    disabled={saving !== null || isActive}
                    className={`w-full px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50 ${isActive ? 'bg-muted text-muted-foreground cursor-not-allowed' : 'bg-primary text-primary-foreground hover:bg-primary/90'}`}
                  >
                    {isActive ? 'Current plan' : isSaving ? 'Switching…' : (active ? 'Switch to this tier' : 'Assign tier')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Billing & Plan management ───────────────────────────── */}
      {billingLoading ? (
        <div className="p-4 text-sm text-muted-foreground">Loading billing data…</div>
      ) : billing ? (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <span className="material-icons text-xl text-primary">receipt_long</span>
            Billing &amp; Plan
          </h2>

          {billingError && (
            <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-4 py-3">
              <span className="material-icons text-base">error_outline</span>
              {billingError}
            </div>
          )}

          {/* 1. Plan summary */}
          <div className="bg-card border border-border rounded-lg p-5 space-y-2">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-icons text-xl text-primary">summarize</span>
              <h3 className="text-sm font-semibold text-foreground">Plan summary</h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Gross MRR</p>
                <p className="font-semibold text-foreground">{formatCents(billing.grossMrrCents)}</p>
              </div>
              {billing.discountPercent > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Volume discount</p>
                  <p className="font-semibold text-foreground">{billing.discountPercent}%</p>
                </div>
              )}
              {(billing.compDiscountPercent ?? 0) > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Comp discount</p>
                  <p className="font-semibold text-foreground">
                    {billing.compDiscountPercent}% (−{formatCents(billing.compDiscountCents)})
                  </p>
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Net MRR</p>
                <p className="font-semibold text-foreground">{formatCents(billing.netMrrCents)}</p>
              </div>
            </div>
          </div>

          {/* 2. Modules */}
          <div className="bg-card border border-border rounded-lg p-5 space-y-3">
            <div className="flex items-center gap-2">
              <span className="material-icons text-xl text-primary">extension</span>
              <h3 className="text-sm font-semibold text-foreground">Modules</h3>
            </div>

            {billing.bundle ? (
              <div className="flex items-center gap-2 text-sm">
                <span className="material-icons text-base text-green-600">check_circle</span>
                <span className="text-foreground font-medium">On the Everything bundle</span>
                <span className="text-muted-foreground">— all modules included ({formatCents(billing.bundle.priceCents)}/mo)</span>
              </div>
            ) : billing.modules.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active modules.</p>
            ) : (
              <ul className="space-y-1.5">
                {billing.modules.map((mod) => (
                  <li key={mod.clientServiceId} className="flex items-center justify-between text-sm">
                    <span className="text-foreground">{mod.name} <span className="text-muted-foreground">({formatCents(mod.priceCents)}/mo)</span></span>
                    <button
                      onClick={() => billingAction({ action: 'remove-module', clientServiceId: mod.clientServiceId })}
                      disabled={billingInFlight}
                      className="flex items-center gap-1 text-red-600 hover:text-red-700 disabled:opacity-50 text-xs"
                    >
                      <span className="material-icons text-sm">remove_circle_outline</span>
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* Add module */}
            {!billing.bundle && (() => {
              const activeKeys = new Set(billing.modules.map(m => m.slug));
              const available = FEATURE_DOMAINS.filter(d => !activeKeys.has(d.slug));
              if (available.length === 0) return null;
              return (
                <div className="flex items-center gap-2 pt-2 border-t border-border">
                  <span className="material-icons text-base text-muted-foreground">add_circle_outline</span>
                  <select
                    id="add-module-select"
                    defaultValue=""
                    className="flex-1 text-sm border border-border rounded-md px-2 py-1.5 bg-background text-foreground"
                    onChange={(e) => {
                      const slug = e.target.value;
                      if (!slug) return;
                      e.target.value = '';
                      billingAction({ action: 'add-module', slug });
                    }}
                    disabled={billingInFlight}
                  >
                    <option value="">Add module…</option>
                    {available.map((d) => (
                      <option key={d.slug} value={d.slug}>
                        {d.name} ({formatCents(d.monthlyPriceCents)}/mo)
                      </option>
                    ))}
                  </select>
                </div>
              );
            })()}

            {/* Switch to bundle */}
            {!billing.bundle && (
              <div className="pt-2 border-t border-border">
                <button
                  onClick={() => billingAction({ action: 'set-bundle' })}
                  disabled={billingInFlight}
                  className="flex items-center gap-1 text-sm text-primary hover:underline disabled:opacity-50"
                >
                  <span className="material-icons text-base">star</span>
                  Switch to Everything bundle
                </button>
              </div>
            )}
          </div>

          {/* 3. Seats */}
          <div className="bg-card border border-border rounded-lg p-5 space-y-3">
            <div className="flex items-center gap-2">
              <span className="material-icons text-xl text-primary">group</span>
              <h3 className="text-sm font-semibold text-foreground">Seats</h3>
            </div>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Derived</p>
                <p className="font-semibold text-foreground">{billing.seats.derived}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Override</p>
                <p className="font-semibold text-foreground">{billing.seats.override != null ? billing.seats.override : '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Effective</p>
                <p className="font-semibold text-foreground">{billing.seats.effective}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {billing.seats.included} included · {billing.seats.additional} additional ·{' '}
              {formatCents(billing.seats.perSeatCents)}/seat → {formatCents(billing.seats.seatTotalCents)} seat charge
            </p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                value={seatsInput}
                onChange={(e) => setSeatsInput(e.target.value)}
                placeholder="Override seat count"
                className="w-40 text-sm border border-border rounded-md px-2 py-1.5 bg-background text-foreground"
              />
              <button
                onClick={() => {
                  const val = seatsInput.trim() === '' ? null : parseInt(seatsInput, 10);
                  billingAction({ action: 'set-seats', override: val });
                }}
                disabled={billingInFlight}
                className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
              >
                Set
              </button>
              <button
                onClick={() => { setSeatsInput(''); billingAction({ action: 'set-seats', override: null }); }}
                disabled={billingInFlight}
                className="px-3 py-1.5 text-sm border border-border rounded-md hover:bg-muted disabled:opacity-50"
              >
                Clear
              </button>
            </div>
          </div>

          {/* 4. Comp discount */}
          <div className="bg-card border border-border rounded-lg p-5 space-y-3">
            <div className="flex items-center gap-2">
              <span className="material-icons text-xl text-primary">discount</span>
              <h3 className="text-sm font-semibold text-foreground">Comp discount</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Current: {billing.compDiscountPercent != null ? `${billing.compDiscountPercent}%` : 'None'}
              {(billing.compDiscountPercent ?? 0) > 0 && ` (−${formatCents(billing.compDiscountCents)}/mo)`}
            </p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="100"
                value={compInput}
                onChange={(e) => setCompInput(e.target.value)}
                placeholder="0–100"
                className="w-24 text-sm border border-border rounded-md px-2 py-1.5 bg-background text-foreground"
              />
              <span className="text-sm text-muted-foreground">%</span>
              <button
                onClick={() => {
                  const val = compInput.trim() === '' ? null : parseInt(compInput, 10);
                  billingAction({ action: 'set-comp', percent: val });
                }}
                disabled={billingInFlight}
                className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
              >
                Set
              </button>
              <button
                onClick={() => { setCompInput(''); billingAction({ action: 'set-comp', percent: null }); }}
                disabled={billingInFlight}
                className="px-3 py-1.5 text-sm border border-border rounded-md hover:bg-muted disabled:opacity-50"
              >
                Clear
              </button>
            </div>
          </div>

          {/* 5. BYOK eligibility */}
          <div className="bg-card border border-border rounded-lg p-5 space-y-3">
            <div className="flex items-center gap-2">
              <span className="material-icons text-xl text-primary">vpn_key</span>
              <h3 className="text-sm font-semibold text-foreground">BYOK eligibility</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Effective: <span className="font-medium text-foreground">{billing.byokEligible ? 'Eligible' : 'Not eligible'}</span>
              {billing.byokEligibleOverride !== null && (
                <span className="ml-2 text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded">
                  override: {billing.byokEligibleOverride ? 'Granted' : 'Revoked'}
                </span>
              )}
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => billingAction({ action: 'set-byok', override: true })}
                disabled={billingInFlight || billing.byokEligibleOverride === true}
                className="px-3 py-1.5 text-sm border border-border rounded-md hover:bg-muted disabled:opacity-50 flex items-center gap-1"
              >
                <span className="material-icons text-sm">check_circle</span>
                Grant
              </button>
              <button
                onClick={() => billingAction({ action: 'set-byok', override: false })}
                disabled={billingInFlight || billing.byokEligibleOverride === false}
                className="px-3 py-1.5 text-sm border border-border rounded-md hover:bg-muted disabled:opacity-50 flex items-center gap-1"
              >
                <span className="material-icons text-sm">block</span>
                Revoke
              </button>
              <button
                onClick={() => billingAction({ action: 'set-byok', override: null })}
                disabled={billingInFlight || billing.byokEligibleOverride === null}
                className="px-3 py-1.5 text-sm border border-border rounded-md hover:bg-muted disabled:opacity-50 flex items-center gap-1"
              >
                <span className="material-icons text-sm">settings_backup_restore</span>
                Use default
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Switching tiers cancels the prior tier&apos;s <code className="bg-muted px-1 rounded">client_services</code> row and creates a new active row.
        Per-service add-ons (domain, hosting, etc.) are not affected.
      </p>
    </div>
  );
}
