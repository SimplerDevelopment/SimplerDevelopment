'use client';

/**
 * PUX-189 (design doc screen 48): where this brand profile is in use —
 * one read of /api/portal/branding/profiles/[id]/usage. Studio-only; the
 * profile page gates on useFeatureFlag('portal-redesign').
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { GhostCard } from '@/components/portal/EmptyState';

type Usage = { sites: { id: number; name: string }[]; surveys: number };

export function AppliedToCard({ profileId }: { profileId: number }) {
  const [usage, setUsage] = useState<Usage | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/portal/branding/profiles/${profileId}/usage`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled && d.success) setUsage(d.data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [profileId]);
  if (!usage) return null;
  if (usage.sites.length === 0 && usage.surveys === 0) {
    return <GhostCard icon="language" title="Not applied to any site yet" body="Assign this profile from a site's settings and its colours, type and voice apply there as defaults." href="/portal/websites" />;
  }
  return (
    <section className="rounded-2xl border border-border bg-card p-5" aria-label="Applied to">
      <p className="font-display text-[11px] font-semibold uppercase tracking-[.08em] text-muted-foreground">Applied to</p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {usage.sites.map((s) => (
          <li key={s.id}>
            <Link href={`/portal/websites/${s.id}`} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-[12.5px] font-medium text-foreground hover:border-[var(--studio-line-strong)]">
              <span className="material-icons text-sm text-muted-foreground">language</span>{s.name}
            </Link>
          </li>
        ))}
        {usage.surveys > 0 && (
          <li className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-[12.5px] font-medium text-muted-foreground">
            <span className="material-icons text-sm">poll</span>{usage.surveys} {usage.surveys === 1 ? 'survey' : 'surveys'}
          </li>
        )}
      </ul>
    </section>
  );
}
