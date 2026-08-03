'use client';

// Right-hand drawer opened on node click. Renders everything a Phase 4
// (static) snapshot can show about one node: status + ring, its status note,
// identity (kind/route/file/parent), agent-declared state (meta.state /
// meta.stores / meta.props), external calls (meta.calls), and active claims
// (agent, intent, files — 2+ claims flags "contested"). Phase 5/6 adds two
// more, both optional so a caller with no reducer state (or tests built
// against the Phase 4 shape) render identically: status history (from
// pathviz-reducer.ts's `statusHistory`) and a live-updating notes thread.

import { agentColor, ringSegments, STATUS_INFO, THEME } from './pathviz-theme';
import type { NoteEntry, StatusHistoryEntry } from './pathviz-reducer';
import type { PathVizClaim, PathVizNode } from './types';

interface NodeInspectorProps {
  node: PathVizNode;
  claims: PathVizClaim[];
  onClose: () => void;
  /** Label of node.parentNodeId, when resolvable — purely cosmetic. */
  parentLabel?: string | null;
  /** Phase 5/6 — most-recent-first is handled here; pass chronological order in. */
  statusHistory?: StatusHistoryEntry[];
  notes?: NoteEntry[];
}

function fmtClock(atMs: number): string {
  return new Date(atMs).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function renderMetaValue(value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map((v) => renderMetaValue(v)).join(', ');
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[72px_1fr] gap-2 text-[11px]">
      <span className="font-mono uppercase tracking-wide" style={{ color: THEME.ink3 }}>{label}</span>
      <span className="font-mono break-words" style={{ color: THEME.ink2 }}>{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] font-mono uppercase tracking-[.14em]" style={{ color: THEME.ink3 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

export default function NodeInspector({
  node,
  claims,
  onClose,
  parentLabel,
  statusHistory,
  notes,
}: NodeInspectorProps) {
  const info = STATUS_INFO[node.status];
  const segments = ringSegments(node.status);
  const contested = claims.length >= 2;

  const hasDeclaredState =
    node.meta.state !== undefined || node.meta.stores !== undefined || node.meta.props !== undefined;

  return (
    <aside
      data-testid="pathviz-node-inspector"
      className="w-[320px] shrink-0 border-l flex flex-col"
      style={{ borderColor: THEME.line, background: THEME.panel }}
    >
      <div className="flex items-center gap-2 px-4 py-3.5 border-b" style={{ borderColor: THEME.line }}>
        <span className="text-sm font-semibold flex-1 min-w-0 truncate">{node.label}</span>
        <button
          type="button"
          onClick={onClose}
          data-testid="pathviz-inspector-close"
          aria-label="Close inspector"
          className="text-sm"
          style={{ color: THEME.ink3 }}
        >
          <span className="material-icons text-base">close</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <Section title="Status">
          <div className="flex items-center gap-2.5">
            <div className="flex gap-[3px]" data-testid="pathviz-status-ring">
              {segments.map((seg, i) => (
                <span
                  key={i}
                  className="w-2 h-2 rounded-sm inline-block"
                  style={{ background: seg.lit ? seg.hex : THEME.line }}
                />
              ))}
            </div>
            <span
              className="text-[11px] font-mono uppercase tracking-wide"
              style={{ color: info.hex }}
            >
              {info.label}
            </span>
          </div>
          {node.meta.notes && (
            <p className="text-xs mt-1" style={{ color: THEME.ink2 }} data-testid="pathviz-status-note">
              {node.meta.notes}
            </p>
          )}
        </Section>

        <Section title="Identity">
          <div className="space-y-1">
            <KV label="Kind" value={node.kind} />
            <KV label="Route" value={node.routePath ?? '—'} />
            <KV label="File" value={node.filePath ?? '—'} />
            <KV label="Parent" value={parentLabel ?? (node.parentNodeId != null ? String(node.parentNodeId) : '—')} />
          </div>
        </Section>

        {hasDeclaredState && (
          <Section title="Declared state">
            <div className="space-y-1">
              {node.meta.state !== undefined && <KV label="State" value={renderMetaValue(node.meta.state)} />}
              {node.meta.stores !== undefined && <KV label="Store" value={renderMetaValue(node.meta.stores)} />}
              {node.meta.props !== undefined && <KV label="Props" value={renderMetaValue(node.meta.props)} />}
            </div>
          </Section>
        )}

        {node.meta.calls !== undefined && (
          <Section title="External calls">
            <div
              className="font-mono text-[10.5px] px-2 py-1.5 rounded border"
              style={{ borderColor: THEME.line, color: THEME.ink2, background: THEME.surface }}
              data-testid="pathviz-external-calls"
            >
              {renderMetaValue(node.meta.calls)}
            </div>
          </Section>
        )}

        <Section title="Claims">
          {claims.length === 0 ? (
            <p className="text-xs" style={{ color: THEME.ink3 }}>No active claims on this node.</p>
          ) : (
            <div className="space-y-2" data-testid="pathviz-claims-list">
              {contested && (
                <div
                  className="text-[10px] font-mono uppercase tracking-wide border border-dashed rounded px-2 py-1"
                  style={{ borderColor: '#ECA83D88', color: '#ECA83D' }}
                  data-testid="pathviz-contested-banner"
                >
                  Contested — {claims.length} agents
                </div>
              )}
              {claims.map((claim) => {
                const color = agentColor(claim.agentLabel);
                return (
                  <div
                    key={claim.id}
                    className="rounded border p-2 space-y-1"
                    style={{ borderColor: THEME.lineBright, background: THEME.surface }}
                  >
                    <div className="flex items-center gap-1.5 text-[11px] font-mono">
                      <span
                        className="w-1.5 h-1.5 rounded-full inline-block"
                        style={{ background: color }}
                      />
                      {claim.agentLabel}
                    </div>
                    {claim.intent && (
                      <p className="text-[11px]" style={{ color: THEME.ink2 }}>{claim.intent}</p>
                    )}
                    {claim.files.length > 0 && (
                      <p className="text-[10px] font-mono leading-relaxed" style={{ color: THEME.ink3 }}>
                        {claim.files.join(', ')}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        {notes != null && notes.length > 0 && (
          <Section title={`Notes (${notes.length})`}>
            <div className="space-y-2" data-testid="pathviz-notes-thread">
              {notes.map((n, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span
                    className="w-1.5 h-1.5 rounded-full inline-block mt-1 shrink-0"
                    style={{ background: n.agentLabel ? agentColor(n.agentLabel) : THEME.ink3 }}
                  />
                  <div className="min-w-0">
                    <div className="text-[10px] font-mono" style={{ color: THEME.ink3 }}>
                      <b style={{ color: THEME.ink2 }}>{n.agentLabel ?? 'unknown'}</b> · {fmtClock(n.atMs)}
                    </div>
                    <p className="text-[11px] break-words" style={{ color: THEME.ink2 }}>{n.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {statusHistory != null && statusHistory.length > 0 && (
          <Section title="Status history">
            <div className="space-y-1" data-testid="pathviz-status-history">
              {[...statusHistory].reverse().slice(0, 10).map((h, i) => {
                const hInfo = STATUS_INFO[h.status];
                return (
                  <div key={i} className="flex items-center gap-2 text-[10.5px] font-mono">
                    <span
                      className="w-1.5 h-1.5 rounded-full inline-block shrink-0"
                      style={{ background: h.agentLabel ? agentColor(h.agentLabel) : THEME.ink3 }}
                    />
                    <span style={{ color: THEME.ink3 }}>{fmtClock(h.atMs)}</span>
                    <span style={{ color: hInfo.hex }}>{h.status}</span>
                  </div>
                );
              })}
            </div>
          </Section>
        )}
      </div>
    </aside>
  );
}
