'use client';

/**
 * PUX-167: a past conversation, read-only, from GET /api/portal/ai/conversations/[id].
 * ponytail: past threads are read-only here; continuing one needs an
 * initialConversationId prop on BrainAgentChat (617 lines, pinned) — that is
 * the upgrade path, not a second chat implementation.
 */

import { useEffect, useState } from 'react';
import MarkdownView from '@/components/portal/MarkdownView';
import { sBtnGhost } from '@/components/portal/portal-ui';

interface Msg { id: number; role: 'user' | 'assistant'; content: string; createdAt: string }
interface Thread { conversation: { id: number; title: string }; messages: Msg[] }

export default function ConversationThread({ id, onNew }: { id: number; onNew: () => void }) {
  const [thread, setThread] = useState<Thread | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/portal/ai/conversations/${id}`);
        const json = await r.json();
        if (cancelled) return;
        if (!r.ok || !json.success) { setError(json.message || 'Could not load the conversation.'); return; }
        setThread(json.data as Thread);
      } catch {
        if (!cancelled) setError('Network error');
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h2 className="truncate font-display text-sm font-semibold text-foreground">{thread?.conversation.title ?? '…'}</h2>
        <button type="button" onClick={onNew} className={sBtnGhost}>
          <span className="material-icons text-base">add</span>
          New conversation
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {error && <p className="text-xs text-destructive">{error}</p>}
        {thread?.messages.map((m) => (
          m.role === 'user' ? (
            <div key={m.id} className="ml-auto max-w-[80%] rounded-2xl bg-muted px-4 py-2.5 text-sm text-foreground">{m.content}</div>
          ) : (
            <div key={m.id} className="max-w-[90%]">
              <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-[var(--studio-gold-ink)]">
                <span className="material-icons text-[14px]">auto_awesome</span>
                Brain
              </p>
              <div className="rounded-2xl border border-[var(--studio-gold-line)] bg-[var(--studio-gold-surface)] px-4 py-3 text-sm">
                <MarkdownView>{m.content}</MarkdownView>
              </div>
            </div>
          )
        ))}
      </div>
    </div>
  );
}
