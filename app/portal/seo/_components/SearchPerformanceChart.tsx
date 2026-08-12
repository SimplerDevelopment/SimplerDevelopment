// Daily clicks/impressions bar chart for the Search tab overview — plain
// divs scaled by percentage, matching the house "no chart libs" convention
// (see OverviewTab.tsx's Bar component). Impressions and clicks are both
// scaled against the same shared max and bottom-anchored in the same column,
// so the (smaller) clicks bar always overlays inside the impressions bar
// rather than needing percent-of-percent math.

import type { GscOverviewPoint } from './types';

export function SearchPerformanceChart({ series }: { series: GscOverviewPoint[] }) {
  if (series.length === 0) return null;

  const max = series.reduce((m, p) => Math.max(m, p.clicks, p.impressions), 0);

  return (
    <div>
      <div className="flex items-center gap-4 text-xs text-muted-foreground mb-2">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-primary/20" />
          Impressions
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-primary" />
          Clicks
        </span>
      </div>
      <div className="h-32 flex items-end gap-[2px] overflow-x-auto">
        {series.map((p) => {
          const impressionsPct = max > 0 ? (p.impressions / max) * 100 : 0;
          const clicksPct = max > 0 ? (p.clicks / max) * 100 : 0;
          return (
            <div
              key={p.date}
              className="flex-1 min-w-[4px] h-full relative"
              title={`${p.date} — ${p.clicks.toLocaleString()} clicks, ${p.impressions.toLocaleString()} impressions`}
            >
              <div
                className="absolute bottom-0 left-0 right-0 bg-primary/20 rounded-t-sm"
                style={{ height: `${impressionsPct}%` }}
              />
              <div
                className="absolute bottom-0 left-0 right-0 bg-primary rounded-t-sm"
                style={{ height: `${clicksPct}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
        <span>{series[0].date}</span>
        {series.length > 1 && <span>{series[series.length - 1].date}</span>}
      </div>
    </div>
  );
}
