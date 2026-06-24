'use client';

import { useState, useEffect, useCallback } from 'react';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pBtnPrimary, pCard } from '@/components/portal/portal-ui';

interface PendingItem {
  id: number;
  entityType: string;
  entityId: number | null;
  operation: string;
  summary: string | null;
  status: string;
  keyId: number | null;
  keyName: string | null;
  submitterName: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  appliedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
}

interface PendingDetail {
  change: PendingItem & {
    payload: unknown;
    originalSnapshot: unknown;
  };
  keyName: string | null;
  submitterName: string | null;
  submitterEmail: string | null;
}

type StatusFilter = 'pending' | 'applied' | 'rejected' | 'failed' | 'expired' | 'all';

const entityLabel: Record<string, string> = {
  post: 'Post',
  pitch_deck: 'Pitch Deck',
  pitch_deck_slides: 'Deck Slides',
  proposal: 'Proposal',
  email_campaign: 'Email Campaign',
};

const statusBadge: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200',
  applied: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200',
  rejected: 'bg-muted text-muted-foreground',
  failed: 'bg-destructive/10 text-destructive',
  approved: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200',
  expired: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

interface ApiResponse<TData = unknown, TMeta = unknown> {
  success: boolean;
  data?: TData;
  meta?: TMeta;
  message?: string;
}

async function safeJson<TData = unknown, TMeta = unknown>(
  url: string,
  init?: RequestInit,
): Promise<ApiResponse<TData, TMeta>> {
  try {
    const r = await fetch(url, init);
    const text = await r.text();
    if (!text) return { success: false };
    return JSON.parse(text);
  } catch {
    return { success: false };
  }
}

/** Compute a shallow diff between two JSON-serializable objects.
 * Each row is a top-level key with before/after values and a change kind. */
type DiffKind = 'added' | 'removed' | 'changed' | 'unchanged';
interface DiffRow { key: string; before: unknown; after: unknown; kind: DiffKind }

function diffObjects(before: unknown, after: unknown): DiffRow[] {
  const b = (before && typeof before === 'object' && !Array.isArray(before)) ? before as Record<string, unknown> : {};
  const a = (after && typeof after === 'object' && !Array.isArray(after)) ? after as Record<string, unknown> : {};
  const keys = Array.from(new Set([...Object.keys(b), ...Object.keys(a)])).sort();
  return keys.map(key => {
    const hasBefore = key in b;
    const hasAfter = key in a;
    if (!hasBefore) return { key, before: undefined, after: a[key], kind: 'added' as const };
    if (!hasAfter) return { key, before: b[key], after: undefined, kind: 'removed' as const };
    const bJson = JSON.stringify(b[key]);
    const aJson = JSON.stringify(a[key]);
    return { key, before: b[key], after: a[key], kind: bJson === aJson ? 'unchanged' as const : 'changed' as const };
  });
}

function formatValue(v: unknown): string {
  if (v === undefined) return '';
  if (v === null) return 'null';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try { return JSON.stringify(v, null, 2); } catch { return String(v); }
}

function DiffViewer({ before, after }: { before: unknown; after: unknown }) {
  const rows = diffObjects(before, after);
  const changedCount = rows.filter(r => r.kind !== 'unchanged').length;
  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground italic">No fields to compare.</p>;
  }
  return (
    <div className="space-y-2">
      <div className="text-[11px] text-muted-foreground">
        {changedCount} of {rows.length} field{rows.length === 1 ? '' : 's'} changed.
      </div>
      <div className="border border-border rounded-md overflow-hidden divide-y divide-border">
        {rows.map(row => {
          const rowBg =
            row.kind === 'added' ? 'bg-emerald-50 dark:bg-emerald-900/10' :
            row.kind === 'removed' ? 'bg-destructive/5' :
            row.kind === 'changed' ? 'bg-amber-50 dark:bg-amber-900/10' :
            'bg-transparent';
          return (
            <div key={row.key} className={`${rowBg} px-3 py-2 text-xs`}>
              <div className="flex items-center justify-between gap-2 mb-1">
                <code className="font-semibold text-foreground">{row.key}</code>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{row.kind}</span>
              </div>
              {row.kind === 'unchanged' ? (
                <pre className="text-muted-foreground whitespace-pre-wrap break-words line-clamp-3">{formatValue(row.before)}</pre>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-[10px] text-muted-foreground mb-0.5">before</div>
                    <pre className="bg-muted/40 rounded px-2 py-1 whitespace-pre-wrap break-words max-h-40 overflow-auto">
                      {row.kind === 'added' ? <span className="text-muted-foreground italic">(not set)</span> : formatValue(row.before)}
                    </pre>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground mb-0.5">after</div>
                    <pre className="bg-muted/40 rounded px-2 py-1 whitespace-pre-wrap break-words max-h-40 overflow-auto">
                      {row.kind === 'removed' ? <span className="text-muted-foreground italic">(removed)</span> : formatValue(row.after)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const MAX_BULK = 25;

interface BulkResultItem { id: number; status: 'applied' | 'failed' | 'rejected' | 'skipped'; error?: string }
interface BulkResult { total: number; applied?: number; rejected?: number; failed: number; skipped: number; results: BulkResultItem[] }

export default function PortalApprovalsPage() {
  const [items, setItems] = useState<PendingItem[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>('pending');
  const [selected, setSelected] = useState<PendingDetail | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<'diff' | 'raw'>('diff');
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
  const [bulkAction, setBulkAction] = useState<'approve' | 'reject' | null>(null);
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    const qs = filter === 'all' ? '' : `?status=${filter}`;
    const res = await safeJson<PendingItem[], { role: string | null; canManage: boolean }>(`/api/portal/approvals${qs}`);
    if (res.success && res.data) {
      setItems(res.data);
      setCanManage(res.meta?.canManage ?? false);
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const openDetail = useCallback(async (id: number) => {
    setSelected(null);
    setNote('');
    const res = await safeJson<PendingDetail>(`/api/portal/approvals/${id}`);
    if (res.success && res.data) setSelected(res.data);
  }, []);

  // Auto-open an approval if ?id=N is in the URL (e.g. from a notification).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const idParam = new URLSearchParams(window.location.search).get('id');
    if (idParam) {
      const idNum = parseInt(idParam, 10);
      if (!Number.isNaN(idNum)) {
        setFilter('all');
        openDetail(idNum);
      }
    }
  }, [openDetail]);

  const approve = async () => {
    if (!selected) return;
    setBusy(true);
    const res = await safeJson(`/api/portal/approvals/${selected.change.id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: note.trim() || undefined }),
    });
    setBusy(false);
    if (res.success) {
      setSelected(null);
      setNote('');
      fetchList();
    } else {
      alert(res.message ?? 'Apply failed');
      fetchList();
    }
  };

  const reject = async () => {
    if (!selected) return;
    if (!confirm('Reject this pending change? It will NOT be applied.')) return;
    setBusy(true);
    const res = await safeJson(`/api/portal/approvals/${selected.change.id}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: note.trim() || undefined }),
    });
    setBusy(false);
    if (res.success) {
      setSelected(null);
      setNote('');
      fetchList();
    } else {
      alert(res.message ?? 'Reject failed');
    }
  };

  const renderJson = (value: unknown) => {
    if (value === null || value === undefined) return <span className="text-muted-foreground italic">(none)</span>;
    return (
      <pre className="text-xs bg-muted/40 rounded-md p-3 overflow-auto max-h-96 whitespace-pre-wrap break-words">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  };

  const doBulk = async (action: 'approve' | 'reject') => {
    const ids = Array.from(checkedIds);
    if (ids.length === 0) return;
    setBusy(true);
    setBulkResult(null);
    const res = await safeJson<BulkResult>(`/api/portal/approvals/bulk-${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, note: note.trim() || undefined }),
    });
    setBusy(false);
    setBulkAction(null);
    if (res.success && res.data) {
      setBulkResult(res.data);
      setCheckedIds(new Set());
      setNote('');
      fetchList();
    } else {
      alert(res.message ?? `Bulk ${action} failed`);
    }
  };

  // Group selected ids by entity type for the confirmation modal.
  const selectedItems = items.filter(i => checkedIds.has(i.id));
  const selectedByType = selectedItems.reduce<Record<string, number>>((acc, it) => {
    const key = entityLabel[it.entityType] ?? it.entityType;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <PortalPageHeader
        eyebrow="REVIEW"
        title="MCP Approvals"
        subtitle={<>Review AI-agent-initiated CMS changes before they go live. Keys flagged with{' '}<code className="text-xs">require_cms_approval</code> stage writes here instead of applying directly.</>}
      />

      {/* Filter tabs */}
      <div className="flex gap-1 border-b border-border text-sm overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
        {(['pending', 'applied', 'rejected', 'failed', 'expired', 'all'] as StatusFilter[]).map(f => (
          <button
            key={f}
            onClick={() => { setFilter(f); setSelected(null); setCheckedIds(new Set()); }}
            className={`px-4 py-2.5 font-medium border-b-2 transition-colors whitespace-nowrap ${
              filter === f
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.3fr] gap-4">
        {/* List */}
        <div className={`${pCard} overflow-hidden flex flex-col`}>
          {canManage && items.some(i => i.status === 'pending') && (() => {
            const pendingIds = items.filter(i => i.status === 'pending').map(i => i.id);
            const allChecked = pendingIds.length > 0 && pendingIds.every(id => checkedIds.has(id));
            return (
              <div className="flex items-center gap-2 px-3 py-2 border-b border-border text-xs bg-muted/30">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={(e) => {
                    setCheckedIds(e.target.checked ? new Set(pendingIds) : new Set());
                  }}
                  className="w-3.5 h-3.5 accent-primary cursor-pointer"
                />
                <span className="text-muted-foreground">
                  {checkedIds.size > 0 ? `${checkedIds.size} selected` : `Select all ${pendingIds.length} pending`}
                </span>
                {checkedIds.size > MAX_BULK && (
                  <span className="text-destructive ml-auto">Max {MAX_BULK} per batch</span>
                )}
              </div>
            );
          })()}
          <div className="divide-y divide-border">
            {loading ? (
              <div className="p-8 text-center text-muted-foreground flex items-center justify-center gap-2">
                <span className="material-icons animate-spin text-base">progress_activity</span>
                Loading...
              </div>
            ) : items.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <span className="material-icons text-4xl mb-2 block">check_circle</span>
                No {filter === 'all' ? '' : filter + ' '}changes.
              </div>
            ) : (
              items.map(item => {
                const isPending = item.status === 'pending';
                const isChecked = checkedIds.has(item.id);
                return (
                  <div
                    key={item.id}
                    className={`flex items-start gap-2 p-3 hover:bg-accent transition-colors ${
                      selected?.change.id === item.id ? 'bg-accent' : ''
                    }`}
                  >
                    {canManage && isPending && (
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          e.stopPropagation();
                          setCheckedIds(prev => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(item.id);
                            else next.delete(item.id);
                            return next;
                          });
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-3.5 h-3.5 mt-1 accent-primary cursor-pointer shrink-0"
                      />
                    )}
                    <button
                      onClick={() => openDetail(item.id)}
                      className="flex-1 text-left min-w-0"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusBadge[item.status] ?? ''}`}>
                              {item.status}
                            </span>
                            <span className="text-xs font-medium text-muted-foreground">
                              {entityLabel[item.entityType] ?? item.entityType} · {item.operation}
                            </span>
                          </div>
                          <p className="text-sm text-foreground mt-1 line-clamp-2">{item.summary ?? '(no summary)'}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {item.keyName ?? 'unknown key'} · {new Date(item.createdAt).toLocaleString()}
                          </p>
                        </div>
                        {item.errorMessage && (
                          <span className="material-icons text-destructive text-base shrink-0" title={item.errorMessage}>
                            error
                          </span>
                        )}
                      </div>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Detail */}
        <div className={`${pCard} p-5 space-y-4`}>
          {!selected ? (
            <div className="py-12 text-center text-muted-foreground">
              <span className="material-icons text-4xl mb-2 block">visibility</span>
              <p className="text-sm">Select a change to review.</p>
            </div>
          ) : (
            <>
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusBadge[selected.change.status] ?? ''}`}>
                    {selected.change.status}
                  </span>
                  <span className="text-xs font-medium text-muted-foreground">
                    #{selected.change.id} · {entityLabel[selected.change.entityType] ?? selected.change.entityType} · {selected.change.operation}
                  </span>
                </div>
                <h2 className="text-base font-semibold text-foreground">{selected.change.summary ?? '(no summary)'}</h2>
                <p className="text-xs text-muted-foreground">
                  Submitted by {selected.submitterName ?? 'unknown'} via key &quot;{selected.keyName ?? 'unknown'}&quot; on{' '}
                  {new Date(selected.change.createdAt).toLocaleString()}
                </p>
              </div>

              {selected.change.status === 'failed' && selected.change.errorMessage && (
                <div className="text-xs bg-destructive/10 text-destructive rounded-md p-3">
                  <strong>Apply failed:</strong> {selected.change.errorMessage}
                </div>
              )}

              {selected.change.reviewNote && (
                <div className="text-xs text-muted-foreground">
                  <strong>Review note:</strong> {selected.change.reviewNote}
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {selected.change.operation === 'create' ? 'Proposed content' : 'Field-level diff'}
                  </span>
                  <div className="flex gap-0.5 rounded-md border border-border overflow-hidden text-[11px]">
                    <button
                      onClick={() => setView('diff')}
                      className={`px-2 py-1 ${view === 'diff' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'}`}
                    >
                      Diff
                    </button>
                    <button
                      onClick={() => setView('raw')}
                      className={`px-2 py-1 ${view === 'raw' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'}`}
                    >
                      Raw JSON
                    </button>
                  </div>
                </div>
                {view === 'diff' ? (
                  <DiffViewer
                    before={selected.change.operation === 'create' ? {} : selected.change.originalSnapshot}
                    after={selected.change.payload}
                  />
                ) : (
                  <div className="space-y-2">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Proposed payload</div>
                      {renderJson(selected.change.payload)}
                    </div>
                    {selected.change.operation !== 'create' && (
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Current state</div>
                        {renderJson(selected.change.originalSnapshot)}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {selected.change.status === 'pending' && !canManage && (
                <div className="text-xs text-muted-foreground bg-muted/40 rounded-md p-3 border border-border">
                  <span className="material-icons text-sm align-middle mr-1">info</span>
                  Only owners and admins can approve or reject pending changes.
                </div>
              )}

              {selected.change.status === 'pending' && canManage && (
                <div className="space-y-3 pt-2 border-t border-border">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Review note (optional)</label>
                    <textarea
                      value={note}
                      onChange={e => setNote(e.target.value)}
                      rows={2}
                      className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="Add a note for the submitter..."
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={approve}
                      disabled={busy}
                      className={`flex-1 ${pBtnPrimary}`}
                    >
                      <span className="material-icons text-base">check</span>
                      {busy ? 'Applying...' : 'Approve & Apply'}
                    </button>
                    <button
                      onClick={reject}
                      disabled={busy}
                      className="px-4 py-2 text-sm font-medium rounded-md border border-border text-destructive hover:bg-destructive/10 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Floating bulk-action bar */}
      {checkedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-card border border-border rounded-full shadow-lg px-4 py-2 flex items-center gap-3 flex-wrap max-w-[calc(100vw-2rem)]">
          <span className="text-sm font-medium text-foreground">
            {checkedIds.size} selected
          </span>
          {checkedIds.size > MAX_BULK && (
            <span className="text-xs text-destructive">Max {MAX_BULK} per batch</span>
          )}
          <button
            onClick={() => setBulkAction('approve')}
            disabled={checkedIds.size > MAX_BULK || busy}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <span className="material-icons text-sm">check</span>
            Approve
          </button>
          <button
            onClick={() => setBulkAction('reject')}
            disabled={checkedIds.size > MAX_BULK || busy}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-full border border-border text-destructive hover:bg-destructive/10 disabled:opacity-50"
          >
            Reject
          </button>
          <button
            onClick={() => setCheckedIds(new Set())}
            className="p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-accent"
            title="Clear selection"
          >
            <span className="material-icons text-base">close</span>
          </button>
        </div>
      )}

      {/* Bulk confirmation modal */}
      {bulkAction && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className={`${pCard} max-w-md w-full p-6 space-y-4`}>
            <div>
              <h3 className="text-lg font-semibold text-foreground">
                {bulkAction === 'approve' ? 'Approve' : 'Reject'} {checkedIds.size} change{checkedIds.size === 1 ? '' : 's'}?
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                {bulkAction === 'approve'
                  ? 'Each staged mutation will run with its stored payload. Items apply serially; a single failure does not halt the rest.'
                  : 'Each selected change will be marked rejected. No mutations run.'}
              </p>
            </div>

            <div className="bg-muted/40 rounded-md p-3 space-y-1 text-sm">
              {Object.entries(selectedByType).map(([type, count]) => (
                <div key={type} className="flex justify-between">
                  <span className="text-foreground">{type}</span>
                  <span className="font-semibold text-foreground">{count}</span>
                </div>
              ))}
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Review note (applied to all)</label>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Optional..."
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => doBulk(bulkAction)}
                disabled={busy}
                className={`flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md disabled:opacity-50 ${
                  bulkAction === 'approve'
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                    : 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                }`}
              >
                {busy
                  ? (bulkAction === 'approve' ? 'Applying...' : 'Rejecting...')
                  : `Confirm ${bulkAction}`}
              </button>
              <button
                onClick={() => { setBulkAction(null); }}
                disabled={busy}
                className="px-4 py-2 text-sm font-medium rounded-md border border-border text-foreground hover:bg-accent disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk result toast */}
      {bulkResult && (
        <div className="fixed bottom-6 right-6 z-40 bg-card border border-border rounded-lg shadow-lg p-4 max-w-sm space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-foreground">
              Bulk result: {bulkResult.applied ?? bulkResult.rejected ?? 0} of {bulkResult.total}
            </div>
            <button
              onClick={() => setBulkResult(null)}
              className="text-muted-foreground hover:text-foreground"
            >
              <span className="material-icons text-base">close</span>
            </button>
          </div>
          <div className="text-xs text-muted-foreground space-y-0.5">
            {bulkResult.applied !== undefined && <div><span className="text-emerald-600">Applied:</span> {bulkResult.applied}</div>}
            {bulkResult.rejected !== undefined && <div><span className="text-muted-foreground">Rejected:</span> {bulkResult.rejected}</div>}
            {bulkResult.failed > 0 && <div><span className="text-destructive">Failed:</span> {bulkResult.failed}</div>}
            {bulkResult.skipped > 0 && <div><span className="text-muted-foreground">Skipped:</span> {bulkResult.skipped}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
