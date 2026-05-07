'use client';

// Admin tier-assignment UI. Lives at /admin/clients/[id]/plan and is reached
// via a link from the client detail page's settings tab. Loads tier catalog
// + currently-active tier in a single round-trip from
// /api/admin/portal/clients/[id]/plan, then POSTs to switch tiers.
//
// Material Icons only — no emoji per repo convention.

import { use, useEffect, useState } from 'react';
import Link from 'next/link';

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

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/portal/clients/${clientId}/plan`)
      .then(r => r.json() as Promise<PlanResponse>)
      .then(d => {
        if (cancelled) return;
        if (!d.success) {
          setError(d.message ?? 'Failed to load plan');
          setLoading(false);
          return;
        }
        setActive(d.data?.active ?? null);
        // Sort by price ascending so Starter -> Growth -> Scale renders left-to-right.
        const sorted = [...(d.data?.catalog ?? [])].sort((a, b) => a.price - b.price);
        setCatalog(sorted);
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
      setSavedAt(Date.now());
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

      <p className="text-xs text-muted-foreground">
        Switching tiers cancels the prior tier&apos;s <code className="bg-muted px-1 rounded">client_services</code> row and creates a new active row.
        Per-service add-ons (domain, hosting, etc.) are not affected.
      </p>
    </div>
  );
}
