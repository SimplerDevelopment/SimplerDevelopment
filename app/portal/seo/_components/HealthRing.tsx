'use client';

// PUX-180 (design doc screen 39): the health score as a ring — same 0-100
// number and tiers as HealthScoreBadge (format.ts healthScoreTier), drawn
// as progress instead of a chip. Studio-only; the shell gates on the flag.

import { healthScoreTier } from './format';

const STROKE: Record<ReturnType<typeof healthScoreTier>, string> = {
  good: 'stroke-[var(--portal-ok)]',
  ok: 'stroke-[var(--portal-warn)]',
  bad: 'stroke-destructive',
  none: 'stroke-muted-foreground/40',
};

export function HealthRing({ score, caption }: { score: number | null; caption?: string }) {
  const r = 34, c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score ?? 0));
  return (
    <div className="flex items-center gap-4">
      <svg width="88" height="88" viewBox="0 0 88 88" role="img" aria-label={`Health score ${score ?? 'not yet audited'}`}>
        <circle cx="44" cy="44" r={r} fill="none" className="stroke-muted" strokeWidth="8" />
        <circle cx="44" cy="44" r={r} fill="none" className={STROKE[healthScoreTier(score)]} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} transform="rotate(-90 44 44)" />
        <text x="44" y="44" textAnchor="middle" dominantBaseline="central" className="fill-foreground font-display text-[22px] font-extrabold">{score ?? '—'}</text>
      </svg>
      <div>
        <p className="font-display text-sm font-semibold text-foreground">Health score</p>
        {caption && <p className="text-xs text-muted-foreground">{caption}</p>}
      </div>
    </div>
  );
}
