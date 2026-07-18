'use client';

import { useEffect, useState } from 'react';
import type { StepProps } from './types';
import { getSegmentForDomain, wizardTierFor } from '@/lib/onboarding/module-segments';
import { FEATURE_DOMAINS } from '@/lib/billing/domain-catalog';
import { WebsitesSetupForm } from '../setup-forms/WebsitesSetupForm';
import { BookingsSetupForm } from '../setup-forms/BookingsSetupForm';
import { BrainNoteSetupForm } from '../setup-forms/BrainNoteSetupForm';
import { obPrimaryBtn, obGhostBtn, obChip, obChipOn } from '../ob-styles';

/** Per-step done flags from /api/portal/onboarding/status, keyed by action key. */
type DomainStepStatus = Record<string, boolean>;

export function StepModuleSetup({ state, next }: StepProps) {
  // If the user selected the bundle, walk through the core 5 domains; otherwise
  // use whatever they individually picked.
  const domainKeys: string[] =
    state.answers.selectedModules?.includes('bundle')
      ? ['websites', 'crm', 'email', 'brain', 'projects']
      : (state.answers.selectedModules ?? []);

  // OBQA-028 re-triage (card 563): 'summary'-tier modules never get their own
  // walk segment — they're grouped onto one final "Also activated" screen.
  // 'acknowledge'-tier modules (surveys) still get a segment, just rendered
  // without pending-action rows. Both are still db-free lookups.
  const walkKeys = domainKeys.filter((k) => wizardTierFor(k) !== 'summary');
  const summaryKeys = domainKeys.filter((k) => wizardTierFor(k) === 'summary');
  const totalSegments = walkKeys.length + (summaryKeys.length > 0 ? 1 : 0);

  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
  // domainKey -> action key -> done (live detections; refetched after inline creates)
  const [status, setStatus] = useState<Record<string, DomainStepStatus>>({});

  async function refetchStatus() {
    try {
      const res = await fetch('/api/portal/onboarding/status');
      const json = await res.json();
      if (!json?.success) return;
      const domains = json.data?.domains ?? {};
      const map: Record<string, DomainStepStatus> = {};
      for (const [key, d] of Object.entries<{ steps: { key: string; done: boolean }[] }>(domains)) {
        map[key] = Object.fromEntries(d.steps.map((s) => [s.key, s.done]));
      }
      setStatus(map);
    } catch {
      /* detections are progressive enhancement — rows just show pending */
    }
  }

  useEffect(() => {
    void refetchStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The summary screen is the terminal segment when there are any summary-tier
  // modules — it always lands at index === walkKeys.length.
  const isSummaryScreen = summaryKeys.length > 0 && currentSegmentIndex === walkKeys.length;
  const currentKey = isSummaryScreen ? '' : (walkKeys[currentSegmentIndex] ?? '');
  const catalogEntry = FEATURE_DOMAINS.find((d) => d.key === currentKey);
  const segment = getSegmentForDomain(currentKey, catalogEntry);

  function handleContinue() {
    const isLast = currentSegmentIndex >= totalSegments - 1;
    if (isLast) {
      // Completion is auto-detected server-side now (/api/portal/onboarding/status);
      // this step is a guided tour, not a manual checklist.
      next({});
    } else {
      setCurrentSegmentIndex((i) => i + 1);
    }
  }

  if (domainKeys.length === 0) {
    // No modules — skip immediately.
    next({});
    return null;
  }

  const isMultiple = totalSegments > 1;
  const domainStatus = status[currentKey] ?? {};
  const isAcknowledge = !isSummaryScreen && wizardTierFor(currentKey) === 'acknowledge';

  /**
   * Inline setup forms, per domain + action: instead of a checkbox that links
   * elsewhere, the actual configuration form is embedded (websites, bookings,
   * and brain's first-note action so far; other walk-tier modules migrate
   * here one by one).
   */
  function inlineFormFor(actionKey: string): React.ReactNode | null {
    if (currentKey === 'websites' && actionKey === 'create-site') {
      return (
        <WebsitesSetupForm onCreated={() => void refetchStatus()} />
      );
    }
    if (currentKey === 'bookings' && actionKey === 'create-page') {
      return (
        <BookingsSetupForm onCreated={() => void refetchStatus()} />
      );
    }
    if (currentKey === 'brain' && actionKey === 'add-knowledge') {
      return (
        <BrainNoteSetupForm onCreated={() => void refetchStatus()} />
      );
    }
    return null;
  }

  /**
   * Actions hidden in the wizard (per domain): deeper tool work that belongs
   * inside the product, not in setup. They stay in the shared registry so the
   * portal's DomainGetStarted cards and progress detection keep tracking them —
   * the wizard just points at them with the "once you're in" line instead.
   */
  const HIDDEN_IN_WIZARD: Record<string, string[]> = {
    websites: ['visual-editor', 'setup-nav'],
    bookings: ['first-booking'],
  };
  const visibleActions = isSummaryScreen
    ? []
    : segment.actions.filter((a) => !(HIDDEN_IN_WIZARD[currentKey] ?? []).includes(a.key));
  const hiddenCount = isSummaryScreen ? 0 : segment.actions.length - visibleActions.length;

  return (
    <div className="space-y-5">
      {/* Segment header — icon chip + title + progress dots */}
      <div className="flex items-center gap-3 mb-1">
        <span className={[obChip, obChipOn].join(' ')}>
          <span className="material-icons text-[18px]">
            {isSummaryScreen ? 'auto_awesome' : (catalogEntry?.icon ?? 'checklist')}
          </span>
        </span>
        <span className="font-extrabold text-[15px] tracking-[-0.01em]">
          {isSummaryScreen ? 'Also activated' : segment.title}
        </span>
        {isMultiple && (
          <span className="ml-auto flex gap-1.5">
            {Array.from({ length: totalSegments }).map((_, i) => (
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

      {isSummaryScreen ? (
        /* Summary screen — grouped, explain-only rows for summary-tier modules
         * (no per-module walk, no create-pressure; also sidesteps the
         * LinkedIn-OAuth-mid-wizard awkwardness for publishing). */
        <div className="flex flex-col gap-2.5">
          {summaryKeys.map((key) => {
            const entry = FEATURE_DOMAINS.find((d) => d.key === key);
            const seg = getSegmentForDomain(key, entry);
            const href = seg.actions[0]?.href ?? '/portal/dashboard';
            return (
              <a
                key={key}
                href={href}
                className="flex items-center gap-3.5 rounded-[13px] border border-emerald-400/40 bg-emerald-50/60 dark:bg-emerald-950/20 px-[15px] py-[13px] transition-colors"
              >
                <span
                  className="shrink-0 grid h-[22px] w-[22px] place-items-center rounded-[7px] border-[1.7px]"
                  style={{ background: '#10b981', borderColor: '#10b981', color: '#fff' }}
                >
                  <span className="material-icons text-[15px]">check</span>
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-semibold leading-snug">{entry?.name ?? key}</p>
                  <p className="text-[12.5px] text-muted-foreground mt-0.5">
                    Activated — needs a bit more setup when you&apos;re ready.
                  </p>
                </div>
                <span className="material-icons text-[18px] text-muted-foreground shrink-0">
                  chevron_right
                </span>
              </a>
            );
          })}
        </div>
      ) : isAcknowledge ? (
        /* Acknowledge tier (surveys): active, but no create-pressure — a
         * single done row plus a pointer to go create one whenever, no
         * pending action rows. */
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center gap-3.5 rounded-[13px] border border-emerald-400/40 bg-emerald-50/60 dark:bg-emerald-950/20 px-[15px] py-[13px]">
            <span
              aria-label={`${segment.actions[0]?.label ?? segment.title} complete`}
              className="shrink-0 grid h-[22px] w-[22px] place-items-center rounded-[7px] border-[1.7px]"
              style={{ background: '#10b981', borderColor: '#10b981', color: '#fff' }}
            >
              <span className="material-icons text-[15px]">check</span>
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-semibold leading-snug">{segment.actions[0]?.label}</p>
              <p className="text-[12.5px] text-muted-foreground mt-0.5">
                {segment.actions[0]?.description}
              </p>
            </div>
          </div>
          <p className="text-[12.5px] text-muted-foreground px-1 pt-0.5">
            Create your first survey whenever you need it — Surveys is in your sidebar.
          </p>
        </div>
      ) : (
        /* Walk tier — action rows; an action with a pending inline form
         * renders the form instead. */
        <div className="flex flex-col gap-2.5">
          {visibleActions.map((action) => {
            const done = Boolean(domainStatus[action.key] ?? action.preCredited);

            const form = !done && inlineFormFor(action.key);
            if (form) return <div key={action.key}>{form}</div>;

            return (
              <div
                key={action.key}
                className={[
                  'flex items-center gap-3.5 rounded-[13px] border px-[15px] py-[13px] transition-colors bg-card',
                  done ? 'border-emerald-400/40 bg-emerald-50/60 dark:bg-emerald-950/20' : 'border-border',
                ].join(' ')}
              >
                {/* Auto-detected status (pre-credited steps start done — never 0%) */}
                <span
                  aria-label={done ? `${action.label} complete` : `${action.label} pending`}
                  className="shrink-0 grid h-[22px] w-[22px] place-items-center rounded-[7px] border-[1.7px]"
                  style={{
                    background: done ? '#10b981' : undefined,
                    borderColor: done ? '#10b981' : undefined,
                    color: done ? '#fff' : undefined,
                  }}
                >
                  {done && <span className="material-icons text-[15px]">check</span>}
                </span>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-semibold leading-snug">{action.label}</p>
                  <p className="text-[12.5px] text-muted-foreground mt-0.5">{action.description}</p>
                </div>
              </div>
            );
          })}

          {hiddenCount > 0 && (
            <p className="text-[12.5px] text-muted-foreground px-1 pt-0.5">
              Publishing your first page, navigation, and the rest — you can do this once you&apos;re in.
            </p>
          )}
        </div>
      )}

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
          {currentSegmentIndex < totalSegments - 1 ? 'Next module' : 'Continue'}
          <span className="material-icons text-[18px]">arrow_forward</span>
        </button>
      </div>
    </div>
  );
}
