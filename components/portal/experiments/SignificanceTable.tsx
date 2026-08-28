'use client';

/**
 * PUX-212: the "Significance vs control" table, moved verbatim out of
 * ExperimentDetailClient (pinned god file), plus — under the
 * portal-redesign flag — one plain confidence pill per comparison and a
 * disabled "Pick winner" that says why it is disabled: nothing promotes a
 * variant onto the live page yet. Flag off renders the table alone.
 */

import { useFeatureFlag } from '@/components/portal/FeatureFlagsProvider';
import { confidencePill, MIN_SAMPLE_PER_ARM } from '@/lib/ab/confidence';
import { sBtnGhost } from '@/components/portal/portal-ui';

export type Comparison = { variantKey: string; controlKey: string; z: number; p: number; lift: number; significant: boolean };
export type ArmStat = { key: string; views: number };

export function SignificanceTable({ comparisons, stats }: { comparisons: Comparison[]; stats: ArmStat[] }) {
  const studio = useFeatureFlag('portal-redesign');
  return (
    <>
      {studio && (
        <div className="mb-3 flex flex-wrap items-center gap-2" aria-label="Confidence">
          {comparisons.map((c) => {
            const pill = confidencePill(c, stats);
            const tone = pill.tone === 'ok' ? 'bg-[var(--portal-ok-bg)] text-[var(--portal-ok)]' : pill.tone === 'warn' ? 'bg-[var(--portal-warn-bg)] text-[var(--portal-warn)]' : 'bg-muted text-muted-foreground';
            return <span key={c.variantKey} className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${tone}`}>{c.variantKey}: {pill.label}</span>;
          })}
          <button type="button" disabled title="Nothing promotes a winning variant onto the live page yet — the button marks the gap, not a shipped action." className={`${sBtnGhost} !py-1 ml-auto disabled:opacity-60`}>Pick winner</button>
        </div>
      )}
      <table className="w-full text-sm">
        <thead className="text-xs uppercase text-muted-foreground">
          <tr>
            <th className="text-left py-2">Variant</th>
            <th className="text-right py-2">Lift</th>
            <th className="text-right py-2">z</th>
            <th className="text-right py-2">p</th>
            <th className="text-right py-2">Sig.</th>
          </tr>
        </thead>
        <tbody>
          {comparisons.map(c => {
            // Server flags significant on `p < 0.05` alone. Layer
            // a sample-size guard on top: both arms need at least
            // MIN_SAMPLE_PER_ARM views before we trust the call.
            const controlViews = stats.find(s => s.key === c.controlKey)?.views ?? 0;
            const variantViews = stats.find(s => s.key === c.variantKey)?.views ?? 0;
            const minViews = Math.min(controlViews, variantViews);
            const enoughData = minViews >= MIN_SAMPLE_PER_ARM;
            const showSignificant = c.significant && enoughData;
            const tooSmall = c.significant && !enoughData;
            const icon = showSignificant
              ? 'check_circle'
              : tooSmall
                ? 'hourglass_top'
                : 'remove_circle_outline';
            const colorClass = showSignificant
              ? 'text-green-600 dark:text-green-500'
              : tooSmall
                ? 'text-amber-500 dark:text-amber-400'
                : 'text-muted-foreground/50';
            const title = tooSmall
              ? `Not enough data — need at least ${MIN_SAMPLE_PER_ARM} visitors per arm`
              : undefined;
            return (
              <tr key={c.variantKey} className="border-t border-border">
                <td className="py-2 font-mono">{c.variantKey} vs {c.controlKey}</td>
                <td className="py-2 text-right">{(c.lift * 100).toFixed(2)}%</td>
                <td className="py-2 text-right">{c.z.toFixed(3)}</td>
                <td className="py-2 text-right">{c.p.toFixed(4)}</td>
                <td className="py-2 text-right">
                  <span className={`material-icons text-base ${colorClass}`} title={title}>
                    {icon}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
