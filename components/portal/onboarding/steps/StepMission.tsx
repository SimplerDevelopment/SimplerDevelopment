'use client';

import { useState } from 'react';
import type { StepProps } from './types';

const EXAMPLES = [
  'We help small landlords manage tenants without spreadsheets.',
  'Boutique design studio for indie SaaS launches.',
  'AI-powered tutoring for high school students learning to code.',
];

export function StepMission({ state, setAnswers, next }: StepProps) {
  const [mission, setMission] = useState<string>(state.answers.mission ?? '');

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-sm font-medium mb-2">
          In one sentence — what does your company actually do?
        </label>
        <textarea
          value={mission}
          onChange={(e) => { setMission(e.target.value); setAnswers({ mission: e.target.value }); }}
          rows={3}
          placeholder="Try to keep it under 25 words…"
          maxLength={500}
          data-testid="onboarding-mission"
          className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none resize-none"
        />
        <p className="mt-1.5 text-xs text-muted-foreground">{mission.length}/500</p>
      </div>

      <div>
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Need inspiration?</p>
        <ul className="space-y-1.5">
          {EXAMPLES.map((ex) => (
            <li key={ex}>
              <button
                type="button"
                onClick={() => { setMission(ex); setAnswers({ mission: ex }); }}
                className="text-left text-sm text-muted-foreground hover:text-primary italic"
              >
                &ldquo;{ex}&rdquo;
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex justify-end pt-1">
        <button
          type="button"
          onClick={() => next({ mission })}
          data-testid="onboarding-mission-next"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
        >
          {mission.trim() ? 'Continue' : 'Skip this'}
          <span className="material-icons text-base">arrow_forward</span>
        </button>
      </div>
    </div>
  );
}
