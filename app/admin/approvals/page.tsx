'use client';

// Unified admin approvals inbox. Aggregates pending items across the four
// approval queues (MCP CMS changes, Brain AI review items, service requests,
// suggested-project requests) into a single oldest-first feed. Approve and
// Reject buttons call /api/admin/approvals/[source]/[id]/{approve,reject},
// which dispatch to the existing per-source business logic.

import { useState, useEffect } from 'react';

type ApprovalSource = 'mcp' | 'brain' | 'service' | 'project';

interface UnifiedApprovalRow {
  source: ApprovalSource;
  id: number;
  clientId: number;
  clientCompany: string | null;
  clientUserName: string | null;
  clientUserEmail: string | null;
  createdAt: string;
  summary: string;
  detail?: string | null;
  status: string;
}

const SOURCE_CONFIG: Record<ApprovalSource, { label: string; color: string; icon: string }> = {
  mcp:     { label: 'MCP',     color: 'bg-purple-100 text-purple-700', icon: 'smart_toy' },
  brain:   { label: 'Brain',   color: 'bg-indigo-100 text-indigo-700', icon: 'psychology' },
  service: { label: 'Service', color: 'bg-blue-100 text-blue-700',    icon: 'storefront' },
  project: { label: 'Project', color: 'bg-amber-100 text-amber-700',  icon: 'rocket_launch' },
};

function timeAgo(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const seconds = Math.max(0, Math.floor((now - then) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export default function AdminApprovalsPage() {
  const [rows, setRows] = useState<UnifiedApprovalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingKey, setActingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/approvals');
      const data = await res.json();
      if (data.success) setRows(data.data ?? []);
      else setError(data.message ?? 'Failed to load approvals');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load approvals');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function act(row: UnifiedApprovalRow, kind: 'approve' | 'reject') {
    const key = `${row.source}:${row.id}:${kind}`;
    setActingKey(key);
    setError(null);
    try {
      const res = await fetch(`/api/admin/approvals/${row.source}/${row.id}/${kind}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.success) {
        // Remove the row optimistically; the underlying status is now
        // approved/applied/rejected/failed so it no longer belongs here.
        setRows((prev) => prev.filter((r) => !(r.source === row.source && r.id === row.id)));
      } else {
        setError(data.message ?? `${kind} failed`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : `${kind} failed`);
    } finally {
      setActingKey(null);
    }
  }

  const counts = rows.reduce<Record<ApprovalSource, number>>(
    (acc, r) => { acc[r.source] = (acc[r.source] ?? 0) + 1; return acc; },
    { mcp: 0, brain: 0, service: 0, project: 0 },
  );

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Approvals</h1>
          <p className="text-muted-foreground mt-1">
            Unified inbox: pending MCP changes, Brain AI proposals, service requests, and project requests across all clients. Oldest first.
          </p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-card text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50"
        >
          <span className="material-icons text-base">refresh</span>
          Refresh
        </button>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(['mcp', 'brain', 'service', 'project'] as const).map((src) => {
          const cfg = SOURCE_CONFIG[src];
          return (
            <div key={src} className="p-4 rounded-xl border border-border bg-card">
              <div className="flex items-center gap-2">
                <span className={`material-icons text-sm ${cfg.color.split(' ')[1]}`}>{cfg.icon}</span>
                <span className="text-2xl font-bold text-foreground">{counts[src] ?? 0}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{cfg.label}</p>
            </div>
          );
        })}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading approvals...</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-xl">
          <span className="material-icons text-4xl text-muted-foreground mb-2">inbox</span>
          <p className="text-foreground font-medium">No pending approvals</p>
          <p className="text-sm text-muted-foreground mt-1">You&rsquo;re all caught up.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => {
            const cfg = SOURCE_CONFIG[row.source];
            const approveKey = `${row.source}:${row.id}:approve`;
            const rejectKey = `${row.source}:${row.id}:reject`;
            const isActing = actingKey === approveKey || actingKey === rejectKey;
            const clientLabel = row.clientCompany?.trim() || row.clientUserName?.trim() || row.clientUserEmail || `Client #${row.clientId}`;

            return (
              <div
                key={`${row.source}-${row.id}`}
                className="bg-card border border-border rounded-xl p-4 flex items-start gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${cfg.color}`}>
                      <span className="material-icons text-xs">{cfg.icon}</span>
                      {cfg.label}
                    </span>
                    <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      {clientLabel}
                    </span>
                    {row.detail && (
                      <span className="text-xs text-muted-foreground font-mono">{row.detail}</span>
                    )}
                    <span className="text-xs text-muted-foreground ml-auto" title={new Date(row.createdAt).toLocaleString()}>
                      {timeAgo(row.createdAt)}
                    </span>
                  </div>
                  <h3 className="font-medium text-foreground mt-1.5 line-clamp-2">{row.summary}</h3>
                  {row.clientUserEmail && (
                    <p className="text-xs text-muted-foreground mt-0.5">{row.clientUserEmail}</p>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => void act(row, 'approve')}
                    disabled={isActing}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-medium hover:bg-green-700 disabled:opacity-50"
                  >
                    <span className="material-icons text-sm">check_circle</span>
                    {actingKey === approveKey ? 'Approving...' : 'Approve'}
                  </button>
                  <button
                    onClick={() => void act(row, 'reject')}
                    disabled={isActing}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border bg-card text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50"
                  >
                    <span className="material-icons text-sm">cancel</span>
                    {actingKey === rejectKey ? 'Rejecting...' : 'Reject'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
