'use client';

import { TIERS } from '@/lib/billing/domain-catalog';

// ── Helpers ───────────────────────────────────────────────────────────────────

function humanizeCredits(n: number): string {
  if (n % 1_000_000 === 0) return `${n / 1_000_000}M AI tokens/mo`;
  if (n % 1_000 === 0) return `${n / 1_000}K AI tokens/mo`;
  return `${n.toLocaleString()} AI tokens/mo`;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface TierPlansProps {
  onSelect: (slug: string) => void;
  selectedSlug?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TierPlans({ onSelect, selectedSlug }: TierPlansProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {TIERS.map((tier) => {
        const isGrowth = tier.key === 'growth';
        const isSelected = selectedSlug === tier.slug;

        return (
          <div
            key={tier.key}
            className={[
              'relative bg-card border rounded-lg p-5 flex flex-col transition-all',
              isGrowth
                ? 'ring-2 ring-primary border-primary'
                : isSelected
                  ? 'ring-2 ring-primary/20 border-primary/60'
                  : 'border-border',
            ].join(' ')}
          >
            {/* Most popular badge */}
            {isGrowth && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap">
                  Most popular
                </span>
              </div>
            )}

            {/* Name + tagline */}
            <div className="mb-3">
              <h3 className="text-base font-semibold text-foreground">{tier.name}</h3>
              <p className="text-sm text-muted-foreground mt-0.5">{tier.tagline}</p>
            </div>

            {/* Price */}
            <div className="flex items-baseline gap-1 mb-4">
              <span className="text-2xl font-bold text-foreground">
                ${tier.monthlyPriceCents / 100}
              </span>
              <span className="text-sm text-muted-foreground">/seat/mo</span>
            </div>

            {/* AI allowance */}
            <div className="flex items-center gap-2 mb-4">
              <span className="material-icons text-sm text-primary">smart_toy</span>
              <span className="text-xs text-muted-foreground">
                {humanizeCredits(tier.includedAiCredits)}
              </span>
            </div>

            {/* Feature bullets */}
            <ul className="space-y-1.5 mb-4 flex-1">
              {tier.features.map((feat, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-foreground">
                  <span className="material-icons text-sm text-primary mt-0.5 shrink-0">
                    check_circle
                  </span>
                  <span>{feat}</span>
                </li>
              ))}

              {/* BYOK extra line */}
              {tier.byokEligible && (
                <li className="flex items-start gap-2 text-xs text-foreground">
                  <span className="material-icons text-sm text-primary mt-0.5 shrink-0">
                    key
                  </span>
                  <span>Bring your own AI key — spend at cost</span>
                </li>
              )}
            </ul>

            {/* CTA — disabled until tier SKUs are seeded */}
            {/* TODO: enable once tier SKUs are seeded (sync-stripe-products.ts) */}
            <button
              type="button"
              disabled
              onClick={() => onSelect(tier.slug)}
              className="w-full mt-auto px-5 py-2.5 rounded-md text-sm font-semibold bg-primary text-primary-foreground opacity-50 cursor-not-allowed"
            >
              Available soon
            </button>
          </div>
        );
      })}
    </div>
  );
}

export default TierPlans;
