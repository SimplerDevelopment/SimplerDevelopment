'use client';

import { useState } from 'react';
import type { StepProps } from './types';
import { getSegmentForDomain } from '@/lib/onboarding/module-segments';
import { FEATURE_DOMAINS } from '@/lib/billing/domain-catalog';

export function StepModuleSetup({ state, setAnswers, next }: StepProps) {
  // If the user selected the bundle, walk through the core 5 domains; otherwise
  // use whatever they individually picked.
  const domainKeys: string[] =
    state.answers.selectedModules?.includes('bundle')
      ? ['websites', 'crm', 'email', 'brain', 'projects']
      : (state.answers.selectedModules ?? []);

  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
  // Local copy of moduleSetup — merged into answers on "Continue" of each segment.
  const [moduleSetup, setModuleSetup] = useState<Record<string, string[]>>(
    state.answers.moduleSetup ?? {},
  );

  const currentKey = domainKeys[currentSegmentIndex] ?? '';
  const catalogEntry = FEATURE_DOMAINS.find((d) => d.key === currentKey);
  const segment = getSegmentForDomain(currentKey, catalogEntry);

  const completedKeys: string[] = moduleSetup[currentKey] ?? [];

  function toggleAction(actionKey: string) {
    const current = moduleSetup[currentKey] ?? [];
    const updated = current.includes(actionKey)
      ? current.filter((k) => k !== actionKey)
      : [...current, actionKey];
    const nextSetup = { ...moduleSetup, [currentKey]: updated };
    setModuleSetup(nextSetup);
    setAnswers({ moduleSetup: nextSetup });
  }

  function handleContinue() {
    const isLast = currentSegmentIndex >= domainKeys.length - 1;
    if (isLast) {
      next({ moduleSetup });
    } else {
      setCurrentSegmentIndex((i) => i + 1);
    }
  }

  if (domainKeys.length === 0) {
    // No modules — skip immediately.
    next({});
    return null;
  }

  const isMultiple = domainKeys.length > 1;

  return (
    <div className="space-y-6">
      {/* Pagination indicator */}
      {isMultiple && (
        <p className="text-xs text-muted-foreground font-medium">
          Module {currentSegmentIndex + 1} of {domainKeys.length}
        </p>
      )}

      {/* Segment header */}
      <div>
        <h2 className="text-lg font-semibold">{segment.title}</h2>
        <p className="text-sm text-muted-foreground mt-1">{segment.blurb}</p>
      </div>

      {/* Action rows */}
      <div className="space-y-3">
        {segment.actions.map((action) => {
          const done = completedKeys.includes(action.key);
          return (
            <div
              key={action.key}
              className={[
                'flex items-center gap-4 rounded-xl border p-4 transition-colors',
                done ? 'border-primary/30 bg-primary/5' : 'border-border bg-background/60',
              ].join(' ')}
            >
              {/* Checkbox toggle */}
              <button
                type="button"
                onClick={() => toggleAction(action.key)}
                aria-pressed={done}
                aria-label={done ? `Mark "${action.label}" incomplete` : `Mark "${action.label}" complete`}
                className="shrink-0"
              >
                <span className={['material-icons text-xl', done ? 'text-primary' : 'text-muted-foreground/40'].join(' ')}>
                  {done ? 'check_circle' : 'radio_button_unchecked'}
                </span>
              </button>

              {/* Icon */}
              <span className="material-icons text-xl text-primary shrink-0">{action.icon}</span>

              {/* Text */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{action.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{action.description}</p>
              </div>

              {/* Open link */}
              <a
                href={action.href}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-xs text-primary hover:text-primary/80 font-medium whitespace-nowrap"
              >
                Open
                <span className="material-icons text-sm align-middle ml-0.5">arrow_forward</span>
              </a>
            </div>
          );
        })}
      </div>

      {/* Continue */}
      <div className="flex items-center justify-end pt-2">
        <button
          type="button"
          onClick={handleContinue}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
        >
          {currentSegmentIndex < domainKeys.length - 1 ? 'Next module' : 'Continue'}
          <span className="material-icons text-base">arrow_forward</span>
        </button>
      </div>
    </div>
  );
}
