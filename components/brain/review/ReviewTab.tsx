'use client';

// Extracted verbatim from app/portal/brain/tasks/page.tsx (PUX-165) so /portal/brain/review can render the same queue.

import { EmptyState } from '@/components/portal/EmptyState';
import Link from 'next/link';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { pBtnPrimary, pBtnGhost, pCard } from '@/components/portal/portal-ui';
import { ReviewCard, type ReviewItem } from './ReviewCard';

interface MeetingShape {
  id: number;
  title: string;
  status: string;
  meetingDate: string | null;
  source: string;
  gmailThreadId: string | null;
}

const REVIEW_STATUS_TABS: { key: 'pending' | 'approved' | 'rejected' | 'all'; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All' },
];

// ─── Review Tab ──────────────────────────────────────────────────────────────

// PUX-165 (design doc screen 24): `studio` applies the first-row-teal rule —
// the first pending item gets the teal Approve, every other row stays ghost.
export function ReviewTab({ onPendingChange, studio = false }: { onPendingChange: (n: number) => void; studio?: boolean }) {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [meetings, setMeetings] = useState<Record<number, MeetingShape>>({});
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/portal/brain/review?status=${statusFilter}`);
      const json = await r.json();
      if (!r.ok || !json.success) {
        setError(json.message || 'Failed to load review queue.');
        setItems([]);
      } else {
        setItems(json.data.items);
        setMeetings(json.data.meetings);
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  // Clear selection on tab change and prune any IDs that are no longer pending.
  useEffect(() => { setSelected(new Set()); }, [statusFilter]);
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const stillPending = new Set(items.filter((i) => i.status === 'pending').map((i) => i.id));
      const next = new Set<number>();
      let changed = false;
      for (const id of prev) {
        if (stillPending.has(id)) next.add(id); else changed = true;
      }
      return changed ? next : prev;
    });
  }, [items]);

  // Refresh the parent's pending count whenever this view mutates the queue.
  const refreshPendingCount = useCallback(async () => {
    try {
      const r = await fetch('/api/portal/brain/review?status=pending');
      const json = await r.json();
      if (json.success) onPendingChange(json.data.items.length);
    } catch {}
  }, [onPendingChange]);

  const groups = useMemo(() => {
    const byMeeting = new Map<number | 'other', ReviewItem[]>();
    for (const item of items) {
      const key = item.sourceType === 'meeting' ? item.sourceId : 'other' as const;
      if (!byMeeting.has(key)) byMeeting.set(key, []);
      byMeeting.get(key)!.push(item);
    }
    return [...byMeeting.entries()].sort(([a], [b]) => {
      if (a === 'other') return 1;
      if (b === 'other') return -1;
      const da = meetings[a as number]?.meetingDate ?? '';
      const db = meetings[b as number]?.meetingDate ?? '';
      return db.localeCompare(da);
    });
  }, [items, meetings]);

  const pendingIds = useMemo(
    () => items.filter((i) => i.status === 'pending').map((i) => i.id),
    [items],
  );
  const allPendingSelected = pendingIds.length > 0 && pendingIds.every((id) => selected.has(id));

  const toggleSelect = useCallback((id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleAllPending = useCallback(() => {
    setSelected((prev) => {
      const allChecked = pendingIds.length > 0 && pendingIds.every((id) => prev.has(id));
      return allChecked ? new Set() : new Set(pendingIds);
    });
  }, [pendingIds]);

  const toggleGroupPending = useCallback((groupPendingIds: number[]) => {
    if (groupPendingIds.length === 0) return;
    setSelected((prev) => {
      const allChecked = groupPendingIds.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allChecked) {
        for (const id of groupPendingIds) next.delete(id);
      } else {
        for (const id of groupPendingIds) next.add(id);
      }
      return next;
    });
  }, []);

  const bulkAction = useCallback(async (action: 'approve' | 'reject') => {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBulkBusy(true);
    setError(null);
    try {
      const results = await Promise.allSettled(
        ids.map(async (id) => {
          const r = await fetch(`/api/portal/brain/review-items/${id}/${action}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          });
          const json = await r.json();
          if (!r.ok || !json.success) throw new Error(json.message || `${action} failed`);
          return json;
        }),
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed > 0) {
        setError(`${failed} of ${ids.length} ${action} request${ids.length === 1 ? '' : 's'} failed.`);
      }
      setSelected(new Set());
      await load();
      void refreshPendingCount();
    } finally {
      setBulkBusy(false);
    }
  }, [selected, load, refreshPendingCount]);

  const approve = async (item: ReviewItem) => {
    setBusyId(item.id);
    try {
      const r = await fetch(`/api/portal/brain/review-items/${item.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = await r.json();
      if (!r.ok || !json.success) setError(json.message || 'Failed to approve.');
      await load();
      void refreshPendingCount();
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (item: ReviewItem) => {
    setBusyId(item.id);
    try {
      const r = await fetch(`/api/portal/brain/review-items/${item.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = await r.json();
      if (!r.ok || !json.success) setError(json.message || 'Failed to reject.');
      await load();
      void refreshPendingCount();
    } finally {
      setBusyId(null);
    }
  };

  const pendingTotal = useMemo(() => items.filter((i) => i.status === 'pending').length, [items]);

  const firstPendingId = studio ? (groups.flatMap(([, g]) => g).find((i) => i.status === 'pending')?.id ?? null) : null;

  return (
    <>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-1 overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
          {REVIEW_STATUS_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setStatusFilter(t.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-xl transition-colors whitespace-nowrap ${
                statusFilter === t.key
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {statusFilter === 'pending' && (
            <div className="text-sm text-muted-foreground">
              {pendingTotal === 0
                ? <span className="text-emerald-600 dark:text-emerald-400 font-medium inline-flex items-center gap-1"><span className="material-icons text-base">check_circle</span> All clear</span>
                : <span><strong className="text-foreground">{pendingTotal}</strong> pending</span>
              }
            </div>
          )}
          <Link
            href="/portal/brain/communications"
            className="text-xs text-primary hover:underline inline-flex items-center gap-0.5"
          >
            <span className="material-icons text-sm">forum</span>
            View communications
          </Link>
        </div>
      </div>

      {pendingIds.length > 0 && (
        <div className={`flex items-center justify-between gap-4 ${pCard} px-3 py-2 flex-wrap`}>
          <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
              checked={allPendingSelected}
              ref={(el) => { if (el) el.indeterminate = !allPendingSelected && selected.size > 0; }}
              onChange={toggleAllPending}
              disabled={bulkBusy}
              aria-label="Select all pending items"
            />
            <span>
              {selected.size > 0
                ? <><strong className="text-foreground">{selected.size}</strong> selected</>
                : <>Select all pending ({pendingIds.length})</>}
            </span>
          </label>
          {selected.size > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => bulkAction('reject')}
                disabled={bulkBusy}
                className={`${pBtnGhost} !py-1 !px-3 !text-xs hover:border-destructive/50 hover:text-destructive`}
              >
                <span className="material-icons text-sm">close</span>
                Reject {selected.size}
              </button>
              <button
                onClick={() => bulkAction('approve')}
                disabled={bulkBusy}
                className={`${pBtnPrimary} !py-1 !px-3 !text-xs`}
              >
                {bulkBusy
                  ? <><span className="material-icons animate-spin text-sm">progress_activity</span>Working…</>
                  : <><span className="material-icons text-sm">check</span>Approve {selected.size}</>}
              </button>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <span className="material-icons animate-spin mr-2">progress_activity</span>
          Loading…
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title={statusFilter === 'pending' ? 'Nothing pending review.' : 'Nothing here yet.'}
          body="New items appear here when AI processes a communication or email thread."
          ghostLabel="Review item"
          legacy={
        <div className="text-center py-12 bg-card border border-border rounded-2xl">
          <span className="material-icons text-4xl text-muted-foreground mb-2 block">inbox</span>
          <p className="text-foreground text-sm font-medium">
            {statusFilter === 'pending' ? 'Nothing pending review.' : 'Nothing here yet.'}
          </p>
          <p className="text-muted-foreground text-xs mt-1">
            New items appear here when AI processes a communication or email thread.
          </p>
        </div>
          }
        />
      ) : (
        <div className="space-y-6">
          {groups.map(([key, groupItems]) => {
            const meeting = key === 'other' ? null : meetings[key as number];
            const groupPendingIds = groupItems.filter((i) => i.status === 'pending').map((i) => i.id);
            const allGroupSelected = groupPendingIds.length > 0 && groupPendingIds.every((id) => selected.has(id));
            const someGroupSelected = groupPendingIds.some((id) => selected.has(id)) && !allGroupSelected;
            return (
              <section key={String(key)} className="space-y-2">
                <div className="flex items-center gap-2">
                  {groupPendingIds.length > 0 && (
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
                      checked={allGroupSelected}
                      ref={(el) => { if (el) el.indeterminate = someGroupSelected; }}
                      onChange={() => toggleGroupPending(groupPendingIds)}
                      disabled={bulkBusy}
                      aria-label="Select all pending items in this section"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    {meeting ? (
                      <Link
                        href={`/portal/brain/communications/${meeting.id}`}
                        className="text-sm font-medium text-foreground hover:text-primary truncate inline-flex items-center gap-1"
                      >
                        <span className="material-icons text-base text-muted-foreground">
                          {meeting.gmailThreadId ? 'forum' : 'chat'}
                        </span>
                        {meeting.title}
                      </Link>
                    ) : (
                      <span className="text-sm font-medium text-foreground inline-flex items-center gap-1">
                        <span className="material-icons text-base text-muted-foreground">help</span>
                        Other sources
                      </span>
                    )}
                    {meeting?.meetingDate && (
                      <span className="text-xs text-muted-foreground ml-2">
                        {new Date(meeting.meetingDate).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {groupItems.length} item{groupItems.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="space-y-2">
                  {groupItems.map((item) => (
                    <ReviewCard
                      key={item.id}
                      item={item}
                      studio={studio}
                      primary={item.id === firstPendingId}
                      busy={busyId === item.id || bulkBusy}
                      onApprove={() => approve(item)}
                      onReject={() => reject(item)}
                      meetingHref={meeting ? `/portal/brain/communications/${meeting.id}/review` : null}
                      selectable={item.status === 'pending'}
                      selected={selected.has(item.id)}
                      onToggleSelect={() => toggleSelect(item.id)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

export default ReviewTab;
