'use client';

// Brain tasks as a list (PUX-161, design doc screen 20): the Brain's task
// proposals in a gold section with Accept / Dismiss, a quick New task, then
// every task by due date and priority with its status and the same
// "Promote to project board" the card had. Rendered by the tasks page under
// portal-redesign in place of the board; the page keeps its state and the
// promote modal, and passes them in.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { pSelect, sBtn, sBtnGhost } from '@/components/portal/portal-ui';
import { EmptyState } from '@/components/portal/EmptyState';
import { priorityColor } from '@/lib/portal-utils';
import { proposedTasks, sortTasks, type ProposedTask } from '@/lib/brain/tasks-list-shape';
import { ago } from '@/lib/portal/needs-you-shape';
import type { BrainTaskRow } from '@/app/portal/brain/tasks/page';

type TaskStatus = BrainTaskRow['status'];
const STATUSES: { value: TaskStatus; label: string }[] = [
  { value: 'open', label: 'Open' }, { value: 'in_progress', label: 'In progress' }, { value: 'blocked', label: 'Blocked' }, { value: 'done', label: 'Done' },
];
const gold = 'border-[var(--studio-gold-line)] bg-[var(--studio-gold-soft)] text-[var(--studio-gold-ink)]';

export default function BrainTasksList({ tasks, onSetStatus, onPromote, onChanged }: {
  tasks: BrainTaskRow[];
  onSetStatus: (id: number, status: TaskStatus) => void;
  onPromote: (task: BrainTaskRow) => void;
  onChanged: () => void;
}) {
  const [proposed, setProposed] = useState<ProposedTask[] | null>(null);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState<number | 'new' | null>(null);

  const loadProposed = useCallback(async () => {
    try {
      const r = await fetch('/api/portal/brain/review?status=pending');
      const j = await r.json();
      setProposed(proposedTasks(j?.data?.items ?? []));
    } catch { setProposed([]); }
  }, []);
  useEffect(() => { void loadProposed(); }, [loadProposed]);

  const decide = async (id: number, action: 'approve' | 'reject') => {
    setBusy(id);
    try {
      await fetch(`/api/portal/brain/review-items/${id}/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      await loadProposed();
      onChanged();
    } finally { setBusy(null); }
  };
  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy('new');
    try {
      const r = await fetch('/api/portal/brain/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: title.trim() }) });
      if (r.ok) { setTitle(''); onChanged(); }
    } finally { setBusy(null); }
  };

  const sorted = sortTasks(tasks);
  const dueText = (d: string | Date | null) => (d ? `due ${new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : null);

  return (
    <div className="space-y-4">
      {proposed && proposed.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-[var(--studio-gold-line)] bg-[var(--studio-gold-surface)]">
          <h3 className="flex items-center gap-2 px-4 py-3 text-[13px] font-bold text-foreground">
            <span className="material-icons text-[17px] text-[var(--studio-gold-ink)]">auto_awesome</span>Proposed by the Brain
            <span className="ml-auto font-mono text-[11px] font-normal text-muted-foreground">{proposed.length}</span>
          </h3>
          {proposed.map((p) => (
            <div key={p.id} className="flex items-center gap-3 border-t border-[var(--studio-gold-line)] px-4 py-2.5">
              <span className="material-icons text-base text-[var(--studio-gold-ink)]">task_alt</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">{p.title}</span>
                <small className="block truncate text-xs text-muted-foreground">{[p.from, dueText(p.dueDate), p.priority].filter(Boolean).join(' · ')}</small>
              </span>
              <button type="button" disabled={busy === p.id} onClick={() => decide(p.id, 'approve')} className={`${sBtnGhost} px-2.5 py-1 text-xs disabled:opacity-50 ${gold}`}>Accept</button>
              <button type="button" disabled={busy === p.id} onClick={() => decide(p.id, 'reject')} className={`${sBtnGhost} px-2.5 py-1 text-xs disabled:opacity-50`}>Dismiss</button>
            </div>
          ))}
        </section>
      )}

      <form onSubmit={create} className="flex gap-2">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New task…" maxLength={255} className="flex-1 rounded-xl border border-border bg-card px-3.5 py-2 text-sm text-foreground outline-none focus:border-primary" />
        <button type="submit" disabled={busy === 'new' || !title.trim()} className={`${sBtn} disabled:opacity-50`}><span className="material-icons text-base">add</span>New task</button>
      </form>

      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        {sorted.length === 0 ? (
          <EmptyState className="p-6" title="Nothing on your list yet." body="Tasks you add, and the ones the Brain proposes from your calls, line up here by what's due first." ghostLabel="Due · Priority · Status" />
        ) : sorted.map((t) => (
          <div key={t.id} className={`flex items-center gap-3 border-t border-border px-4 py-2.5 first:border-t-0 ${t.status === 'done' ? 'opacity-60' : ''}`}>
            <span className="min-w-0 flex-1">
              <span className={`block truncate text-sm text-foreground ${t.status === 'done' ? 'line-through' : 'font-medium'}`}>{t.title}</span>
              <small className="block truncate text-xs text-muted-foreground">
                {[dueText(t.dueDate), t.createdByAi ? 'from the Brain' : null, t.linkedKanbanCardId ? 'on a board' : null, `updated ${ago(new Date(t.createdAt))}`].filter(Boolean).join(' · ')}
              </small>
            </span>
            {t.priority && <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${priorityColor(t.priority)}`}>{t.priority}</span>}
            <select aria-label={`Status of ${t.title}`} value={t.status} onChange={(e) => onSetStatus(t.id, e.target.value as TaskStatus)} className={`${pSelect} h-8 w-auto rounded-lg py-0 pl-2.5 pr-8 text-xs`}>
              {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            {!t.linkedKanbanCardId && t.status !== 'done' ? (
              <button type="button" onClick={() => onPromote(t)} className={`${sBtnGhost} px-2.5 py-1 text-xs`} title="Promote to project board"><span className="material-icons text-base">move_up</span></button>
            ) : t.linkedKanbanCardId ? (
              <Link href="/portal/my-tasks" className={`${sBtnGhost} px-2.5 py-1 text-xs`} title="On a project board"><span className="material-icons text-base">view_kanban</span></Link>
            ) : null}
          </div>
        ))}
      </section>
    </div>
  );
}
