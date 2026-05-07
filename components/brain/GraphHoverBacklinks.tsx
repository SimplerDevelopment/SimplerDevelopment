'use client';

/**
 * GraphHoverBacklinks — floating side panel that shows a note's inbound
 * wikilinks while the user hovers a node in NoteGraphView. Reuses the same
 * `/api/portal/brain/knowledge/[id]/backlinks` endpoint as the IDE's
 * right-rail Backlinks tab so the data shape stays in sync.
 *
 * The parent owns the hovered noteId; we debounce the actual fetch by 250ms
 * so dragging the cursor across the canvas doesn't fire one request per
 * node, and we cancel any in-flight fetch when the id changes.
 */

import { useEffect, useState } from 'react';

interface BacklinkItem {
  id: number;
  title: string;
  snippet: string;
  displayText: string | null;
  updatedAt: string;
}

interface NoteSummary {
  id: number;
  title: string;
  tags: string[];
}

export interface GraphHoverBacklinksProps {
  /** When null the panel renders nothing. */
  noteId: number | null;
  /** Optional close button handler. */
  onClose?: () => void;
  /** Click handler for a backlink row. Falls back to navigating in the same tab. */
  onSelectNote?: (id: number) => void;
}

export default function GraphHoverBacklinks({
  noteId,
  onClose,
  onSelectNote,
}: GraphHoverBacklinksProps) {
  const [items, setItems] = useState<BacklinkItem[] | null>(null);
  const [note, setNote] = useState<NoteSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (noteId === null) {
      // Clear out so the next show starts from a clean slate.
      setItems(null);
      setNote(null);
      setError(null);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    // Reset state immediately so the spinner shows during the debounce
    // window — otherwise the panel would flash stale data for the previous
    // node.
    setItems(null);
    setNote(null);
    setError(null);

    const debounce = setTimeout(() => {
      (async () => {
        try {
          const [noteRes, linksRes] = await Promise.all([
            fetch(`/api/portal/brain/knowledge/${noteId}`, { signal: controller.signal }),
            fetch(`/api/portal/brain/knowledge/${noteId}/backlinks`, { signal: controller.signal }),
          ]);
          const [noteJson, linksJson] = await Promise.all([
            noteRes.json().catch(() => ({})),
            linksRes.json().catch(() => ({})),
          ]);
          if (cancelled) return;

          if (noteRes.ok && noteJson.success && noteJson.data) {
            const tags = Array.isArray(noteJson.data.tags) ? noteJson.data.tags as string[] : [];
            setNote({
              id: noteJson.data.id,
              title: noteJson.data.title ?? 'Untitled',
              tags,
            });
          }

          if (!linksRes.ok || !linksJson.success) {
            setError(linksJson.message || `HTTP ${linksRes.status}`);
            setItems([]);
            return;
          }
          setItems(linksJson.data?.items ?? []);
        } catch (err) {
          if (cancelled) return;
          if (err instanceof DOMException && err.name === 'AbortError') return;
          setError(err instanceof Error ? err.message : 'Network error');
          setItems([]);
        }
      })();
    }, 250);

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(debounce);
    };
  }, [noteId]);

  if (noteId === null) return null;

  const handleRowClick = (id: number) => {
    if (onSelectNote) {
      onSelectNote(id);
      return;
    }
    window.open(`/portal/brain/knowledge?id=${id}`, '_self');
  };

  return (
    <aside
      className="fixed top-20 right-4 z-40 w-[320px] max-h-[60vh] flex flex-col rounded-lg border border-border bg-card/95 backdrop-blur-md shadow-xl overflow-hidden"
      role="complementary"
      aria-label="Backlinks for hovered note"
    >
      <header className="flex items-start justify-between gap-2 px-3 py-2 border-b border-border bg-muted/40">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
            Backlinks
          </p>
          <h3 className="text-sm font-semibold text-foreground truncate" title={note?.title ?? ''}>
            {note?.title ?? 'Loading…'}
          </h3>
          {note && note.tags.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {note.tags.slice(0, 3).map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-0.5 rounded bg-secondary text-secondary-foreground px-1.5 py-0.5 text-[10px]"
                >
                  <span className="material-icons text-[10px] leading-none">tag</span>
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Close backlinks panel"
          >
            <span className="material-icons text-base leading-none">close</span>
          </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto">
        {items === null && !error && (
          <div className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
            <span className="material-icons animate-spin text-base">progress_activity</span>
            Loading backlinks…
          </div>
        )}

        {error && (
          <div className="p-4 text-sm text-destructive">
            Failed to load backlinks: {error}
          </div>
        )}

        {items !== null && !error && items.length === 0 && (
          <div className="p-4 text-sm text-muted-foreground italic">
            No backlinks yet — this note isn&apos;t referenced anywhere.
          </div>
        )}

        {items !== null && items.length > 0 && (
          <ul className="p-2 space-y-1.5">
            {items.map((it) => (
              <li key={it.id}>
                <button
                  type="button"
                  onClick={() => handleRowClick(it.id)}
                  className="w-full text-left rounded-md border border-border bg-background hover:border-primary/50 hover:bg-accent/50 transition-colors p-2.5"
                >
                  <div className="flex items-start gap-1.5">
                    <span className="material-icons text-sm text-muted-foreground mt-0.5 shrink-0">
                      link
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">
                        {it.title}
                      </p>
                      {it.displayText && it.displayText !== it.title && (
                        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                          via <span className="font-mono">{it.displayText}</span>
                        </p>
                      )}
                      {it.snippet && (
                        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                          {it.snippet}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
