import { healthScoreClasses, healthScoreTier } from './format';

/** Colored 0-100 health score chip. `lg` is the dashboard-header hero variant. */
export function HealthScoreBadge({ score, size = 'sm' }: { score: number | null; size?: 'sm' | 'lg' }) {
  const tier = healthScoreTier(score);

  if (size === 'lg') {
    return (
      <div className={`inline-flex flex-col items-center justify-center rounded-2xl px-6 py-3 ${healthScoreClasses[tier]}`}>
        <span className="font-display text-4xl font-extrabold tracking-[-0.02em] leading-none">
          {score ?? '—'}
        </span>
        <span className="mt-1 text-[10px] font-semibold uppercase tracking-wide">Health score</span>
      </div>
    );
  }

  return (
    <span className={`inline-flex items-center justify-center rounded-full min-w-8 px-2 py-1 text-xs font-bold ${healthScoreClasses[tier]}`}>
      {score ?? '—'}
    </span>
  );
}
