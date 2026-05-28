'use client';

import { useState } from 'react';
import type { StepProps } from './types';
import { ROLE_PRESETS } from '@/lib/onboarding/types';

export function StepAboutYou({ state, setAnswers, next }: StepProps) {
  const [role, setRole] = useState<string>(state.answers.role ?? '');

  const choose = (id: string) => {
    setRole(id);
    setAnswers({ role: id });
    // small delay so the user sees the selection register before transition
    setTimeout(() => next({ role: id }), 250);
  };

  return (
    <div>
      <p className="mb-4 text-sm text-muted-foreground">What best describes your role?</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {ROLE_PRESETS.map((opt) => {
          const active = role === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => choose(opt.id)}
              data-testid={`onboarding-role-${opt.id}`}
              className={`flex items-center gap-3 rounded-xl border p-4 text-left transition-all ${
                active
                  ? 'border-primary bg-primary/5 ring-2 ring-primary/30'
                  : 'border-border bg-background/60 hover:border-primary/40 hover:bg-primary/5'
              }`}
            >
              <span
                className={`inline-flex h-10 w-10 items-center justify-center rounded-lg ${
                  active ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
                }`}
              >
                <span className="material-icons text-xl">{opt.icon}</span>
              </span>
              <span className="text-sm font-medium">{opt.label}</span>
              {active && (
                <span className="material-icons ml-auto text-primary text-lg">check_circle</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
