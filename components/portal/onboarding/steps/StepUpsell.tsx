'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { StepProps } from './types';
import { BUNDLE, BUNDLE_SLUG, FEATURE_DOMAINS } from '@/lib/billing/domain-catalog';
import { obPrimaryBtn, obChip, obFootbar } from '../ob-styles';

interface ModuleItem {
  key: string;
  slug: string;
  name: string;
  icon: string;
  tagline: string;
  /** Monthly price in cents (from the `price` field on the API response). */
  monthlyPriceCents: number;
  active: boolean;
}

interface BillingData {
  billingMode: string;
  entitlements: {
    domains: string[];
    hasBundle: boolean;
    gatingBypassed: boolean;
  };
  modules: ModuleItem[];
}

type AddState = 'idle' | 'loading' | 'added' | 'checkout' | 'error';

export function StepUpsell({ next }: StepProps) {
  const [data, setData] = useState<BillingData | null>(null);
  const [mounted, setMounted] = useState(false);
  const [addStates, setAddStates] = useState<Record<string, AddState>>({});
  const [bundleState, setBundleState] = useState<AddState>('idle');
  const [addErrors, setAddErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch('/api/portal/billing/modules')
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          setData(json.data as BillingData);
        }
      })
      .catch(() => {})
      .finally(() => setMounted(true));
  }, []);

  // Compute recommendations from owned domains' promotesTo lists.
  const recommendations: ModuleItem[] = (() => {
    if (!data) return [];
    const owned = new Set(data.entitlements.domains);
    // Count how many owned domains promote each key.
    const scores: Record<string, number> = {};
    for (const key of owned) {
      const domain = FEATURE_DOMAINS.find((d) => d.key === key);
      for (const target of domain?.promotesTo ?? []) {
        if (!owned.has(target) && target !== 'bundle') {
          scores[target] = (scores[target] ?? 0) + 1;
        }
      }
    }
    return Object.entries(scores)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([key]) => data.modules.find((m) => m.key === key))
      .filter((m): m is ModuleItem => m !== undefined);
  })();

  // Bundle nudge: show when !hasBundle AND owned >= 2 AND bundle is cheaper than
  // buying all modules individually (i.e. sumOfAllParts > bundlePrice).
  // The "$Y away" copy is BUNDLE.monthlyPriceCents - sumOwned — how much more the
  // client would pay per month to upgrade to the bundle from what they already own.
  const showBundleNudge = (() => {
    if (!data || data.entitlements.hasBundle) return false;
    if (data.entitlements.domains.length < 2) return false;
    // Only show the nudge when the full bundle is cheaper than all individual modules.
    const sumOfAllParts = data.modules.reduce((sum, m) => sum + (m.monthlyPriceCents ?? 0), 0);
    return sumOfAllParts > BUNDLE.monthlyPriceCents;
  })();

  // How much more the user pays per month to unlock everything (positive = upgrade cost).
  const bundleUpgradeCents = (() => {
    if (!data) return 0;
    const owned = data.entitlements.domains;
    const sumOwned = owned.reduce((sum, key) => {
      const m = data.modules.find((mod) => mod.key === key);
      return sum + (m?.monthlyPriceCents ?? 0);
    }, 0);
    return Math.max(0, BUNDLE.monthlyPriceCents - sumOwned);
  })();

  // Auto-advance if there's nothing to show.
  useEffect(() => {
    if (mounted && recommendations.length === 0 && !showBundleNudge) {
      next();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only run when mounted/data changes
  }, [mounted, recommendations.length, showBundleNudge]);

  async function addModule(slug: string, stateKey: string, setFn: (s: AddState) => void) {
    setFn('loading');
    try {
      const res = await fetch('/api/portal/billing/modules/add-item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      });
      const json = await res.json() as { success?: boolean; useCheckout?: boolean };
      if (res.status === 409 && json.useCheckout) {
        setFn('checkout');
      } else if (json.success) {
        setFn('added');
      } else {
        setFn('error');
        setAddErrors((e) => ({ ...e, [stateKey]: 'Something went wrong. Try again.' }));
      }
    } catch {
      setFn('error');
      setAddErrors((e) => ({ ...e, [stateKey]: 'Network error. Try again.' }));
    }
  }

  function handleAddModule(mod: ModuleItem) {
    setAddStates((s) => ({ ...s, [mod.key]: 'loading' }));
    void addModule(mod.slug, mod.key, (state) =>
      setAddStates((s) => ({ ...s, [mod.key]: state })),
    );
  }

  function handleAddBundle() {
    if (!window.confirm('Switch to SimplerDev Complete? This will replace your individual modules with the bundle subscription.')) return;
    setBundleState('loading');
    void addModule(BUNDLE_SLUG, '__bundle__', setBundleState);
  }

  const formatPrice = (cents: number) =>
    `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}/mo`;

  if (!mounted) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
        <span className="material-icons animate-spin mr-2 text-base">refresh</span>
        Loading recommendations…
      </div>
    );
  }

  if (recommendations.length === 0 && !showBundleNudge) {
    // Render nothing — auto-advance effect handles the redirect.
    return null;
  }

  return (
    <div className="space-y-6">
      {recommendations.length > 0 && (
        <div className="space-y-3">
          {recommendations.map((mod) => {
            const st = addStates[mod.key] ?? 'idle';
            return (
              <div
                key={mod.key}
                className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4 transition-all hover:border-foreground/15 hover:bg-muted/20"
              >
                <span className={obChip}><span className="material-icons text-xl">{mod.icon}</span></span>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-semibold text-foreground">{mod.name}</p>
                  <p className="text-[12.5px] text-muted-foreground mt-0.5 line-clamp-2">{mod.tagline}</p>
                  <p className="text-[12px] text-muted-foreground/60 mt-0.5">{formatPrice(mod.monthlyPriceCents)}</p>
                  {st === 'error' && addErrors[mod.key] && (
                    <p className="text-xs text-destructive mt-1">{addErrors[mod.key]}</p>
                  )}
                </div>
                <div className="shrink-0">
                  {st === 'added' ? (
                    <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-emerald-600">
                      <span className="material-icons text-base text-emerald-600">check_circle</span>
                      Added
                    </span>
                  ) : st === 'checkout' ? (
                    <Link
                      href="/portal/settings/billing/plans"
                      className="text-xs text-primary underline hover:text-primary/80 font-medium"
                    >
                      Set up billing
                      <span className="material-icons text-sm align-middle ml-0.5">arrow_forward</span>
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleAddModule(mod)}
                      disabled={st === 'loading'}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-[12.5px] font-semibold text-foreground hover:border-foreground/30 hover:bg-muted/40 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      {st === 'loading' ? (
                        <span className="material-icons text-sm animate-spin">refresh</span>
                      ) : (
                        <span className="material-icons text-sm">add</span>
                      )}
                      Add — {formatPrice(mod.monthlyPriceCents)}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Bundle nudge */}
      {showBundleNudge && (
        <div className={`${obFootbar}`}>
          <span className="material-icons text-foreground shrink-0">star</span>
          <p className="flex-1 text-[13.5px] text-foreground">
            {bundleUpgradeCents > 0 ? (
              <>You&apos;re <strong>{formatPrice(bundleUpgradeCents)}/mo</strong> away from everything</>
            ) : (
              <>Unlock everything for the same price</>
            )}
            {' '}—{' '}
            <button
              type="button"
              onClick={handleAddBundle}
              disabled={bundleState === 'loading' || bundleState === 'added'}
              className="underline text-primary hover:text-primary/80 font-medium disabled:opacity-50"
            >
              Switch to Complete
            </button>
          </p>
          {bundleState === 'loading' && (
            <span className="material-icons text-base animate-spin text-muted-foreground">refresh</span>
          )}
          {bundleState === 'added' && (
            <span className="material-icons text-base text-emerald-600">check_circle</span>
          )}
          {bundleState === 'checkout' && (
            <Link
              href="/portal/settings/billing/plans"
              className="text-xs text-primary underline hover:text-primary/80 font-medium whitespace-nowrap"
            >
              Set up billing
            </Link>
          )}
          {bundleState === 'error' && (
            <span className="text-xs text-destructive">Error — try again</span>
          )}
        </div>
      )}

      <div className="flex items-center justify-end pt-2">
        <button
          type="button"
          onClick={() => next()}
          className={obPrimaryBtn}
        >
          Continue
          <span className="material-icons text-base">arrow_forward</span>
        </button>
      </div>
    </div>
  );
}
