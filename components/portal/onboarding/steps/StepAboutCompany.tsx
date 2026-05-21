'use client';

import { useState } from 'react';
import type { StepProps } from './types';
import { COMPANY_SIZES } from '@/lib/onboarding/types';

const INDUSTRY_OPTIONS = [
  'Agency / Consulting', 'Coaching', 'E-commerce', 'Education', 'Healthcare',
  'Real Estate', 'SaaS / Tech', 'Services', 'Non-profit', 'Other',
];

export function StepAboutCompany({ state, setAnswers, next }: StepProps) {
  const [size, setSize] = useState<string>(state.answers.companySize ?? '');
  const [industry, setIndustry] = useState<string>(state.answers.industry ?? '');
  const [website, setWebsite] = useState<string>(state.answers.websiteUrl ?? state.prefill.website ?? '');

  const canContinue = !!size;

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium mb-2">How big is your team?</label>
        <div className="grid gap-2 grid-cols-2 sm:grid-cols-5">
          {COMPANY_SIZES.map((opt) => {
            const active = size === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => { setSize(opt.id); setAnswers({ companySize: opt.id }); }}
                data-testid={`onboarding-size-${opt.id}`}
                className={`rounded-lg border px-3 py-2.5 text-sm font-medium transition-all ${
                  active
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-background/60 hover:border-primary/40'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Industry (optional)</label>
        <select
          value={industry}
          onChange={(e) => { setIndustry(e.target.value); setAnswers({ industry: e.target.value }); }}
          data-testid="onboarding-industry"
          className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
        >
          <option value="">Pick one…</option>
          {INDUSTRY_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Website (optional)</label>
        <input
          type="url"
          value={website}
          onChange={(e) => { setWebsite(e.target.value); setAnswers({ websiteUrl: e.target.value }); }}
          placeholder="https://yourcompany.com"
          data-testid="onboarding-website"
          className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
        />
      </div>

      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={() => next({ companySize: size, industry, websiteUrl: website })}
          disabled={!canContinue}
          data-testid="onboarding-company-next"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Continue
          <span className="material-icons text-base">arrow_forward</span>
        </button>
      </div>
    </div>
  );
}
