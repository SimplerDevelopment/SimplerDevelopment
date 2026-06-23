'use client';

import { useEffect, useState } from 'react';
import type { StepProps } from './types';
import {
  BUNDLE,
  FEATURE_DOMAINS,
  sumOfModulePricesCents,
  applyVolumeDiscount,
  nextVolumeTier,
  VOLUME_TIERS,
  SEAT_PRICE_CAP_CENTS,
} from '@/lib/billing/domain-catalog';

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

// Where BYOK ("bring your own AI key") enquiries go — no self-serve price.
const BYOK_MAILTO =
  'mailto:sales@simplerdevelopment.com?subject=BYOK%20pricing%20—%20bring%20your%20own%20AI%20key';

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

  // ── Pricing ───────────────────────────────────────────────────────────────
  // Individual modules earn a volume discount (more modules → bigger % off the
  // whole subscription). The bundle is its own flat price — no volume discount.
  const moduleCount = isBundle ? 0 : selected.size;
  const subtotalCents = isBundle
    ? BUNDLE.monthlyPriceCents
    : [...selected].reduce((sum, key) => {
        const m = modules.find((mod) => mod.key === key);
        return sum + (m?.monthlyPriceCents ?? 0);
      }, 0);

  const { discountPercent, discountCents, totalCents } = isBundle
    ? { discountPercent: 0, discountCents: 0, totalCents: subtotalCents }
    : applyVolumeDiscount(subtotalCents, moduleCount);

  const bundlePriceCents = BUNDLE.monthlyPriceCents;
  const sumOfParts = sumOfModulePricesCents();
  const upcoming = nextVolumeTier(moduleCount);
  // Once the discounted total still beats the flat bundle, nudge to the bundle.
  const showBundleSuggestion = !isBundle && selected.size >= 2 && totalCents >= bundlePriceCents;

  async function handleContinue() {
    setSaving(true);
    const selectedArr = [...selected];
    setAnswers({ selectedModules: selectedArr });
    await persist({ step: 'payment', patch: { selectedModules: selectedArr } });
    next({ selectedModules: selectedArr });
    setSaving(false);
  }

  const formatPrice = (cents: number) =>
    `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}/mo`;

  return (
    <div className="space-y-5">
      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
          <span className="material-icons animate-spin mr-2 text-base">refresh</span>
          Loading modules…
        </div>
      ) : (
        <>
          {/* Volume-discount progress — advertises the bulk pricing as you build */}
          {!isBundle && (
            <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
              <div className="flex items-center gap-1.5 flex-wrap text-xs">
                {VOLUME_TIERS.slice().reverse().map((t) => {
                  const unlocked = moduleCount >= t.minModules;
                  return (
                    <span
                      key={t.minModules}
                      className={[
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium',
                        unlocked
                          ? 'bg-primary/10 text-primary'
                          : 'bg-muted text-muted-foreground',
                      ].join(' ')}
                    >
                      <span className="material-icons text-sm">
                        {unlocked ? 'check_circle' : 'lock'}
                      </span>
                      {t.minModules}+ → {t.percentOff}% off
                    </span>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {discountPercent > 0 ? (
                  <span className="text-primary font-medium">
                    {discountPercent}% volume discount unlocked
                  </span>
                ) : (
                  <span>Bundle modules to save — the more you add, the bigger the discount.</span>
                )}
                {upcoming && (
                  <>
                    {' '}
                    Add{' '}
                    <strong className="text-foreground">
                      {upcoming.minModules - moduleCount} more
                    </strong>{' '}
                    to unlock {upcoming.percentOff}% off.
                  </>
                )}
              </p>
            </div>
          )}

          {/* Bundle card — one-click "everything" shortcut */}
          <button
            type="button"
            onClick={() => toggle(BUNDLE_KEY)}
            className={[
              'w-full text-left rounded-xl border-2 p-4 transition-colors',
              isBundle ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50',
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
                    checked ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50',
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

          {/* BYOK — contact sales, not self-serve */}
          <a
            href={BYOK_MAILTO}
            className="block rounded-xl border-2 border-dashed border-border p-3 hover:border-primary/50 transition-colors"
          >
            <div className="flex items-start gap-2">
              <span className="material-icons text-xl text-primary mt-0.5">vpn_key</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <span className="font-medium text-sm">Bring your own AI key (BYOK)</span>
                  <span className="text-xs font-medium text-primary whitespace-nowrap">Contact sales →</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Spend AI tokens at cost on your own provider key, plus white-label &amp; governance. Custom pricing — email us to set it up.
                </p>
              </div>
            </div>
          </a>

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

      {/* Sticky footer */}
      <div className="sticky bottom-0 -mx-6 -mb-8 px-6 pb-6 pt-4 bg-card/95 backdrop-blur border-t border-border mt-6">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            {selected.size === 0 ? (
              <p className="text-sm text-muted-foreground">No modules selected</p>
            ) : isBundle ? (
              <p className="text-sm font-medium">
                {BUNDLE.name} — {formatPrice(bundlePriceCents)}
              </p>
            ) : (
              <p className="text-sm font-medium flex items-baseline gap-2 flex-wrap">
                <span className="text-muted-foreground font-normal">
                  {selected.size} module{selected.size !== 1 ? 's' : ''}
                </span>
                {discountPercent > 0 && (
                  <span className="text-muted-foreground/70 font-normal line-through">
                    {formatPrice(subtotalCents)}
                  </span>
                )}
                <span>{formatPrice(totalCents)}</span>
                {discountPercent > 0 && (
                  <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                    {discountPercent}% off · save {formatPrice(discountCents)}
                  </span>
                )}
              </p>
            )}
            {selected.size > 0 && (
              <span className="block text-xs mt-0.5 text-muted-foreground/70">
                after your 14-day free trial
              </span>
            )}
            <span className="block text-xs mt-1 text-muted-foreground">
              Pricing is for your seat. Add teammates any time — each extra seat is your module total, capped at ${SEAT_PRICE_CAP_CENTS / 100}/mo, billed when they accept.
            </span>
          </div>
          <button
            type="button"
            onClick={handleContinue}
            disabled={selected.size === 0 || saving}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors shrink-0"
          >
            {saving ? <span className="material-icons text-base animate-spin">refresh</span> : null}
            Continue
            <span className="material-icons text-base">arrow_forward</span>
          </button>
        </div>
      </div>
    </div>
  );
}
