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

interface StatusStep {
  key: string;
  done: boolean;
  preCredited: boolean;
  counted: boolean;
}

interface DomainStatus {
  steps: StatusStep[];
  done: number;
  total: number;
  complete: boolean;
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
  const [statuses, setStatuses] = useState<Record<string, DomainStatus>>({});
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch('/api/portal/billing/modules', { signal: controller.signal }).then((r) => r.json()),
      fetch('/api/portal/onboarding', { signal: controller.signal }).then((r) => r.json()),
      fetch('/api/portal/onboarding/status', { signal: controller.signal }).then((r) => r.json()),
    ])
      .then(([billingJson, onboardingJson, statusJson]) => {
        if (billingJson.success) {
          setEntitlements(billingJson.data?.entitlements as EntitlementData);
        }
        if (onboardingJson.success && onboardingJson.data?.answers?.checklistDismissedAt) {
          setDismissed(true);
        }
        if (statusJson.success) {
          setStatuses((statusJson.data?.domains ?? {}) as Record<string, DomainStatus>);
        }
      })
      // Best-effort checklist — ignore failures, including the AbortError a
      // navigation-cancelled fetch throws (see cleanup below).
      .catch(() => {})
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

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
  if (dismissed) return null;

  // Auto-detected progress from the status endpoint. Pre-credited first steps
  // guarantee this is never 0/N (goal gradient — never render an empty bar).
  const domainKeys = entitlements.domains.filter((key) => statuses[key]);
  const totalActions = domainKeys.reduce((sum, key) => sum + statuses[key].total, 0);
  const completedCount = domainKeys.reduce((sum, key) => sum + statuses[key].done, 0);

  // Hide when everything is complete (or the status endpoint gave us nothing).
  if (totalActions === 0 || completedCount >= totalActions) return null;

  const progressPct = Math.round((completedCount / totalActions) * 100);

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
        {domainKeys.map((key) => {
          const status = statuses[key];
          if (status.complete) return null;
          const catalog = FEATURE_DOMAINS.find((d) => d.key === key);
          const segment = getSegmentForDomain(key, catalog);
          const doneByKey = new Map(status.steps.map((s) => [s.key, s.done]));
          return (
            <div key={key}>
              {/* Section heading */}
              <div className="flex items-center gap-2 mb-2">
                {catalog ? (
                  <span className="material-icons text-base text-primary">{catalog.icon}</span>
                ) : null}
                <h3 className="text-sm font-semibold text-foreground">{segment.title}</h3>
              </div>

              {/* Actions — done state is auto-detected server-side, no manual check-off */}
              <div className="space-y-2">
                {segment.actions.map((action) => {
                  const done = doneByKey.get(action.key) ?? false;
                  return (
                    <div
                      key={action.key}
                      className={[
                        'flex items-center gap-3 rounded-lg border p-3 transition-colors',
                        done ? 'border-primary/20 bg-primary/5' : 'border-border',
                      ].join(' ')}
                    >
                      <span
                        className={['material-icons text-lg shrink-0', done ? 'text-primary' : 'text-muted-foreground/40'].join(' ')}
                        aria-label={done ? `${action.label} complete` : `${action.label} pending`}
                      >
                        {done ? 'check_circle' : 'radio_button_unchecked'}
                      </span>

                      <span className="material-icons text-base text-primary shrink-0">{action.icon}</span>

                      <div className="flex-1 min-w-0">
                        <p className={['text-sm font-medium', done ? 'line-through text-muted-foreground' : ''].join(' ')}>
                          {action.label}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{action.description}</p>
                      </div>

                      {!done && (
                        <a
                          href={action.href}
                          className="shrink-0 text-xs text-primary hover:text-primary/80 font-medium whitespace-nowrap"
                          aria-label={`Open ${action.label}`}
                        >
                          Open
                          <span className="material-icons text-sm align-middle ml-0.5">arrow_forward</span>
                        </a>
                      )}
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
