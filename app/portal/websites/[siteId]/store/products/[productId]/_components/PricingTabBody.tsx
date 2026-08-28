'use client';
// Extracted verbatim for PUX-210 — see page.tsx `activeTab === 'pricing'` body.

import type { ProductForm } from '../page';
import { pInput, pSectionTitle } from '@/components/portal/portal-ui';

function centsToDollars(cents: number) {
  return cents ? (cents / 100).toFixed(2) : '';
}

function dollarsToCents(dollars: string) {
  const num = parseFloat(dollars);
  return isNaN(num) ? 0 : Math.round(num * 100);
}

interface PricingTabBodyProps {
  form: ProductForm;
  updateField: <K extends keyof ProductForm>(key: K, value: ProductForm[K]) => void;
}

export function PricingTabBody({ form, updateField }: PricingTabBodyProps) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
      <h2 className={`${pSectionTitle} flex items-center gap-2`}>
        <span className="material-icons text-lg text-muted-foreground">payments</span>
        Pricing
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Price ($)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={centsToDollars(form.priceCents)}
            onChange={(e) => updateField('priceCents', dollarsToCents(e.target.value))}
            placeholder="0.00"
            className={pInput}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Compare at Price ($)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={centsToDollars(form.compareAtPriceCents)}
            onChange={(e) => updateField('compareAtPriceCents', dollarsToCents(e.target.value))}
            placeholder="0.00"
            className={pInput}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Cost Price ($)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={centsToDollars(form.costPriceCents)}
            onChange={(e) => updateField('costPriceCents', dollarsToCents(e.target.value))}
            placeholder="0.00"
            className={pInput}
          />
        </div>
      </div>
    </div>
  );
}
