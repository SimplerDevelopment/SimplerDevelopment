'use client';

// One Dev Paths chart: header strip (title / appLabel / back / agent legend)
// + the reactflow canvas + the node inspector drawer + the replay scrubber.
// Loads the full snapshot from GET /api/portal/path-charts/:id (Phase 3 API
// — chart, nodes, edges, activeClaims, lastEventId), same as Phase 4. Phase
// 5/6 layers usePathVizLiveReplay.ts on top: it owns the SSE connection, the
// pure reducer fold (live AND replay), and the scrubber's mode/cursor state
// — this component just wires that hook's output into the Phase 4
// components (PathChartCanvas/NodeInspector needed no identity-model
// change; see pathviz-graph-projection.ts's doc comment for why).

import { useEffect, useState } from 'react';
import PathChartCanvas from './PathChartCanvas';
import NodeInspector from './NodeInspector';
import ReplayScrubber from './ReplayScrubber';
import PathVizAnimationStyles from './pathviz-animation-styles';
import { usePathVizLiveReplay } from './usePathVizLiveReplay';
import { THEME, agentColor } from './pathviz-theme';
import type { PathVizSnapshot } from './types';

interface PathChartViewProps {
  chartId: number;
  onBack: () => void;
}

type LoadState = 'loading' | 'ready' | 'error';

export default function PathChartView({ chartId, onBack }: PathChartViewProps) {
  const [snapshot, setSnapshot] = useState<PathVizSnapshot | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadState('loading');
    setSelectedNodeId(null);
    fetch(`/api/portal/path-charts/${chartId}`)
      .then((r) => r.json())
      .then((res) => {
        if (cancelled) return;
        if (res?.success) {
          setSnapshot(res.data);
          setLoadState('ready');
        } else {
          setErrorMessage(res?.message ?? 'Failed to load this chart.');
          setLoadState('error');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setErrorMessage('Failed to load this chart.');
          setLoadState('error');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [chartId]);

  const live = usePathVizLiveReplay(chartId, snapshot);

  // Distinct agents currently holding a claim anywhere on this chart — shown
  // as legend chips in the header, same accent hash the canvas uses for claim
  // outlines so the two stay visually consistent. Live-updating: derived
  // from the reducer-projected claims, not the frozen initial snapshot.
  const agentLabels = Array.from(new Set(live.displayClaims.map((c) => c.agentLabel))).sort();

  const selectedNode = live.displayNodes.find((n) => n.id === selectedNodeId) ?? null;
  const selectedNodeClaims = selectedNode
    ? live.displayClaims.filter((c) => c.nodeId === selectedNode.id)
    : [];
  const selectedNodeParentLabel =
    selectedNode?.parentNodeId != null
      ? live.displayNodes.find((n) => n.id === selectedNode.parentNodeId)?.label ?? null
      : null;

  const showReconnecting = live.mode === 'live' && live.connectionState === 'reconnecting';

  return (
    <div data-testid="pathviz-chart-view" className="flex flex-col" style={{ minHeight: 560 }}>
      <PathVizAnimationStyles />
      <header
        className="flex items-center gap-3 px-4 py-3 border-b"
        style={{ borderColor: THEME.line, background: THEME.panel }}
      >
        <button
          type="button"
          onClick={onBack}
          data-testid="pathviz-back-to-gallery"
          className="flex items-center gap-1 text-xs font-mono"
          style={{ color: THEME.ink2 }}
        >
          <span className="material-icons text-sm">arrow_back</span>
          Charts
        </button>
        <span className="text-sm font-semibold truncate">
          {snapshot?.chart.title ?? '—'}
        </span>
        {snapshot?.chart.appLabel && (
          <span
            className="text-[10px] font-mono px-2 py-0.5 rounded border"
            style={{ borderColor: THEME.lineBright, color: THEME.ink2, background: THEME.panel2 }}
          >
            {snapshot.chart.appLabel}
          </span>
        )}
        {showReconnecting && (
          <span
            className="text-[10px] font-mono px-2 py-0.5 rounded-full border"
            style={{ borderColor: '#ECA83D88', color: '#ECA83D' }}
            data-testid="pathviz-reconnecting-badge"
          >
            reconnecting…
          </span>
        )}
        <div className="flex-1" />
        {agentLabels.length > 0 && (
          <div className="flex items-center gap-1.5" data-testid="pathviz-agent-legend">
            {agentLabels.map((label) => {
              const color = agentColor(label);
              return (
                <span
                  key={label}
                  className="flex items-center gap-1.5 text-[10px] font-mono px-2 py-1 rounded-full border"
                  style={{ borderColor: `${color}66`, background: `${color}18`, color: THEME.ink2 }}
                  title={label}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full inline-block"
                    style={{ background: color, boxShadow: `0 0 6px ${color}` }}
                  />
                  {label}
                </span>
              );
            })}
          </div>
        )}
      </header>

      <div className="flex-1 flex min-h-0">
        <div className="flex-1 min-w-0 relative">
          {loadState === 'loading' && (
            <div className="p-16 text-center text-sm" style={{ color: THEME.ink3 }} data-testid="pathviz-chart-loading">
              <span className="material-icons text-3xl align-middle mr-2 animate-spin">progress_activity</span>
              Loading chart…
            </div>
          )}
          {loadState === 'error' && (
            <div className="p-10 text-center text-sm" style={{ color: THEME.ink2 }} data-testid="pathviz-chart-error">
              {errorMessage}
            </div>
          )}
          {loadState === 'ready' && snapshot && (
            <PathChartCanvas
              nodes={live.displayNodes}
              edges={live.displayEdges}
              activeClaims={live.displayClaims}
              selectedNodeId={selectedNodeId}
              onSelectNode={setSelectedNodeId}
              presenceBeacons={live.presenceBeacons}
              animationHints={live.animationHints}
            />
          )}
        </div>

        {selectedNode && (
          <NodeInspector
            node={selectedNode}
            claims={selectedNodeClaims}
            parentLabel={selectedNodeParentLabel}
            onClose={() => setSelectedNodeId(null)}
            statusHistory={live.statusHistoryFor(selectedNode.key)}
            notes={live.notesFor(selectedNode.key)}
          />
        )}
      </div>

      {loadState === 'ready' && snapshot && (
        <ReplayScrubber mode={live.mode} {...live.scrubber} />
      )}
    </div>
  );
}
