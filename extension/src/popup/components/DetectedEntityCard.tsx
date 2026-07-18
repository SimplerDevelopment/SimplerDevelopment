import { useState, type ReactNode } from 'react';
import { Spinner } from './Spinner';

interface Props {
  kind: 'person' | 'company';
  name: string;
  sub?: string;
  primaryLabel: string;
  onPrimary(): Promise<void> | void;
  saved?: { id: string | number; href?: string; existed?: boolean } | null;
  secondary?: ReactNode;
}

/**
 * Highlighted "we detected something on this page" card. Sits ABOVE the
 * existing Save Note flow — never replaces it. Shown only when /extract
 * surfaced a high-confidence person or company entity for the active page.
 */
export function DetectedEntityCard({
  kind,
  name,
  sub,
  primaryLabel,
  onPrimary,
  saved,
  secondary,
}: Props) {
  const [busy, setBusy] = useState(false);

  async function handlePrimary() {
    if (saved || busy) return;
    setBusy(true);
    try {
      await onPrimary();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-brand-300 bg-brand-50/60 p-3 space-y-2">
      <div className="flex items-start gap-2">
        <KindIcon kind={kind} />
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-wide text-brand-700 font-semibold">
            Detected {kind}
          </div>
          <div className="text-sm font-semibold text-slate-900 truncate">{name}</div>
          {sub ? <div className="text-xs text-slate-600 truncate">{sub}</div> : null}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {saved ? (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-700 font-medium">
            <CheckIcon />
            {saved.existed ? 'Already in CRM' : 'Saved to CRM'}
            {saved.href ? (
              <a
                href={saved.href}
                target="_blank"
                rel="noreferrer"
                className="ml-1 underline"
              >
                View
              </a>
            ) : null}
          </span>
        ) : (
          <button
            type="button"
            onClick={handlePrimary}
            disabled={busy}
            className="inline-flex items-center justify-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? <Spinner size={14} /> : <PlusIcon />}
            {busy ? 'Saving...' : primaryLabel}
          </button>
        )}
        {secondary}
      </div>
    </div>
  );
}

function KindIcon({ kind }: { kind: 'person' | 'company' }) {
  if (kind === 'person') {
    return (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-brand-600 shrink-0 mt-0.5"
      >
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    );
  }
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-brand-600 shrink-0 mt-0.5"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 21V9h6v12M3 9h18" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
