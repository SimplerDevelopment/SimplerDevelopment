'use client';

/**
 * In-domain getting-started card (spec: vault "Per-Domain Onboarding").
 * Mounted at the top of a domain's landing page; shows the domain's steps
 * with auto-detected done/pending state from /api/portal/onboarding/status.
 *
 * Goal gradient: the registry pre-credits every domain's first step, so this
 * card never shows "0 of N". Hides itself when complete or user-dismissed
 * (dismissal is per-user, persisted in onboarding answers.dismissedDomains).
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { getSegmentForDomain } from '@/lib/onboarding/module-segments';
import { FEATURE_DOMAINS } from '@/lib/billing/domain-catalog';
import { subscribeOnboardingProgress } from '@/lib/onboarding/client-events';

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

export default function DomainGetStarted({ domainKey }: { domainKey: string }) {
  const [status, setStatus] = useState<DomainStatus | null>(null);
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  const [dismissedDomains, setDismissedDomains] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // OBQA-025: scoped to `?domain=` so this only pays for its own domain's
  // detection queries (the un-scoped endpoint computed every entitled
  // domain's steps — the measured cause of this card's slow first paint).
  // Split out so it can be re-run standalone (see the progress-event
  // subscription below) without re-fetching the dismissed-state call.
  const fetchStatus = useCallback(
    (signal?: AbortSignal) =>
      fetch(`/api/portal/onboarding/status?domain=${encodeURIComponent(domainKey)}`, { signal })
        .then((r) => r.json())
        .then((json) => {
          if (json.success) setStatus((json.data?.domains?.[domainKey] as DomainStatus) ?? null);
        })
        .catch((err) => {
          if (err?.name === 'AbortError') return;
          // Best-effort refresh — leave the last-known status in place rather
          // than blanking the card over a transient network error.
        }),
    [domainKey],
  );

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetchStatus(controller.signal),
      fetch('/api/portal/onboarding', { signal: controller.signal }).then((r) => r.json()),
    ])
      .then(([, onboardingJson]) => {
        const dd: string[] = onboardingJson.success ? (onboardingJson.data?.answers?.dismissedDomains ?? []) : [];
        setDismissedDomains(dd);
        setDismissed(dd.includes(domainKey));
      })
      .catch((err) => {
        // A navigation-cancelled fetch (component unmounted as the user routed
        // to another domain page) isn't a real failure — just stop silently
        // instead of flashing "dismissed" state for a request we intentionally
        // killed. Any other failure still fails closed to invisible so it never
        // blocks the page.
        if (err?.name === 'AbortError') return;
        setDismissed(true);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [domainKey, fetchStatus]);

  // OBQA-025: several of this domain's actions (e.g. "Create your first
  // project") complete via an inline form on the SAME page the card is
  // mounted on — no navigation, so this card never remounts to see the new
  // status. Pages that complete a step inline call notifyOnboardingProgress()
  // after a successful create; this refetches just this domain's status.
  useEffect(() => subscribeOnboardingProgress(domainKey, () => void fetchStatus()), [domainKey, fetchStatus]);

  function handleDismiss() {
    setDismissed(true);
    void fetch('/api/portal/onboarding', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers: { dismissedDomains: [...dismissedDomains, domainKey] } }),
    });
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card animate-pulse p-5 mb-4" aria-hidden="true">
        <div className="h-4 bg-muted rounded w-32 mb-3" />
        <div className="h-2 bg-muted rounded w-full mb-2" />
        <div className="h-2 bg-muted rounded w-3/4" />
      </div>
    );
  }

  if (dismissed !== false || !status || status.complete) return null;

  const catalog = FEATURE_DOMAINS.find((d) => d.key === domainKey);
  const segment = getSegmentForDomain(domainKey, catalog);
  const progressPct = status.total > 0 ? Math.round((status.done / status.total) * 100) : 100;
  const doneByKey = new Map(status.steps.map((s) => [s.key, s.done]));

  return (
    <div data-testid="get-started-checklist" className="rounded-xl border border-border bg-card p-5 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {catalog && <span className="material-icons text-primary text-xl">{catalog.icon}</span>}
          <h2 className="font-semibold text-foreground text-base">{segment.title}</h2>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss getting started"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <span className="material-icons text-base">close</span>
        </button>
      </div>

      <div className="mb-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
          <span>{status.done} of {status.total} steps complete</span>
          <span>{progressPct}%</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

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
              <span className={['material-icons text-lg shrink-0', done ? 'text-primary' : 'text-muted-foreground/40'].join(' ')}>
                {done ? 'check_circle' : 'radio_button_unchecked'}
              </span>
              <span className="material-icons text-base text-primary shrink-0">{action.icon}</span>
              <div className="flex-1 min-w-0">
                <p className={['text-sm font-medium', done ? 'line-through text-muted-foreground' : ''].join(' ')}>{action.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{action.description}</p>
              </div>
              {!done && (
                <Link
                  href={action.href}
                  className="shrink-0 text-xs text-primary hover:text-primary/80 font-medium whitespace-nowrap"
                  aria-label={`Open ${action.label}`}
                >
                  Open
                  <span className="material-icons text-sm align-middle ml-0.5">arrow_forward</span>
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
