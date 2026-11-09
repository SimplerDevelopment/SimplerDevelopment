'use client';

/**
 * PUX-167 (design doc screen 26): the left column of Ask — past conversations.
 * Reads the existing GET /api/portal/ai/conversations (tenant-scoped).
 * ponytail: aiConversations has no source/user column, so this list is
 * tenant-wide — Brain Agent threads and the client chat widget's threads
 * together, every member's. Add a discriminator column when that matters.
 * Studio-only; the caller gates on the flag.
 */

import { useEffect, useState } from 'react';
import { GhostCard } from '@/components/portal/EmptyState';
import { sBtnGhost } from '@/components/portal/portal-ui';
import { relativeTime } from '@/lib/notifications/feed';

export interface ConversationRow { id: number; title: string; updatedAt: string }

export default function ConversationList({
  selectedId, onSelect, reloadKey = 0,
}: {
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  reloadKey?: number;
}) {
  const [rows, setRows] = useState<ConversationRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/portal/ai/conversations');
        const json = await r.json();
        if (!cancelled) setRows(r.ok && json.success ? (json.data as ConversationRow[]) : []);
      } catch {
        if (!cancelled) setRows([]);
      }
    })();
    return () => { cancelled = true; };
  }, [reloadKey]);

  return (
    <aside className="flex min-h-0 flex-col" aria-label="Conversations">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 font-display text-sm font-semibold text-foreground">
          <span className="material-icons text-base text-muted-foreground">forum</span>
          Conversations
        </h2>
        <button type="button" onClick={() => onSelect(null)} className={`${sBtnGhost} !px-2 !py-1`} aria-label="New conversation">
          <span className="material-icons text-base">add</span>
        </button>
      </div>
      {rows === null ? null : rows.length === 0 ? (
        <GhostCard icon="forum" title="No conversations yet" body="Ask something to start one." />
      ) : (
        <ul className="min-h-0 space-y-1 overflow-y-auto">
          {rows.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onSelect(c.id)}
                className={`flex w-full items-baseline justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                  selectedId === c.id ? 'bg-primary/10 text-foreground' : 'text-foreground hover:bg-accent/60'
                }`}
              >
                <span className="truncate">{c.title}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">{relativeTime(c.updatedAt)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
