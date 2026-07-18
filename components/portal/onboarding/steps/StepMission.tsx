'use client';

import { useState } from 'react';
import type { StepProps } from './types';
import { obLabel, obHint, obTextarea, obPrimaryBtn } from '../ob-styles';

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
        <label className={obLabel}>
          In one sentence — what does your company actually do?
        </label>
        <textarea
          value={mission}
          onChange={(e) => { setMission(e.target.value); setAnswers({ mission: e.target.value }); }}
          rows={3}
          placeholder="Try to keep it under 25 words…"
          maxLength={500}
          data-testid="onboarding-mission"
          className={obTextarea}
        />
        <p className="mt-1.5 text-right text-[12px] text-muted-foreground">{mission.length}/500</p>
      </div>

      <div>
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-3">
          Need a nudge? Try one of these:
        </p>
        <ul className="flex flex-col gap-2">
          {EXAMPLES.map((ex) => (
            <li key={ex}>
              <button
                type="button"
                onClick={() => { setMission(ex); setAnswers({ mission: ex }); }}
                className="text-left text-[13.5px] italic text-primary transition-opacity hover:opacity-75"
              >
                &ldquo;{ex}&rdquo;
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex items-center justify-between pt-1">
        <p className={obHint}>
          <span className="material-icons" style={{ fontSize: 15 }}>lightbulb</span>
          You can refine this anytime from your dashboard.
        </p>
        <button
          type="button"
          onClick={() => next({ mission })}
          data-testid="onboarding-mission-next"
          className={obPrimaryBtn}
        >
          {mission.trim() ? 'Continue' : 'Skip this'}
          <span className="material-icons" style={{ fontSize: 18 }}>arrow_forward</span>
        </button>
      </div>
    </div>
  );
}
