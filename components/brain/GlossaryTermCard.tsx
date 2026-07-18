'use client';

/**
 * GlossaryTermCard — single row in the glossary list / grouped category view.
 *
 * Props:
 *   - `term`: the slim row returned by `listGlossaryTerms` (see
 *     `lib/brain/glossary.ts` → `GlossaryTermRow`).
 *   - `onClick`: optional — if omitted the whole card is wrapped in a
 *     `next/link` to `/portal/brain/glossary/[id]`.
 *
 * Visuals:
 *   - Term in bold.
 *   - Short-definition (or first 80 chars of definition fallback handled by
 *     the caller — this component only sees what's on the row, so it shows
 *     `shortDefinition` and lets the empty case be empty).
 *   - Category chip (if set).
 *   - Status chip — rendered only when `status === 'deprecated'` so the list
 *     stays visually quiet for the common case.
 *   - Alias-count badge (only when > 0).
 */

import Link from 'next/link';
import type { BrainGlossaryStatus } from '@/lib/db/schema';

export interface GlossaryTermCardData {
  id: number;
  term: string;
  slug: string;
  shortDefinition: string | null;
  status: BrainGlossaryStatus;
  category: string | null;
  aliasCount: number;
}

interface Props {
  term: GlossaryTermCardData;
  onClick?: (id: number) => void;
}

export default function GlossaryTermCard({ term, onClick }: Props) {
  const body = (
    <div className="flex items-start gap-3 p-3 bg-card border border-border rounded-lg hover:border-primary/50 hover:bg-accent/30 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-foreground text-sm truncate">{term.term}</span>
          {term.status === 'deprecated' && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
              <span className="material-icons text-[11px]">archive</span>
              deprecated
            </span>
          )}
          {term.category && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded bg-muted text-muted-foreground">
              <span className="material-icons text-[11px]">label</span>
              {term.category}
            </span>
          )}
          {term.aliasCount > 0 && (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded bg-muted/60 text-muted-foreground"
              title={`${term.aliasCount} alias${term.aliasCount === 1 ? '' : 'es'}`}
            >
              <span className="material-icons text-[11px]">account_circle</span>
              {term.aliasCount}
            </span>
          )}
        </div>
        {term.shortDefinition && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-snug">
            {term.shortDefinition}
          </p>
        )}
      </div>
      <span className="material-icons text-muted-foreground text-base shrink-0 mt-0.5">chevron_right</span>
    </div>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={() => onClick(term.id)}
        className="block w-full text-left"
      >
        {body}
      </button>
    );
  }

  return (
    <Link href={`/portal/brain/glossary/${term.id}`} className="block">
      {body}
    </Link>
  );
}
