'use client';

// One recommendation. Used two ways: interactive in the open list (Mark
// done / Dismiss actions, `readOnly` unset) and inert inside the collapsed
// "Done & dismissed" section (`readOnly` — no actions, a status pill instead).

import { useState } from 'react';
import { formatPct, splitParagraphs, tierClasses } from './format';
import type { Recommendation, RecommendationStatus } from './types';

const btnDone =
  'inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-green-700 dark:text-green-400 transition hover:border-green-500/50 hover:bg-green-500/10 disabled:opacity-50 disabled:cursor-not-allowed';
const btnDismiss =
  'inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition hover:border-foreground/25 hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed';

const STATUS_PILL: Partial<Record<RecommendationStatus, { label: string; icon: string; classes: string }>> = {
  done: {
    label: 'Done',
    icon: 'check_circle',
    classes: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  },
  dismissed: {
    label: 'Dismissed',
    icon: 'block',
    classes: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
  },
};

interface Props {
  rec: Recommendation;
  onMarkDone?: () => void;
  onDismiss?: () => void;
  busy?: boolean;
  error?: string;
  readOnly?: boolean;
}

export function RecommendationCard({ rec, onMarkDone, onDismiss, busy, error, readOnly }: Props) {
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const hasEvidenceDetails = Boolean(rec.evidence.ruleIds?.length || rec.evidence.urls?.length);
  const pill = readOnly ? STATUS_PILL[rec.status] : undefined;

  return (
    <div className={`rounded-2xl border border-border bg-card p-5 ${readOnly ? 'opacity-70' : ''}`}>
      <div className="flex items-start justify-between gap-4">
        <h3 className="font-display text-[15px] font-bold text-foreground leading-snug">{rec.title}</h3>
        <div className="shrink-0 flex flex-col items-center justify-center rounded-xl bg-primary/10 px-3 py-1.5 min-w-16">
          <span className="font-display text-lg font-extrabold tracking-[-0.02em] text-primary leading-none">
            {rec.opportunityScore.toFixed(2)}
          </span>
          <span className="text-[9px] font-semibold uppercase tracking-wide text-primary/70 mt-0.5">Score</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mt-2">
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tierClasses[rec.impact]}`}>
          Impact: {rec.impact}
        </span>
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tierClasses[rec.effort]}`}>
          Effort: {rec.effort}
        </span>
        <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {formatPct(rec.confidence)} confidence
        </span>
        {pill && (
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${pill.classes}`}>
            <span className="material-icons text-xs">{pill.icon}</span>
            {pill.label}
          </span>
        )}
      </div>

      <div className="space-y-2 text-sm text-muted-foreground mt-3">
        {splitParagraphs(rec.body).map((p, i) => (
          <p key={i} className="whitespace-pre-line">
            {p}
          </p>
        ))}
      </div>

      {rec.evidence.summary && (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground/80 italic mt-3">
          <span className="material-icons text-sm shrink-0">fact_check</span>
          {rec.evidence.summary}
        </p>
      )}

      {hasEvidenceDetails && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setEvidenceOpen((v) => !v)}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            aria-expanded={evidenceOpen}
          >
            {evidenceOpen ? 'Hide' : 'Show'} evidence
            <span className="material-icons text-sm">{evidenceOpen ? 'expand_less' : 'expand_more'}</span>
          </button>
          {evidenceOpen && (
            <div className="mt-2 space-y-2">
              {rec.evidence.ruleIds && rec.evidence.ruleIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {rec.evidence.ruleIds.map((id) => (
                    <span key={id} className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-mono text-muted-foreground">
                      {id}
                    </span>
                  ))}
                </div>
              )}
              {rec.evidence.urls && rec.evidence.urls.length > 0 && (
                <ul className="space-y-0.5 max-h-32 overflow-y-auto">
                  {rec.evidence.urls.map((url, i) => (
                    <li key={`${url}-${i}`} className="text-xs font-mono text-muted-foreground truncate">
                      {url}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {!readOnly && (
        <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border">
          <button type="button" onClick={onMarkDone} disabled={busy} className={btnDone}>
            <span className="material-icons text-sm">check_circle</span>
            Mark done
          </button>
          <button type="button" onClick={onDismiss} disabled={busy} className={btnDismiss}>
            <span className="material-icons text-sm">close</span>
            Dismiss
          </button>
          {busy && <span className="material-icons text-sm animate-spin text-muted-foreground">progress_activity</span>}
          {error && <p className="text-xs text-destructive ml-auto">{error}</p>}
        </div>
      )}
    </div>
  );
}
