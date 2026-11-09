'use client';

// "Quick-add a task, then pick where it lives…" (PUX-154, design doc screen
// 13). Posts through the existing create routes; the page refetches.
import { useState } from 'react';
import { pInput, pSelect, sBtn } from '@/components/portal/portal-ui';
import { quickAddRequest, type QuickAddTarget } from '@/lib/portal/my-tasks-quick-add';

export default function QuickAdd({ targets, onAdded }: { targets: QuickAddTarget[]; onAdded: () => void }) {
  const [title, setTitle] = useState('');
  const [targetKey, setTargetKey] = useState(targets[0]?.key ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const target = targets.find((t) => t.key === targetKey) ?? targets[0];
  if (!target) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true); setError('');
    try {
      const { url, body } = quickAddRequest(target!, title);
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(String(res.status));
      setTitle('');
      onAdded();
    } catch {
      setError("Couldn't add that — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2" aria-label="Quick-add a task">
      <div className="relative min-w-[240px] flex-1">
        <span className="material-icons absolute left-2.5 top-1/2 -translate-y-1/2 text-base text-muted-foreground">add_task</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Quick-add a task, then pick where it lives…" className={`${pInput} pl-9`} maxLength={255} />
      </div>
      <select aria-label="Where it lives" value={target.key} onChange={(e) => setTargetKey(e.target.value)} className={`${pSelect} w-auto`}>
        {targets.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
      </select>
      <button type="submit" disabled={busy || !title.trim()} className={`${sBtn} disabled:opacity-50`}>
        <span className="material-icons text-base">add</span>Add
      </button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </form>
  );
}
