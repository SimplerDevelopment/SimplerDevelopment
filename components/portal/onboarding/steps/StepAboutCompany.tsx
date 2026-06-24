'use client';

import { useState } from 'react';
import type { StepProps } from './types';
import { COMPANY_SIZES } from '@/lib/onboarding/types';
import { obLabel, obPill, obPillSel, obSelect, obInput, obPrimaryBtn } from '../ob-styles';

const INDUSTRY_OPTIONS = [
  'Agency / Consulting', 'Coaching', 'E-commerce', 'Education', 'Healthcare',
  'Real Estate', 'SaaS / Tech', 'Services', 'Non-profit', 'Other',
];

export function StepAboutCompany({ state, setAnswers, next }: StepProps) {
  const [size, setSize] = useState<string>(state.answers.companySize ?? '');
  const [industry, setIndustry] = useState<string>(state.answers.industry ?? '');
  // Intentionally NOT prefilling from state.prefill.website. The wizard is
  // asking the user to declare their site, not to confirm a stored value —
  // and the stored value can be stale (e.g. legacy import data) which
  // confuses users on first-run.
  const [website, setWebsite] = useState<string>(state.answers.websiteUrl ?? '');

  const canContinue = !!size;

  return (
    <div className="space-y-6">
      <div>
        <label className={obLabel}>How big is your team?</label>
        <div className="flex flex-wrap gap-2">
          {COMPANY_SIZES.map((opt) => {
            const active = size === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => { setSize(opt.id); setAnswers({ companySize: opt.id }); }}
                data-testid={`onboarding-size-${opt.id}`}
                className={`${obPill} ${active ? obPillSel : ''}`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className={obLabel}>Industry (optional)</label>
        <select
          value={industry}
          onChange={(e) => { setIndustry(e.target.value); setAnswers({ industry: e.target.value }); }}
          data-testid="onboarding-industry"
          className={obSelect}
        >
          <option value="">Pick one…</option>
          {INDUSTRY_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      </div>

      <div>
        <label className={obLabel}>Website (optional)</label>
        <input
          type="url"
          value={website}
          onChange={(e) => { setWebsite(e.target.value); setAnswers({ websiteUrl: e.target.value }); }}
          placeholder="https://yourcompany.com"
          data-testid="onboarding-website"
          className={obInput}
        />
      </div>

      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={() => next({ companySize: size, industry, websiteUrl: website })}
          disabled={!canContinue}
          data-testid="onboarding-company-next"
          className={obPrimaryBtn}
        >
          Continue
          <span className="material-icons text-base">arrow_forward</span>
        </button>
      </div>
    </div>
  );
}
