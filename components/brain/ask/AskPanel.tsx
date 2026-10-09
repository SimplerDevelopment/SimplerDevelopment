'use client';

/**
 * PUX-199 (design doc screen 58): Ask, anywhere. The same Brain agent chat
 * as the Ask room, opened as a panel over whatever the user is looking at.
 * The context chip comes from the pathname; "Save as note" and "Make a task"
 * hit the existing portal routes. BrainAgentChat exposes no answer callback
 * (pinned god file), so the note / task form takes the text the user carries
 * over — one paste, not a re-implementation. Citations: the agent emits
 * `sources` but the chat never renders them; nothing is invented here.
 */

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import BrainAgentChat from '@/components/brain/BrainAgentChat';
import { recordFromPath, noteLinkFor } from '@/lib/brain/record-from-path';
import { pInput, sBtnGhost } from '@/components/portal/portal-ui';

export default function AskPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const ref = recordFromPath(pathname);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<'note' | 'task' | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const keep = async (kind: 'note' | 'task') => {
    const body = text.trim();
    if (!body) return;
    setBusy(kind); setDone(null);
    const title = body.split('\n')[0].slice(0, 120);
    const url = kind === 'note' ? '/api/portal/brain/knowledge' : '/api/portal/brain/tasks';
    const payload = kind === 'note' ? { title, body, ...noteLinkFor(ref) } : { title, description: body };
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || d.success === false) throw new Error(d.message || 'Could not save');
      setDone(kind === 'note' ? 'Saved to Knowledge.' : 'Task created.');
      setText('');
    } catch (e) {
      setDone(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusy(null);
    }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="presentation">
      <button type="button" aria-label="Close Ask" onClick={onClose} className="absolute inset-0 bg-black/30" />
      <aside role="dialog" aria-modal="true" aria-label="Ask the Brain" className="relative flex h-full w-full max-w-lg flex-col border-l border-[var(--studio-gold-line)] bg-card shadow-2xl">
        <header className="flex items-center gap-2 border-b border-[var(--studio-gold-line)] bg-[var(--studio-gold-surface)] px-4 py-3">
          <span className="material-icons text-base text-[var(--studio-gold-ink)]">auto_awesome</span>
          <h2 className="font-display text-sm font-extrabold tracking-[-0.01em] text-[var(--studio-gold-ink)]">Ask the Brain</h2>
          {ref && <span className="rounded-full bg-card px-2 py-0.5 text-[11px] font-medium text-[var(--studio-gold-ink)]" data-testid="ask-context">About {ref.label} · #{ref.id}</span>}
          <kbd className="ml-auto rounded border border-border px-1.5 text-[10px] text-muted-foreground">⌘J</kbd>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Close"><span className="material-icons text-base">close</span></button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <BrainAgentChat />
        </div>
        <footer className="space-y-2 border-t border-border p-3">
          <label className="block text-[11px] font-semibold uppercase tracking-[.08em] text-muted-foreground" htmlFor="ask-keep">Keep an answer</label>
          <textarea id="ask-keep" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the answer worth keeping…" className={`${pInput} resize-y`} />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => keep('note')} disabled={busy !== null || !text.trim()} className={`${sBtnGhost} disabled:opacity-50`}>Save as note</button>
            <button type="button" onClick={() => keep('task')} disabled={busy !== null || !text.trim()} className={`${sBtnGhost} disabled:opacity-50`}>Make a task</button>
            {done && <span className="text-xs text-muted-foreground" role="status">{done}</span>}
          </div>
        </footer>
      </aside>
    </div>
  );
}
