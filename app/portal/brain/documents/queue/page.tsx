'use client';

/**
 * Brain Documents — "My reading queue".
 *
 * Resolves the current user's brain_people row via the cross-document feed
 * endpoint (which defaults personId to the authenticated user's brain_people
 * row when none is supplied). If the user isn't linked to a brain_people row,
 * the API returns `{ items: [], personId: null, hint }` — we surface the hint
 * inline so the user knows what to do.
 *
 * Sections:
 *   - Overdue (dueAt < now, not yet ack'd) — red accent
 *   - Due soon (dueAt within next 7 days) — amber accent
 *   - Open (no due date or future due) — default accent
 *   - Recently acknowledged (last 20 acks)
 *
 * Each open row: title (link to detail), pinned-version chip if any, due
 * date, "Mark as read" inline button → POST /acknowledge against the
 * currentVersionToReadId.
 */

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RequiredReadForPersonRow, AckForPersonRow } from '@/lib/brain/document-acks';

interface QueueResponse {
  success: boolean;
  data?: {
    items: RequiredReadForPersonRow[];
    acknowledgments: AckForPersonRow[];
    personId: number | null;
    hint?: string;
  };
  message?: string;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export default function BrainDocumentsQueuePage() {
  const [items, setItems] = useState<RequiredReadForPersonRow[]>([]);
  const [acks, setAcks] = useState<AckForPersonRow[]>([]);
  const [personId, setPersonId] = useState<number | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<number | null>(null);

  // Snapshot "now" once at mount — react-hooks/purity refuses Date.now()
  // inside a pure useMemo body, and lazy-init useState is the canonical
  // escape hatch for "constant for the lifetime of this component."
  const [nowMs] = useState<number>(() => Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/portal/brain/document-acks?status=all&limit=200');
      const json: QueueResponse = await r.json();
      if (!r.ok || !json.success) {
        setError(json.message || 'Failed to load reading queue.');
        return;
      }
      setItems(json.data?.items ?? []);
      setAcks((json.data?.acknowledgments ?? []).slice(0, 20));
      setPersonId(json.data?.personId ?? null);
      setHint(json.data?.hint ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- load() defers setState into async IIFE; trigger fires synchronously by design
  useEffect(() => { load(); }, [load]);

  // ─── Partition into overdue / due-soon / open ──────────────────────────────
  const { overdue, dueSoon, open } = useMemo(() => {
    const now = nowMs;
    const cutoff = now + 7 * ONE_DAY_MS;
    const overdueRows: RequiredReadForPersonRow[] = [];
    const dueSoonRows: RequiredReadForPersonRow[] = [];
    const openRows: RequiredReadForPersonRow[] = [];
    for (const r of items) {
      if (r.acknowledged) continue;
      if (r.dueAt) {
        const dueMs = new Date(r.dueAt).getTime();
        if (dueMs < now) { overdueRows.push(r); continue; }
        if (dueMs <= cutoff) { dueSoonRows.push(r); continue; }
      }
      openRows.push(r);
    }
    return { overdue: overdueRows, dueSoon: dueSoonRows, open: openRows };
  }, [items, nowMs]);

  const markRead = useCallback(async (row: RequiredReadForPersonRow) => {
    if (!personId) return;
    if (row.currentVersionToReadId === null) {
      alert('This document has no published version yet — nothing to acknowledge.');
      return;
    }
    setActingId(row.requiredReadId);
    // Optimistic update.
    setItems((prev) => prev.map((it) =>
      it.requiredReadId === row.requiredReadId
        ? { ...it, acknowledged: true, acknowledgedAt: new Date() }
        : it,
    ));
    try {
      const r = await fetch(`/api/portal/brain/documents/${row.documentId}/acknowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          versionId: row.currentVersionToReadId,
          personId,
          requiredReadId: row.requiredReadId,
        }),
      });
      const json = await r.json();
      if (!r.ok || !json.success) {
        // Roll back optimistic update.
        setItems((prev) => prev.map((it) =>
          it.requiredReadId === row.requiredReadId
            ? { ...it, acknowledged: false, acknowledgedAt: null }
            : it,
        ));
        alert(json.message || 'Acknowledge failed.');
        return;
      }
      load();
    } catch (err) {
      setItems((prev) => prev.map((it) =>
        it.requiredReadId === row.requiredReadId
          ? { ...it, acknowledged: false, acknowledgedAt: null }
          : it,
      ));
      alert(err instanceof Error ? err.message : 'Network error');
    } finally {
      setActingId(null);
    }
  }, [load, personId]);

  return (
    <div className="max-w-4xl mx-auto py-6 px-4 space-y-5">
      <nav className="text-xs text-muted-foreground flex items-center gap-1">
        <Link href="/portal/brain/documents" className="hover:text-foreground inline-flex items-center gap-0.5">
          <span className="material-icons text-sm">description</span>
          Documents
        </Link>
        <span className="material-icons text-sm">chevron_right</span>
        <span>My reading queue</span>
      </nav>

      <header>
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <span className="material-icons text-primary">assignment_late</span>
          My reading queue
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Documents you&apos;re required to read, plus your recent acknowledgments.
        </p>
      </header>

      {hint && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 text-sm text-amber-900 dark:text-amber-200">
          <div className="font-medium inline-flex items-center gap-2 mb-1">
            <span className="material-icons text-base">info</span>
            No brain-people record linked
          </div>
          <p className="text-xs">{hint}</p>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
          <span className="material-icons animate-spin mr-2">progress_activity</span>
          Loading…
        </div>
      )}

      {error && !loading && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 text-sm text-destructive">
          <div className="flex items-center gap-2 font-medium mb-1">
            <span className="material-icons text-base">error_outline</span>
            Couldn&apos;t load reading queue
          </div>
          <p>{error}</p>
        </div>
      )}

      {!loading && !error && !hint && (
        <div className="space-y-5">
          <QueueSection
            title="Overdue"
            icon="warning"
            accent="red"
            rows={overdue}
            actingId={actingId}
            onMarkRead={markRead}
            disabled={personId === null}
          />
          <QueueSection
            title="Due soon"
            icon="schedule"
            accent="amber"
            rows={dueSoon}
            actingId={actingId}
            onMarkRead={markRead}
            disabled={personId === null}
          />
          <QueueSection
            title="Open"
            icon="task"
            accent="default"
            rows={open}
            actingId={actingId}
            onMarkRead={markRead}
            disabled={personId === null}
          />

          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 inline-flex items-center gap-1">
              <span className="material-icons text-[14px]">verified</span>
              Recently acknowledged ({acks.length})
            </h2>
            {acks.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No acknowledgments yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {acks.map((a) => (
                  <li
                    key={a.ackId}
                    className="flex items-center gap-2 px-3 py-2 rounded-md bg-card border border-border"
                  >
                    <span className="material-icons text-base text-emerald-500">check_circle</span>
                    <Link
                      href={`/portal/brain/documents/${a.documentId}`}
                      className="text-sm text-foreground hover:text-primary truncate flex-1"
                    >
                      {a.documentTitle}
                    </Link>
                    <span className="text-[11px] text-muted-foreground inline-flex items-center gap-0.5 shrink-0">
                      <span className="material-icons text-[12px]">history</span>
                      v{a.versionNumber}
                    </span>
                    <span className="text-[11px] text-muted-foreground inline-flex items-center gap-0.5 shrink-0">
                      <span className="material-icons text-[12px]">schedule</span>
                      {new Date(a.acknowledgedAt).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

// ─── section ─────────────────────────────────────────────────────────────────

function QueueSection({
  title,
  icon,
  accent,
  rows,
  actingId,
  onMarkRead,
  disabled,
}: {
  title: string;
  icon: string;
  accent: 'red' | 'amber' | 'default';
  rows: RequiredReadForPersonRow[];
  actingId: number | null;
  onMarkRead: (row: RequiredReadForPersonRow) => void;
  disabled: boolean;
}) {
  const accentRowClasses = {
    red: 'border-red-500/30 bg-red-500/5',
    amber: 'border-amber-500/30 bg-amber-500/5',
    default: 'border-border bg-card',
  }[accent];
  const accentLabel = {
    red: 'text-red-600 dark:text-red-400',
    amber: 'text-amber-600 dark:text-amber-400',
    default: 'text-muted-foreground',
  }[accent];

  return (
    <section>
      <h2 className={`text-xs font-semibold uppercase tracking-wide mb-2 inline-flex items-center gap-1 ${accentLabel}`}>
        <span className="material-icons text-[14px]">{icon}</span>
        {title} ({rows.length})
      </h2>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">Nothing here.</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li
              key={r.requiredReadId}
              className={`flex items-center gap-2 px-3 py-2 rounded-md border ${accentRowClasses}`}
            >
              <span className={`material-icons text-base ${accentLabel}`}>description</span>
              <div className="min-w-0 flex-1">
                <Link
                  href={`/portal/brain/documents/${r.documentId}`}
                  className="text-sm font-medium text-foreground hover:text-primary truncate block"
                >
                  {r.documentTitle}
                </Link>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  {r.pinnedVersionId !== null && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] rounded bg-primary/15 text-primary border border-primary/30">
                      <span className="material-icons text-[11px]">push_pin</span>
                      Pinned version
                    </span>
                  )}
                  {r.dueAt && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] rounded bg-muted text-muted-foreground">
                      <span className="material-icons text-[11px]">schedule</span>
                      Due {new Date(r.dueAt).toLocaleDateString()}
                    </span>
                  )}
                  {r.currentVersionToReadId === null && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                      <span className="material-icons text-[11px]">info</span>
                      No published version yet
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onMarkRead(r)}
                disabled={disabled || actingId === r.requiredReadId || r.currentVersionToReadId === null}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 shrink-0"
              >
                {actingId === r.requiredReadId
                  ? <span className="material-icons text-sm animate-spin">progress_activity</span>
                  : <span className="material-icons text-sm">check</span>}
                Mark as read
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
