'use client';

/**
 * PUX-210: under the flag a tab body becomes a titled card on one scroll;
 * flag off it renders its children bare, so the legacy DOM is unchanged.
 */
import type { ReactNode } from 'react';

export function StudioCard({ studio, title, extra, children }: { studio: boolean; title: string; extra?: ReactNode; children: ReactNode }) {
  if (!studio) return <>{children}</>;
  return (
    <section className="rounded-2xl border border-border bg-card p-5" aria-label={title}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-display text-[11px] font-semibold uppercase tracking-[.08em] text-muted-foreground">{title}</h2>
        {extra}
      </div>
      {children}
    </section>
  );
}
