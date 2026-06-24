'use client';

import { useState } from 'react';
import type { StepProps } from './types';
import { getSegmentForDomain } from '@/lib/onboarding/module-segments';
import { FEATURE_DOMAINS } from '@/lib/billing/domain-catalog';
import { obPrimaryBtn, obGhostBtn, obChip, obChipOn } from '../ob-styles';

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
    <div className="space-y-5">
      {/* Segment header — icon chip + title + progress dots */}
      <div className="flex items-center gap-3 mb-1">
        <span className={[obChip, obChipOn].join(' ')}>
          <span className="material-icons text-[18px]">{catalogEntry?.icon ?? 'checklist'}</span>
        </span>
        <span className="font-extrabold text-[15px] tracking-[-0.01em]">{segment.title}</span>
        {isMultiple && (
          <span className="ml-auto flex gap-1.5">
            {domainKeys.map((_, i) => (
              <i
                key={i}
                className={[
                  'block h-[7px] w-[7px] rounded-full',
                  i === currentSegmentIndex ? 'bg-foreground' : 'bg-border',
                ].join(' ')}
              />
            ))}
          </span>
        )}
      </div>

      {/* Action rows */}
      <div className="flex flex-col gap-2.5">
        {segment.actions.map((action) => {
          const done = completedKeys.includes(action.key);
          return (
            <div
              key={action.key}
              className={[
                'flex items-center gap-3.5 rounded-[13px] border px-[15px] py-[13px] transition-colors bg-card',
                done ? 'border-emerald-400/40 bg-emerald-50/60 dark:bg-emerald-950/20' : 'border-border',
              ].join(' ')}
            >
              {/* Checkbox toggle */}
              <button
                type="button"
                onClick={() => toggleAction(action.key)}
                aria-pressed={done}
                aria-label={done ? `Mark "${action.label}" incomplete` : `Mark "${action.label}" complete`}
                className="shrink-0 grid h-[22px] w-[22px] place-items-center rounded-[7px] border-[1.7px] transition-colors"
                style={{
                  background: done ? '#10b981' : undefined,
                  borderColor: done ? '#10b981' : undefined,
                  color: done ? '#fff' : undefined,
                }}
              >
                {done && <span className="material-icons text-[15px]">check</span>}
              </button>

              {/* Text */}
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-semibold leading-snug">{action.label}</p>
                <p className="text-[12.5px] text-muted-foreground mt-0.5">{action.description}</p>
              </div>

              {/* Open link */}
              <a
                href={action.href}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 inline-flex items-center gap-[3px] text-[13px] font-semibold text-primary hover:text-primary/80 whitespace-nowrap"
              >
                Open
                <span className="material-icons text-[15px]">north_east</span>
              </a>
            </div>
          );
        })}
      </div>

      {/* Actions row */}
      <div className="flex items-center justify-end gap-3 pt-1">
        <button
          type="button"
          onClick={() => next({})}
          className={obGhostBtn}
        >
          Skip module
        </button>
        <button
          type="button"
          onClick={handleContinue}
          className={obPrimaryBtn}
        >
          {currentSegmentIndex < domainKeys.length - 1 ? 'Next module' : 'Continue'}
          <span className="material-icons text-[18px]">arrow_forward</span>
        </button>
      </div>
    </div>
  );
}
