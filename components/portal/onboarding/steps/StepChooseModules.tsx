'use client';

import { useEffect, useState } from 'react';
import type { StepProps } from './types';
import { BUNDLE, FEATURE_DOMAINS, sumOfModulePricesCents } from '@/lib/billing/domain-catalog';
import { TierPlans } from '@/components/portal/billing/TierPlans';

interface ModuleItem {
  key: string;
  slug: string;
  name: string;
  tagline: string;
  icon: string;
  monthlyPriceCents: number;
  purchasable: boolean;
}

const BUNDLE_KEY = 'bundle';

export function StepChooseModules({ state, setAnswers, persist, next }: StepProps) {
  const [modules, setModules] = useState<ModuleItem[]>([]);
  const [loading, setLoading] = useState(true);
  // Seed selection lazily: localStorage cart → previously saved answers → empty.
  // Using a lazy initializer avoids a setState-in-effect pattern.
  const [selected, setSelected] = useState<Set<string>>(() => {
    try {
      const cart = localStorage.getItem('sd-signup-cart');
      if (cart) {
        const keys = cart.split(',').map((k) => k.trim()).filter(Boolean);
        if (keys.length) {
          localStorage.removeItem('sd-signup-cart');
          return new Set(keys);
        }
      }
    } catch {}
    if (state.answers.selectedModules?.length) {
      return new Set(state.answers.selectedModules);
    }
    return new Set<string>();
  });
  const [saving, setSaving] = useState(false);
  const [selectedTierSlug, setSelectedTierSlug] = useState<string>('');
  const [showCustomize, setShowCustomize] = useState(false);

  // Load live module catalog from the billing API
  useEffect(() => {
    fetch('/api/portal/billing/modules')
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          const items: ModuleItem[] = (json.data?.modules ?? []).map(
            (m: { key: string; slug: string; name: string; tagline: string; icon: string; monthlyPriceCents: number; purchasable?: boolean }) => ({
              key: m.key,
              slug: m.slug,
              name: m.name,
              tagline: m.tagline,
              icon: m.icon,
              monthlyPriceCents: m.monthlyPriceCents,
              purchasable: m.purchasable !== false,
            }),
          );
          setModules(items);
        } else {
          // Fallback to static catalog
          setModules(
            FEATURE_DOMAINS.map((d) => ({
              key: d.key,
              slug: d.slug,
              name: d.name,
              tagline: d.tagline,
              icon: d.icon,
              monthlyPriceCents: d.monthlyPriceCents,
              purchasable: true,
            })),
          );
        }
      })
      .catch(() => {
        setModules(
          FEATURE_DOMAINS.map((d) => ({
            key: d.key,
            slug: d.slug,
            name: d.name,
            tagline: d.tagline,
            icon: d.icon,
            monthlyPriceCents: d.monthlyPriceCents,
            purchasable: true,
          })),
        );
      })
      .finally(() => setLoading(false));
  }, []);

  const isBundle = selected.has(BUNDLE_KEY);

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (key === BUNDLE_KEY) {
        // Selecting bundle deselects all individual modules
        if (next.has(BUNDLE_KEY)) {
          next.delete(BUNDLE_KEY);
        } else {
          next.clear();
          next.add(BUNDLE_KEY);
        }
      } else {
        // Selecting an individual module deselects bundle
        next.delete(BUNDLE_KEY);
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.add(key);
        }
      }
      return next;
    });
  }

  function switchToBundle() {
    setSelected(new Set([BUNDLE_KEY]));
  }

  // Running total in cents
  const totalCents = isBundle
    ? BUNDLE.monthlyPriceCents
    : [...selected].reduce((sum, key) => {
        const m = modules.find((mod) => mod.key === key);
        return sum + (m?.monthlyPriceCents ?? 0);
      }, 0);

  const bundlePriceCents = BUNDLE.monthlyPriceCents;
  const sumOfParts = sumOfModulePricesCents();
  // Show bundle suggestion when ≥2 modules are selected and cost ≥ bundle price
  const showBundleSuggestion =
    !isBundle && selected.size >= 2 && totalCents >= bundlePriceCents;

  async function handleContinue() {
    setSaving(true);
    const selectedArr = [...selected];
    setAnswers({ selectedModules: selectedArr });
    await persist({ step: 'payment', patch: { selectedModules: selectedArr } });
    next({ selectedModules: selectedArr });
    setSaving(false);
  }

  // Tier checkout: a single-line-item subscription for the chosen plan. First
  // self-serve subscription per client gets the 14-day card-required trial
  // (stamped by the Stripe webhook on activation).
  async function handleTierCheckout(slug: string) {
    setSelectedTierSlug(slug);
    setSaving(true);
    try {
      const res = await fetch('/api/portal/billing/modules/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, returnTo: 'onboarding' }),
      });
      const json = await res.json();
      if (json?.success && json.data?.url) { window.location.href = json.data.url; return; }
      setSaving(false);
    } catch {
      setSaving(false);
    }
  }

  const formatPrice = (cents: number) =>
    `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}/mo`;

  return (
    <div className="space-y-6">
      {/* Tier plans — shown above the module selector */}
      <div className="mb-6">
        <h3 className="text-base font-semibold text-foreground mb-1">Choose your plan</h3>
        <p className="text-xs text-muted-foreground mb-4">Or customize below.</p>
        <TierPlans
          selectedSlug={selectedTierSlug}
          busySlug={saving ? selectedTierSlug : undefined}
          onSelect={handleTierCheckout}
        />
      </div>

      {/* Customize toggle + collapsible module selector */}
      <div>
        <button
          type="button"
          onClick={() => setShowCustomize((v) => !v)}
          className="text-sm text-primary underline font-medium mb-4"
        >
          {showCustomize ? 'Hide custom modules ▴' : 'Customize / build your own plan ▾'}
        </button>
        {showCustomize && (
          <>
      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
          <span className="material-icons animate-spin mr-2 text-base">refresh</span>
          Loading modules…
        </div>
      ) : (
        <>
          {/* Bundle card */}
          <button
            type="button"
            onClick={() => toggle(BUNDLE_KEY)}
            className={[
              'w-full text-left rounded-xl border-2 p-4 transition-colors',
              isBundle
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50',
            ].join(' ')}
            aria-pressed={isBundle}
          >
            <div className="flex items-start gap-3">
              <span className="material-icons text-2xl text-primary mt-0.5">{BUNDLE.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">{BUNDLE.name}</span>
                  <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                    Save {Math.round((1 - bundlePriceCents / sumOfParts) * 100)}%
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{BUNDLE.tagline}</p>
              </div>
              <span className="font-bold text-sm whitespace-nowrap">{formatPrice(bundlePriceCents)}</span>
              <span className={['material-icons text-lg', isBundle ? 'text-primary' : 'text-muted-foreground/40'].join(' ')}>
                {isBundle ? 'check_circle' : 'radio_button_unchecked'}
              </span>
            </div>
          </button>

          <div className="relative flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">or pick individually</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Module grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {modules.map((mod) => {
              const checked = selected.has(mod.key);
              return (
                <button
                  key={mod.key}
                  type="button"
                  onClick={() => toggle(mod.key)}
                  disabled={!mod.purchasable}
                  className={[
                    'text-left rounded-xl border-2 p-3 transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
                    checked
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50',
                  ].join(' ')}
                  aria-pressed={checked}
                >
                  <div className="flex items-start gap-2">
                    <span className="material-icons text-xl text-primary mt-0.5">{mod.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-medium text-sm truncate">{mod.name}</span>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">{formatPrice(mod.monthlyPriceCents)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{mod.tagline}</p>
                    </div>
                    <span className={['material-icons text-base shrink-0', checked ? 'text-primary' : 'text-muted-foreground/40'].join(' ')}>
                      {checked ? 'check_circle' : 'radio_button_unchecked'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Bundle upsell banner */}
          {showBundleSuggestion && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 flex items-center gap-3">
              <span className="material-icons text-primary">star</span>
              <p className="flex-1 text-sm text-foreground">
                Get <strong>everything</strong> for {formatPrice(bundlePriceCents)} —{' '}
                <button
                  type="button"
                  onClick={switchToBundle}
                  className="underline text-primary hover:text-primary/80 font-medium"
                >
                  switch to SimplerDev Complete
                </button>
              </p>
            </div>
          )}
        </>
      )}
          </>
        )}
      </div>

      {/* Sticky footer */}
      <div className="sticky bottom-0 -mx-6 -mb-8 px-6 pb-6 pt-4 bg-card/95 backdrop-blur border-t border-border mt-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {selected.size === 0
              ? 'No modules selected'
              : isBundle
                ? `${BUNDLE.name} — ${formatPrice(bundlePriceCents)}`
                : `${selected.size} module${selected.size !== 1 ? 's' : ''} — ${formatPrice(totalCents)}`}
            {selected.size > 0 && (
              <span className="block text-xs mt-0.5 text-muted-foreground/70">
                after your 14-day free trial
              </span>
            )}
          </p>
          <button
            type="button"
            onClick={handleContinue}
            disabled={selected.size === 0 || saving}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
          >
            {saving ? (
              <span className="material-icons text-base animate-spin">refresh</span>
            ) : null}
            Continue
            <span className="material-icons text-base">arrow_forward</span>
          </button>
        </div>
      </div>
    </div>
  );
}
