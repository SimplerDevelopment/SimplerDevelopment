'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const STATUS_META: Record<string, { icon: string; color: string; label: string }> = {
  active: { icon: 'play_circle', color: 'text-green-600', label: 'Active' },
  paused: { icon: 'pause_circle', color: 'text-yellow-600', label: 'Paused' },
  completed: { icon: 'check_circle', color: 'text-blue-600', label: 'Completed' },
  archived: { icon: 'archive', color: 'text-gray-500', label: 'Archived' },
};

interface Props {
  projectId: number;
  status: string;
  canEdit: boolean;
}

export default function ProjectStatusControl({ projectId, status: initial, canEdit }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState(initial);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  async function change(next: string) {
    if (next === status) { setOpen(false); return; }
    setSaving(true);
    const res = await fetch(`/api/portal/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    });
    const data = await res.json();
    setSaving(false);
    if (data.success) { setStatus(next); setOpen(false); router.refresh(); }
  }

  const meta = STATUS_META[status] ?? STATUS_META.active;

  if (!canEdit) {
    return (
      <span className={`flex items-center gap-1 text-sm font-medium ${meta.color}`}>
        <span className="material-icons text-base">{meta.icon}</span>
        {meta.label.toLowerCase()}
      </span>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-1 text-sm font-medium px-2 py-1 rounded-lg hover:bg-accent transition-colors ${meta.color}`}
      >
        <span className="material-icons text-base">{meta.icon}</span>
        {meta.label.toLowerCase()}
        <span className="material-icons text-xs">arrow_drop_down</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 bg-popover border border-border rounded-lg shadow-lg w-44 z-20 overflow-hidden">
            {(['active', 'paused', 'completed', 'archived']).map(s => {
              const m = STATUS_META[s];
              const on = s === status;
              return (
                <button
                  key={s}
                  onClick={() => change(s)}
                  disabled={saving}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-accent ${on ? 'bg-accent/50' : ''} ${m.color}`}
                >
                  <span className="material-icons text-base">{m.icon}</span>
                  <span className="flex-1 text-foreground">{m.label}</span>
                  {on && <span className="material-icons text-sm">check</span>}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
