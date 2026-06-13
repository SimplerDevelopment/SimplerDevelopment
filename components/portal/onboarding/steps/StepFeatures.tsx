'use client';

import { useState } from 'react';
import type { StepProps } from './types';
import { FEATURE_CATALOG } from '@/lib/onboarding/types';

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
              className={`group relative flex items-start gap-3 rounded-xl border p-4 text-left transition-all ${
                active
                  ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                  : 'border-border bg-background/60 hover:border-primary/40'
              }`}
            >
              <span
                className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors ${
                  active ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground group-hover:bg-primary/15 group-hover:text-primary'
                }`}
              >
                <span className="material-icons text-xl">{f.icon}</span>
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{f.label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{f.description}</p>
              </div>
              {active && (
                <span className="material-icons absolute right-3 top-3 text-primary text-base">check_circle</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between pt-1">
        <p className="text-xs text-muted-foreground">
          {picked.length === 0 ? 'No pressure — pick zero or all ten.' : `${picked.length} selected`}
        </p>
        <button
          type="button"
          onClick={() => next({ featuresInterested: picked })}
          data-testid="onboarding-features-next"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
        >
          Continue
          <span className="material-icons text-base">arrow_forward</span>
        </button>
      </div>
    </div>
  );
}
