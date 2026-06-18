'use client';

import { useEffect, useState } from 'react';
import { getSegmentForDomain } from '@/lib/onboarding/module-segments';
import { FEATURE_DOMAINS } from '@/lib/billing/domain-catalog';
import type { OnboardingAnswers } from '@/lib/onboarding/types';

interface EntitlementData {
  domains: string[];
  hasBundle: boolean;
  gatingBypassed: boolean;
}

function patchOnboarding(answers: Partial<OnboardingAnswers>) {
  return fetch('/api/portal/onboarding', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers }),
  });
}

export default function GetStartedChecklist() {
  const [entitlements, setEntitlements] = useState<EntitlementData | null>(null);
  const [answers, setAnswersState] = useState<OnboardingAnswers>({});
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch('/api/portal/billing/modules').then((r) => r.json()),
      fetch('/api/portal/onboarding').then((r) => r.json()),
    ])
      .then(([billingJson, onboardingJson]) => {
        if (billingJson.success) {
          setEntitlements(billingJson.data?.entitlements as EntitlementData);
        }
        if (onboardingJson.success) {
          setAnswersState((onboardingJson.data?.answers ?? {}) as OnboardingAnswers);
          if (onboardingJson.data?.answers?.checklistDismissedAt) {
            setDismissed(true);
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function toggleAction(domainKey: string, actionKey: string) {
    const current = answers.moduleSetup?.[domainKey] ?? [];
    const updated = current.includes(actionKey)
      ? current.filter((k) => k !== actionKey)
      : [...current, actionKey];
    const nextSetup = { ...(answers.moduleSetup ?? {}), [domainKey]: updated };
    // Optimistic update
    setAnswersState((a) => ({ ...a, moduleSetup: nextSetup }));
    // Persist in background
    void patchOnboarding({ moduleSetup: nextSetup });
  }

  function handleDismiss() {
    const ts = new Date().toISOString();
    setDismissed(true);
    void patchOnboarding({ checklistDismissedAt: ts });
  }

  // --- Render guards ---
  if (loading) {
    // Show a slim skeleton while loading; the component collapses if not needed.
    return (
      <div className="rounded-xl border border-border bg-card animate-pulse p-5 mb-4">
        <div className="h-4 bg-muted rounded w-32 mb-3" />
        <div className="h-2 bg-muted rounded w-full mb-2" />
        <div className="h-2 bg-muted rounded w-3/4" />
      </div>
    );
  }

  if (!entitlements) return null;
  if (entitlements.gatingBypassed) return null;
  if (entitlements.domains.length === 0) return null;
  if (dismissed || answers.checklistDismissedAt) return null;

  // Compute all segments and check completeness.
  const segments = entitlements.domains.map((key) => {
    const catalog = FEATURE_DOMAINS.find((d) => d.key === key);
    return getSegmentForDomain(key, catalog);
  });

  const totalActions = segments.reduce((sum, s) => sum + s.actions.length, 0);
  const completedCount = segments.reduce((sum, s) => {
    const done = answers.moduleSetup?.[s.domainKey] ?? [];
    return sum + s.actions.filter((a) => done.includes(a.key)).length;
  }, 0);

  // Hide when everything is complete.
  if (totalActions > 0 && completedCount >= totalActions) return null;

  const progressPct = totalActions > 0 ? Math.round((completedCount / totalActions) * 100) : 0;

  return (
    <div className="rounded-xl border border-border bg-card p-5 mb-4">
      {/* Heading row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="material-icons text-primary text-xl">rocket_launch</span>
          <h2 className="font-semibold text-foreground text-base">Get started</h2>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss checklist"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <span className="material-icons text-base">close</span>
        </button>
      </div>

      {/* Progress bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
          <span>{completedCount} of {totalActions} steps complete</span>
          <span>{progressPct}%</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Segments */}
      <div className="space-y-5">
        {segments.map((segment) => {
          const doneKeys = answers.moduleSetup?.[segment.domainKey] ?? [];
          return (
            <div key={segment.domainKey}>
              {/* Section heading */}
              <div className="flex items-center gap-2 mb-2">
                {(() => {
                  const catalog = FEATURE_DOMAINS.find((d) => d.key === segment.domainKey);
                  return catalog ? (
                    <span className="material-icons text-base text-primary">{catalog.icon}</span>
                  ) : null;
                })()}
                <h3 className="text-sm font-semibold text-foreground">{segment.title}</h3>
              </div>

              {/* Actions */}
              <div className="space-y-2">
                {segment.actions.map((action) => {
                  const done = doneKeys.includes(action.key);
                  return (
                    <div
                      key={action.key}
                      className={[
                        'flex items-center gap-3 rounded-lg border p-3 transition-colors',
                        done ? 'border-primary/20 bg-primary/5' : 'border-border',
                      ].join(' ')}
                    >
                      <button
                        type="button"
                        onClick={() => toggleAction(segment.domainKey, action.key)}
                        aria-pressed={done}
                        aria-label={done ? `Mark "${action.label}" incomplete` : `Mark "${action.label}" complete`}
                        className="shrink-0"
                      >
                        <span className={['material-icons text-lg', done ? 'text-primary' : 'text-muted-foreground/40'].join(' ')}>
                          {done ? 'check_circle' : 'radio_button_unchecked'}
                        </span>
                      </button>

                      <span className="material-icons text-base text-primary shrink-0">{action.icon}</span>

                      <div className="flex-1 min-w-0">
                        <p className={['text-sm font-medium', done ? 'line-through text-muted-foreground' : ''].join(' ')}>
                          {action.label}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{action.description}</p>
                      </div>

                      <a
                        href={action.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 text-xs text-primary hover:text-primary/80 font-medium whitespace-nowrap"
                        aria-label={`Open ${action.label}`}
                      >
                        Open
                        <span className="material-icons text-sm align-middle ml-0.5">arrow_forward</span>
                      </a>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
