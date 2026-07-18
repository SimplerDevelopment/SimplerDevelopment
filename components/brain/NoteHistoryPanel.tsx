'use client';

/**
 * NoteHistoryPanel — read-only audit-log timeline for the current note.
 * Loads on mount; re-fetches when the noteId changes.
 */

import { useEffect, useState } from 'react';

interface AuditLogItem {
  id: number;
  action: string;
  actorId: number | null;
  entityType: string | null;
  entityId: number | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface NoteHistoryPanelProps {
  noteId: number | null;
}

const ACTION_ICON: Record<string, string> = {
  create: 'add_circle',
  update: 'edit',
  soft_deleted: 'delete',
  restored: 'restore_from_trash',
  hard_deleted: 'delete_forever',
  attachment_clear: 'attachment',
  attachment_set: 'attachment',
};

const ACTION_LABEL: Record<string, string> = {
  create: 'Created',
  update: 'Updated',
  soft_deleted: 'Moved to trash',
  restored: 'Restored',
  hard_deleted: 'Deleted forever',
  attachment_clear: 'Cleared attachment',
  attachment_set: 'Set attachment',
};

export default function NoteHistoryPanel({ noteId }: NoteHistoryPanelProps) {
  if (noteId === null) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Select a note to see its history.
      </div>
    );
  }
  return <NoteHistoryPanelInner key={noteId} noteId={noteId} />;
}

function NoteHistoryPanelInner({ noteId }: { noteId: number }) {
  const [items, setItems] = useState<AuditLogItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/portal/brain/knowledge/${noteId}/history`);
        const json = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (!r.ok || !json.success) {
          setError(json.message || `HTTP ${r.status}`);
          setItems([]);
          return;
        }
        setItems(json.data?.items ?? []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Network error');
          setItems([]);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [noteId]);

  if (items === null) {
    return (
      <div className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
        <span className="material-icons animate-spin text-base">progress_activity</span>
        Loading history…
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-sm text-destructive">
        Failed to load history: {error}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground italic">
        No history yet. Edits, restores, and other actions on this note will appear here.
      </div>
    );
  }

  return (
    <ul className="p-3 space-y-2">
      {items.map((it) => {
        const icon = ACTION_ICON[it.action] ?? 'history';
        const label = ACTION_LABEL[it.action] ?? it.action;
        const actor = it.actorId !== null ? `user #${it.actorId}` : 'system';
        const changedFields = extractChangedFields(it.metadata);
        return (
          <li
            key={it.id}
            className="rounded-md border border-border bg-card p-3"
          >
            <div className="flex items-start gap-2">
              <span className="material-icons text-sm text-muted-foreground mt-0.5">{icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">{label}</span>
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                    {formatRelative(it.createdAt)}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">{actor}</div>
                {changedFields.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {changedFields.map((f) => (
                      <span
                        key={f}
                        className="inline-flex items-center px-1.5 py-0.5 rounded bg-muted text-[10px] text-muted-foreground font-mono"
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function extractChangedFields(metadata: Record<string, unknown> | null | undefined): string[] {
  if (!metadata || typeof metadata !== 'object') return [];
  const cf = (metadata as Record<string, unknown>).changedFields;
  if (Array.isArray(cf)) {
    return cf.filter((v): v is string => typeof v === 'string');
  }
  return [];
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
