'use client';

import { useState } from 'react';
import type { StepProps } from './types';
import { FEATURE_CATALOG } from '@/lib/onboarding/types';
import { obTile, obTileSel, obChip, obChipOn, obHint, obPrimaryBtn } from '../ob-styles';

export function StepFeatures({ state, setAnswers, next }: StepProps) {
  const [picked, setPicked] = useState<string[]>(state.answers.featuresInterested ?? []);

  const toggle = (id: string) => {
    // Compute next value and update both local + parent state from the event
    // handler. Calling setAnswers() *inside* the setPicked updater ran it
    // during render → "Cannot update a component while rendering another".
    const updated = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id];
    setPicked(updated);
    setAnswers({ featuresInterested: updated });
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
        {FEATURE_CATALOG.map((f) => {
          const active = picked.includes(f.id);
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => toggle(f.id)}
              data-testid={`onboarding-feature-${f.id}`}
              className={`${obTile} ${active ? obTileSel : ''}`}
            >
              <span className={`${obChip} ${active ? obChipOn : ''}`}>
                <span className="material-icons" style={{ fontSize: 19 }}>{f.icon}</span>
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold leading-tight">{f.label}</p>
                <p className="mt-0.5 text-[12.5px] text-muted-foreground line-clamp-2">{f.description}</p>
              </div>
              <span
                className="material-icons ml-auto flex-none text-[18px] transition-opacity"
                style={{ color: active ? 'var(--primary)' : 'transparent' }}
              >
                check_circle
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between pt-1">
        <p className={obHint}>
          <span className="material-icons" style={{ fontSize: 15 }}>interests</span>
          {picked.length === 0 ? 'No pressure — pick zero or all.' : `${picked.length} selected`}
        </p>
        <button
          type="button"
          onClick={() => next({ featuresInterested: picked })}
          data-testid="onboarding-features-next"
          className={obPrimaryBtn}
        >
          Continue
          <span className="material-icons" style={{ fontSize: 18 }}>arrow_forward</span>
        </button>
      </div>
    </div>
  );
}
