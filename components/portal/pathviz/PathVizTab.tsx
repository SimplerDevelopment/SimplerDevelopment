'use client';

// Path Visualizations ("Dev Paths") — portal project tab, Phase 4 (static
// rendering only; live SSE + animation is Phase 5).
//
// Top-level: fetches the project's chart list and renders the "Charts"
// constellation gallery (docs/design/path-visualizations-mockup-v3.html's
// #constellation view, minus the live cross-chart threads and status-mix bar
// — both explicitly deferred to Phase 5+). Clicking a card opens
// PathChartView in-tab (local state, no route change) so the URL/back button
// keep behaving like every other project tab.
//
// Self-contained dark "mission control" panel: this tab ignores the portal's
// light/dark theme toggle by design (see pathviz-theme.ts's THEME constant),
// so colors are applied via inline `style`, not Tailwind theme tokens.

import { useCallback, useEffect, useState } from 'react';
import PathChartView from './PathChartView';
import { THEME, isLive, formatRelativeTime } from './pathviz-theme';
import type { PathVizChartSummary } from './types';

interface PathVizTabProps {
  projectId: number;
}

type LoadState = 'loading' | 'ready' | 'error';

export default function PathVizTab({ projectId }: PathVizTabProps) {
  const [charts, setCharts] = useState<PathVizChartSummary[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeChartId, setActiveChartId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/portal/projects/${projectId}/path-charts`).then((r) => r.json());
      if (res?.success) {
        setCharts(res.data ?? []);
        setLoadState('ready');
      } else {
        setErrorMessage(res?.message ?? 'Failed to load Dev Paths charts.');
        setLoadState('error');
      }
    } catch {
      setErrorMessage('Failed to load Dev Paths charts.');
      setLoadState('error');
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div
      data-testid="pathviz-tab"
      className="rounded-2xl border overflow-hidden"
      style={{ background: THEME.surface, borderColor: THEME.line, color: THEME.ink }}
    >
      {activeChartId != null ? (
        <PathChartView
          chartId={activeChartId}
          onBack={() => setActiveChartId(null)}
        />
      ) : (
        <Gallery
          loadState={loadState}
          errorMessage={errorMessage}
          charts={charts}
          onOpen={setActiveChartId}
          onRetry={load}
        />
      )}
    </div>
  );
}

function Gallery({
  loadState,
  errorMessage,
  charts,
  onOpen,
  onRetry,
}: {
  loadState: LoadState;
  errorMessage: string | null;
  charts: PathVizChartSummary[];
  onOpen: (chartId: number) => void;
  onRetry: () => void;
}) {
  return (
    <div className="p-6 space-y-5">
      <div>
        <div className="text-[10px] font-mono uppercase tracking-[.2em]" style={{ color: THEME.ink3 }}>
          Dev Paths
        </div>
        <h2 className="text-lg font-semibold mt-1">Charts</h2>
        <p className="text-sm mt-1" style={{ color: THEME.ink2 }}>
          Agent-authored path visualizations of the screens, APIs, schema, services, tests, jobs,
          and infra being built for this project.
        </p>
      </div>

      {loadState === 'loading' && (
        <div className="py-16 text-center text-sm" style={{ color: THEME.ink3 }} data-testid="pathviz-loading">
          <span className="material-icons text-3xl align-middle mr-2 animate-spin">progress_activity</span>
          Loading charts…
        </div>
      )}

      {loadState === 'error' && (
        <div
          className="rounded-xl border p-6 text-center space-y-3"
          style={{ borderColor: THEME.lineBright, background: THEME.panel }}
          data-testid="pathviz-error"
        >
          <span className="material-icons text-3xl" style={{ color: '#F1655A' }}>
            error_outline
          </span>
          <p className="text-sm" style={{ color: THEME.ink2 }}>{errorMessage}</p>
          <button
            type="button"
            onClick={onRetry}
            className="text-xs font-mono px-3 py-1.5 rounded border"
            style={{ borderColor: THEME.lineBright, color: THEME.ink2 }}
          >
            Retry
          </button>
        </div>
      )}

      {loadState === 'ready' && charts.length === 0 && (
        <div
          className="rounded-xl border p-10 text-center space-y-2"
          style={{ borderColor: THEME.lineBright, background: THEME.panel }}
          data-testid="pathviz-empty-state"
        >
          <span className="material-icons text-4xl" style={{ color: THEME.ink3 }}>
            device_hub
          </span>
          <h3 className="font-semibold" style={{ color: THEME.ink }}>No charts yet</h3>
          <p className="text-sm max-w-md mx-auto" style={{ color: THEME.ink2 }}>
            Agents create Dev Paths charts via MCP (<code className="font-mono">pathviz_create_chart</code>) as
            they build out this project — check back once one starts working.
          </p>
        </div>
      )}

      {loadState === 'ready' && charts.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="pathviz-chart-grid">
          {charts.map((chart) => (
            <ChartCard key={chart.id} chart={chart} onOpen={() => onOpen(chart.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function ChartCard({ chart, onOpen }: { chart: PathVizChartSummary; onOpen: () => void }) {
  const live = isLive(chart.lastEventAt);
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid={`pathviz-chart-card-${chart.id}`}
      className="text-left rounded-xl border p-4 flex flex-col gap-2.5 transition-transform hover:-translate-y-0.5"
      style={{
        background: `linear-gradient(180deg, ${THEME.panel2}, ${THEME.panel})`,
        borderColor: live ? '#6EE86E59' : THEME.lineBright,
      }}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold flex-1 min-w-0 truncate">{chart.title}</span>
        {live && (
          <span
            className="flex items-center gap-1 text-[9px] font-mono font-bold tracking-[.14em]"
            style={{ color: '#6EE86E' }}
            data-testid={`pathviz-live-badge-${chart.id}`}
          >
            <span
              className="w-1.5 h-1.5 rounded-full inline-block"
              style={{ background: '#6EE86E', boxShadow: '0 0 6px #6EE86E' }}
            />
            LIVE
          </span>
        )}
      </div>

      {chart.appLabel && (
        <span
          className="self-start text-[10px] font-mono px-2 py-0.5 rounded border"
          style={{ borderColor: THEME.lineBright, color: THEME.ink2, background: THEME.panel2 }}
        >
          {chart.appLabel}
        </span>
      )}

      {chart.description && (
        <p className="text-xs line-clamp-2" style={{ color: THEME.ink3 }}>
          {chart.description}
        </p>
      )}

      <div className="flex items-center gap-3 text-[10px] font-mono mt-auto pt-1" style={{ color: THEME.ink3 }}>
        <span>{chart.nodeCount} nodes</span>
        <span>{chart.edgeCount} edges</span>
        <span className="ml-auto">{formatRelativeTime(chart.lastEventAt ?? chart.updatedAt)}</span>
      </div>
    </button>
  );
}
