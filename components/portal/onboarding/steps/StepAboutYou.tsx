'use client';

import { useState } from 'react';
import type { StepProps } from './types';
import { ROLE_PRESETS } from '@/lib/onboarding/types';
import { obTile, obTileSel, obChip, obChipOn, obHint } from '../ob-styles';

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
      <div className="grid gap-3 sm:grid-cols-2">
        {ROLE_PRESETS.map((opt) => {
          const active = role === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => choose(opt.id)}
              data-testid={`onboarding-role-${opt.id}`}
              className={`${obTile} ${active ? obTileSel : ''}`}
            >
              <span className={`${obChip} ${active ? obChipOn : ''}`}>
                <span className="material-icons text-xl">{opt.icon}</span>
              </span>
              <span className="text-sm font-semibold">{opt.label}</span>
              {active && (
                <span className="material-icons ml-auto text-primary text-lg">check_circle</span>
              )}
            </button>
          );
        })}
      </div>
      <p className={obHint}>
        <span className="material-icons text-[16px]">bolt</span>
        Tap a role to continue automatically
      </p>
    </div>
  );
}
