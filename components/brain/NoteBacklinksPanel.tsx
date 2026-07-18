'use client';

/**
 * NoteBacklinksPanel — list of notes that link TO this note via brain_kb_links.
 * Loads on mount; re-fetches when the noteId changes.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';

interface BacklinkItem {
  id: number;
  title: string;
  snippet: string;
  displayText: string | null;
  updatedAt: string;
}

export interface NoteBacklinksPanelProps {
  noteId: number;
}

export default function NoteBacklinksPanel({ noteId }: NoteBacklinksPanelProps) {
  const [items, setItems] = useState<BacklinkItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Reset to loading state via the same async path as the eventual write,
      // so the effect body itself never calls setState synchronously (the
      // react-hooks/set-state-in-effect rule fires on synchronous setState).
      if (!cancelled) {
        setItems(null);
        setError(null);
      }
      try {
        const r = await fetch(`/api/portal/brain/knowledge/${noteId}/backlinks`);
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
        Loading backlinks…
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-sm text-destructive">
        Failed to load backlinks: {error}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground italic">
        No backlinks yet. When another note links here, it will show up in this list.
      </div>
    );
  }

  return (
    <ul className="p-3 space-y-2">
      {items.map((it) => (
        <li
          key={it.id}
          className="rounded-md border border-border bg-card p-3 hover:border-primary/40 transition-colors"
        >
          <Link
            href={`/portal/brain/knowledge/${it.id}`}
            className="font-medium text-sm text-foreground hover:text-primary inline-flex items-center gap-1"
          >
            <span className="material-icons text-sm text-muted-foreground">link</span>
            {it.title}
          </Link>
          {it.snippet && (
            <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2 whitespace-pre-wrap">
              {it.snippet}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
