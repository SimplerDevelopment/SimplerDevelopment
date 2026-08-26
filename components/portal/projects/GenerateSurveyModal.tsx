'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { pBtnPrimary, pBtnGhost } from '@/components/portal/portal-ui';

export type ProjectSurveyPreset = 'qa_review' | 'stakeholder_feedback' | 'retro';

interface GeneratedSurveyData {
  survey: { id: number; slug: string; title: string; status: string };
  approvalUrl: string | null;
  publicPath: string;
  artifactId: number;
  reviewedCardIds: number[];
}

interface GenerateSurveyModalProps {
  projectId: number;
  open: boolean;
  onClose: () => void;
  onGenerated?: (data: GeneratedSurveyData) => void;
}

// One-line descriptions mirror what each preset actually builds — see the
// buildQaReview / buildStakeholderFeedback / buildRetro doc comments in
// lib/projects/generate-survey.ts (PUX-033 step 1) for the full field list.
const PRESETS: { value: ProjectSurveyPreset; label: string; description: string }[] = [
  {
    value: 'qa_review',
    label: 'QA review',
    description: 'One section per card in Validating or Approved, with a pass/fail verdict and notes.',
  },
  {
    value: 'stakeholder_feedback',
    label: 'Stakeholder feedback',
    description: 'Milestone check-in with an NPS score and an on-track / at-risk / off-track pulse.',
  },
  {
    value: 'retro',
    label: 'Retro',
    description: "What went well, what didn't go well, and what to change next time.",
  },
];

// Focus-trap target selector, matching the pattern in
// components/portal/CrmAddContactModal.tsx (PUX-018 lineage) — there is no
// shared Modal/Dialog primitive in the repo, every hand-rolled dialog repeats
// this.
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * "Generate survey" dialog for the project header (PUX-033 step 4). Calls
 * `POST /api/portal/projects/[id]/surveys/generate` with the chosen preset
 * and surfaces the approval URL, public path and reviewed-card count from the
 * response.
 *
 * The parent (ProjectSurveyAction) only mounts this while `open` is true —
 * matching CrmAddDealModal's pattern — so every open is a fresh mount and
 * `useState` initializers are enough to reset state; there is no
 * open-triggered reset effect (that pattern trips the
 * react-hooks/set-state-in-effect lint rule for no benefit here). `open` is
 * still an explicit prop so this component's contract doesn't depend on the
 * caller's mount strategy.
 */
export default function GenerateSurveyModal({ projectId, open, onClose, onGenerated }: GenerateSurveyModalProps) {
  const [preset, setPreset] = useState<ProjectSurveyPreset>('qa_review');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');
  const [result, setResult] = useState<GeneratedSurveyData | null>(null);
  const [copied, setCopied] = useState(false);

  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // Escape-to-close + focus trap, mirroring CrmAddContactModal.
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const container = dialogRef.current;
    const first = container?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    first?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !container) return;
      const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        .filter((el) => el.offsetParent !== null);
      if (focusable.length === 0) return;
      const firstEl = focusable[0];
      const lastEl = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  async function handleGenerate() {
    setStatus('loading');
    setError('');
    const res = await fetch(`/api/portal/projects/${projectId}/surveys/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preset }),
    });
    const d = await res.json();
    if (!d.success) {
      setStatus('error');
      setError(d.error ?? 'Failed to generate survey.');
      return;
    }
    setStatus('success');
    setResult(d.data);
    onGenerated?.(d.data);
  }

  async function handleCopy() {
    if (!result?.approvalUrl) return;
    try {
      await navigator.clipboard.writeText(result.approvalUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can be unavailable (older browser, denied permission) —
      // the URL is still shown as readonly text, so this is a soft failure.
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="bg-card border border-border rounded-2xl shadow-2xl my-8 w-full max-w-xl overflow-hidden"
      >
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 id={titleId} className="font-semibold text-foreground">Generate survey</h3>
            <button type="button" onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground">
              <span className="material-icons text-base">close</span>
            </button>
          </div>

          {status === 'success' && result ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-foreground bg-primary/10 border border-primary/20 rounded-xl px-3 py-2">
                <span className="material-icons text-base text-primary">check_circle</span>
                <span className="font-semibold">{result.survey.title}</span>
              </div>
              {preset === 'qa_review' && (
                <p className="text-sm text-muted-foreground">
                  {result.reviewedCardIds.length} card{result.reviewedCardIds.length === 1 ? '' : 's'} will be reviewed.
                </p>
              )}
              {result.approvalUrl && (
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Approval URL</label>
                  <div className="flex items-center gap-2">
                    <input
                      readOnly
                      value={result.approvalUrl}
                      className="w-full rounded-xl border border-border bg-muted/30 px-3.5 py-2.5 text-sm text-foreground outline-none"
                    />
                    <button type="button" onClick={handleCopy} className={pBtnGhost} aria-label="Copy approval URL">
                      <span className="material-icons text-base">{copied ? 'check' : 'content_copy'}</span>
                    </button>
                  </div>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Public path</label>
                <p className="text-sm text-foreground">{result.publicPath}</p>
              </div>
              <div className="flex items-center justify-between pt-2">
                <Link href={`/portal/projects/${projectId}?tab=files`} className="text-sm font-medium text-primary hover:underline">
                  View in Artifacts
                </Link>
                <button type="button" onClick={onClose} className={pBtnPrimary}>Done</button>
              </div>
            </div>
          ) : (
            <>
              {status === 'error' && (
                <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-3 py-2">
                  <span className="material-icons text-base">error</span>
                  {error}
                </div>
              )}
              <div role="radiogroup" aria-label="Survey preset" className="space-y-2">
                {PRESETS.map((p) => (
                  <label
                    key={p.value}
                    className={`flex items-start gap-3 rounded-xl border px-3.5 py-3 cursor-pointer transition ${preset === p.value ? 'border-primary bg-primary/5' : 'border-border hover:border-foreground/25'}`}
                  >
                    <input
                      type="radio"
                      name="survey-preset"
                      value={p.value}
                      checked={preset === p.value}
                      onChange={() => setPreset(p.value)}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="block text-sm font-semibold text-foreground">{p.label}</span>
                      <span className="block text-xs text-muted-foreground">{p.description}</span>
                    </span>
                  </label>
                ))}
              </div>
              <div className="flex justify-end">
                <button type="button" onClick={handleGenerate} disabled={status === 'loading'} className={pBtnPrimary}>
                  {status === 'loading' && <span className="material-icons animate-spin text-sm">refresh</span>}
                  Generate
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
