'use client';

/**
 * PUX-198 (design doc screen 57): the grouped inbox — room chips narrow
 * one list instead of switching pages; quick-add reuses My tasks'
 * quickAddRequest (a kanban column or the Brain queue). Studio-only; the
 * /portal/work page gates on hasFlag.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { groupByWhen, SOURCE_LABEL, type WorkRow, type WorkSource } from '@/lib/work/inbox';
import { quickAddRequest, type QuickAddTarget } from '@/lib/portal/my-tasks-quick-add';
import { relativeTime } from '@/lib/notifications/feed';
import { pInput, pSelect, sBtn } from '@/components/portal/portal-ui';
import { EmptyState } from '@/components/portal/EmptyState';

const TAG: Record<WorkSource, string> = {
  projects: 'bg-muted text-muted-foreground',
  tickets: 'bg-[var(--portal-warn-bg)] text-[var(--portal-warn)]',
  approvals: 'bg-[var(--studio-gold-surface)] text-[var(--studio-gold-ink)]',
  brain: 'bg-[var(--studio-gold-surface)] text-[var(--studio-gold-ink)]',
  account: 'bg-muted text-muted-foreground',
};

export default function WorkInbox({ rows, targets }: { rows: WorkRow[]; targets: QuickAddTarget[] }) {
  const router = useRouter();
  const [chip, setChip] = useState<WorkSource | 'all'>('all');
  const [title, setTitle] = useState('');
  const [targetKey, setTargetKey] = useState(targets[0]?.key ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const present = (Object.keys(SOURCE_LABEL) as WorkSource[]).filter((s) => rows.some((r) => r.source === s));
  const visible = chip === 'all' ? rows : rows.filter((r) => r.source === chip);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = targets.find((t) => t.key === targetKey);
    if (!target || !title.trim()) return;
    setBusy(true); setError(null);
    try {
      const { url, body } = quickAddRequest(target, title.trim());
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) throw new Error(data.message || 'Could not add');
      setTitle('');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {targets.length > 0 && (
        <form onSubmit={add} className="flex flex-wrap items-center gap-2" aria-label="Quick add">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add something to do…" className={`${pInput} min-w-[220px] flex-1`} aria-label="New item" />
          <select value={targetKey} onChange={(e) => setTargetKey(e.target.value)} className={pSelect} aria-label="Where it lands">
            {targets.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
          <button type="submit" disabled={busy || !title.trim()} className={`${sBtn} disabled:opacity-50`}>Add</button>
          {error && <p className="w-full text-xs text-destructive">{error}</p>}
        </form>
      )}

      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Rooms">
        {(['all', ...present] as const).map((c) => {
          const on = chip === c;
          const n = c === 'all' ? rows.length : rows.filter((r) => r.source === c).length;
          return (
            <button key={c} type="button" role="tab" aria-selected={on} onClick={() => setChip(c)}
              className={`rounded-full px-3 py-1 text-[12.5px] font-medium transition-colors ${on ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'}`}>
              {c === 'all' ? 'All' : SOURCE_LABEL[c]}<span className={`ml-1.5 tabular-nums ${on ? 'text-background/70' : 'text-muted-foreground/70'}`}>{n}</span>
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <EmptyState title="Nothing is waiting on you." body="Cards, tasks, tickets, approvals and reviews land here the moment they need you." ghostLabel="My work" />
      ) : groupByWhen(visible).map(([bucket, items]) => (
        <section key={bucket} aria-label={bucket} className="space-y-1.5">
          <h2 className="font-display text-[11px] font-semibold uppercase tracking-[.08em] text-muted-foreground">{bucket}<span className="ml-1.5 tabular-nums text-muted-foreground/70">{items.length}</span></h2>
          <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
            {items.map((r) => (
              <li key={r.key}>
                <Link href={r.href} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30">
                  {r.urgent && <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--portal-warn)]" aria-label="Urgent" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{r.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{r.meta}</span>
                  </span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${TAG[r.source]}`}>{SOURCE_LABEL[r.source]}</span>
                  {r.at && <span className="w-20 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{relativeTime(r.at.toISOString())}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
