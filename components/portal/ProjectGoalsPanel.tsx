'use client';

import { useEffect, useState } from 'react';

type GoalStatus = 'draft' | 'active' | 'achieved' | 'missed' | 'dropped';

interface Goal {
  id: number;
  title: string;
  description: string | null;
  unitLabel: string | null;
  currentValue: number;
  targetValue: number;
  targetDate: string | null;
  status: GoalStatus;
}

const statusColor: Record<GoalStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  active: 'bg-blue-100 text-blue-700',
  achieved: 'bg-emerald-100 text-emerald-700',
  missed: 'bg-rose-100 text-rose-700',
  dropped: 'bg-gray-100 text-gray-500 line-through',
};

const STATUSES: GoalStatus[] = ['draft', 'active', 'achieved', 'missed', 'dropped'];

export default function ProjectGoalsPanel({ projectId, canEdit }: { projectId: number; canEdit: boolean }) {
  const [rows, setRows] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    unitLabel: '%',
    targetValue: 100,
    currentValue: 0,
    targetDate: '',
    status: 'active' as GoalStatus,
  });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/portal/projects/${projectId}/goals`);
      const json = await res.json();
      if (json.success) setRows(json.data);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [projectId]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/portal/projects/${projectId}/goals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          description: form.description || null,
          unitLabel: form.unitLabel || null,
          targetValue: form.targetValue,
          currentValue: form.currentValue,
          targetDate: form.targetDate || null,
          status: form.status,
        }),
      });
      if ((await res.json()).success) {
        setShowForm(false);
        setForm({ title: '', description: '', unitLabel: '%', targetValue: 100, currentValue: 0, targetDate: '', status: 'active' });
        await load();
      }
    } finally { setSaving(false); }
  };

  const onUpdateValue = async (goal: Goal, currentValue: number) => {
    await fetch(`/api/portal/goals/${goal.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentValue }),
    });
    await load();
  };

  const onUpdateStatus = async (goal: Goal, status: GoalStatus) => {
    await fetch(`/api/portal/goals/${goal.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    await load();
  };

  const onDelete = async (id: number) => {
    if (!confirm('Delete this goal?')) return;
    await fetch(`/api/portal/goals/${id}`, { method: 'DELETE' });
    await load();
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Goals &amp; OKRs</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Track project-level objectives. Update progress manually as you measure.
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => setShowForm(v => !v)}
            className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <span className="material-icons text-sm">{showForm ? 'close' : 'flag'}</span>
            {showForm ? 'Cancel' : 'New goal'}
          </button>
        )}
      </div>

      {showForm && canEdit && (
        <form onSubmit={onSubmit} className="space-y-3 border border-border rounded-lg p-4 bg-background">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-medium text-foreground">Title <span className="text-destructive">*</span></label>
              <input
                value={form.title}
                onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                required
                placeholder="e.g. Onboard 25 new customers"
                className="w-full px-2 py-1.5 rounded border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-medium text-foreground">Description</label>
              <textarea
                rows={2}
                value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                className="w-full px-2 py-1.5 rounded border border-border bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Current</label>
              <input
                type="number" min={0}
                value={form.currentValue}
                onChange={e => setForm(p => ({ ...p, currentValue: parseInt(e.target.value, 10) || 0 }))}
                className="w-full px-2 py-1.5 rounded border border-border bg-background text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Target</label>
              <input
                type="number" min={1}
                value={form.targetValue}
                onChange={e => setForm(p => ({ ...p, targetValue: parseInt(e.target.value, 10) || 100 }))}
                className="w-full px-2 py-1.5 rounded border border-border bg-background text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Unit</label>
              <input
                value={form.unitLabel}
                onChange={e => setForm(p => ({ ...p, unitLabel: e.target.value }))}
                placeholder="%, users, $..."
                className="w-full px-2 py-1.5 rounded border border-border bg-background text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Target date</label>
              <input
                type="date"
                value={form.targetDate}
                onChange={e => setForm(p => ({ ...p, targetDate: e.target.value }))}
                className="w-full px-2 py-1.5 rounded border border-border bg-background text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Status</label>
              <select
                value={form.status}
                onChange={e => setForm(p => ({ ...p, status: e.target.value as GoalStatus }))}
                className="w-full px-2 py-1.5 rounded border border-border bg-background text-sm"
              >
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={saving} className="px-4 py-1.5 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50">
              {saving ? 'Saving…' : 'Add goal'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">No goals yet.</p>
      ) : (
        <div className="space-y-3">
          {rows.map(g => {
            const pct = Math.min(100, Math.max(0, (g.currentValue / Math.max(1, g.targetValue)) * 100));
            const overdue = g.targetDate && g.status === 'active' && new Date(g.targetDate) < new Date();
            return (
              <div key={g.id} className="border border-border rounded-lg p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm font-semibold text-foreground truncate">{g.title}</h4>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${statusColor[g.status]}`}>
                        {g.status}
                      </span>
                      {overdue && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 font-medium">overdue</span>
                      )}
                    </div>
                    {g.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{g.description}</p>}
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-1 shrink-0">
                      <select
                        value={g.status}
                        onChange={e => onUpdateStatus(g, e.target.value as GoalStatus)}
                        className="px-1.5 py-1 rounded border border-border bg-background text-[10px]"
                      >
                        {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <button onClick={() => onDelete(g.id)} className="text-muted-foreground hover:text-destructive" title="Delete">
                        <span className="material-icons text-sm">delete_outline</span>
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-2 bg-muted rounded overflow-hidden">
                    <div
                      className={`h-full ${g.status === 'achieved' ? 'bg-emerald-500' : g.status === 'missed' ? 'bg-rose-500' : 'bg-primary'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs tabular-nums text-foreground shrink-0">
                    {g.currentValue} / {g.targetValue}{g.unitLabel ? ` ${g.unitLabel}` : ''} ({Math.round(pct)}%)
                  </span>
                  {canEdit && (
                    <input
                      type="number"
                      min={0}
                      defaultValue={g.currentValue}
                      onBlur={e => {
                        const v = parseInt(e.target.value, 10);
                        if (!Number.isNaN(v) && v !== g.currentValue) onUpdateValue(g, v);
                      }}
                      className="w-16 px-1.5 py-0.5 rounded border border-border bg-background text-xs"
                      title="Update current value (blur to save)"
                    />
                  )}
                </div>
                {g.targetDate && (
                  <p className="text-[10px] text-muted-foreground">
                    Target: {new Date(g.targetDate).toLocaleDateString()}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
