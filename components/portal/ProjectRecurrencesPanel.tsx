'use client';

import { useEffect, useState } from 'react';

type Cadence = 'daily' | 'weekly' | 'monthly';

interface Recurrence {
  id: number;
  projectId: number;
  columnId: number;
  templateId: number | null;
  titlePattern: string | null;
  description: string | null;
  cadence: Cadence;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  hourUtc: number;
  active: boolean;
  lastFiredAt: string | null;
  lastFiredCardId: number | null;
  nextFireAt: string;
}

interface Column { id: number; name: string }

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function describeSchedule(r: Recurrence): string {
  const time = `${r.hourUtc.toString().padStart(2, '0')}:00 UTC`;
  if (r.cadence === 'daily') return `Daily at ${time}`;
  if (r.cadence === 'weekly') return `Weekly · ${DAYS[r.dayOfWeek ?? 1]} ${time}`;
  return `Monthly · day ${r.dayOfMonth ?? 1} ${time}`;
}

export default function ProjectRecurrencesPanel({ projectId, canEdit }: { projectId: number; canEdit: boolean }) {
  const [rows, setRows] = useState<Recurrence[]>([]);
  const [columns, setColumns] = useState<Column[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    columnId: '' as string,
    titlePattern: '',
    description: '',
    cadence: 'weekly' as Cadence,
    dayOfWeek: 1,
    dayOfMonth: 1,
    hourUtc: 9,
  });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [recRes, projRes] = await Promise.all([
        fetch(`/api/portal/projects/${projectId}/recurrences`).then(r => r.json()),
        fetch(`/api/portal/projects/${projectId}/sprints`).then(r => r.json()), // borrows the sprint endpoint to fetch column names cheaply
      ]);
      if (recRes.success) setRows(recRes.data);
      // Fall back: fetch columns directly via the project page's already-loaded data is not available here, so do a tiny board call.
      const board = await fetch(`/api/portal/projects/${projectId}`).then(r => r.json()).catch(() => null);
      if (board?.success && Array.isArray(board.data?.columns)) {
        setColumns(board.data.columns.map((c: Column) => ({ id: c.id, name: c.name })));
      } else {
        // Last resort — derive column ids from sprint cards
        const fromSprints = new Map<number, string>();
        for (const s of projRes.data?.sprints ?? []) for (const c of s.cards ?? []) if (c.columnId) fromSprints.set(c.columnId, c.columnName ?? `Column ${c.columnId}`);
        for (const c of projRes.data?.backlog ?? []) if (c.columnId) fromSprints.set(c.columnId, c.columnName ?? `Column ${c.columnId}`);
        setColumns([...fromSprints.entries()].map(([id, name]) => ({ id, name })));
      }
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [projectId]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.columnId || !form.titlePattern.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/portal/projects/${projectId}/recurrences`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          columnId: parseInt(form.columnId, 10),
          titlePattern: form.titlePattern,
          description: form.description || null,
          cadence: form.cadence,
          dayOfWeek: form.cadence === 'weekly' ? form.dayOfWeek : null,
          dayOfMonth: form.cadence === 'monthly' ? form.dayOfMonth : null,
          hourUtc: form.hourUtc,
        }),
      });
      if ((await res.json()).success) {
        setShowForm(false);
        setForm({ columnId: '', titlePattern: '', description: '', cadence: 'weekly', dayOfWeek: 1, dayOfMonth: 1, hourUtc: 9 });
        await load();
      }
    } finally { setSaving(false); }
  };

  const onToggle = async (rec: Recurrence) => {
    await fetch(`/api/portal/recurrences/${rec.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !rec.active }),
    });
    await load();
  };

  const onDelete = async (id: number) => {
    if (!confirm('Delete this recurrence?')) return;
    await fetch(`/api/portal/recurrences/${id}`, { method: 'DELETE' });
    await load();
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Recurring tasks</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Auto-create cards on a schedule. {`{{date}}`} in the title becomes the firing date (e.g. "Standup 2026-06-10").
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => setShowForm(v => !v)}
            className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <span className="material-icons text-sm">{showForm ? 'close' : 'add'}</span>
            {showForm ? 'Cancel' : 'New'}
          </button>
        )}
      </div>

      {showForm && canEdit && (
        <form onSubmit={onSubmit} className="space-y-3 border border-border rounded-lg p-4 bg-background">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Title pattern <span className="text-destructive">*</span></label>
              <input
                value={form.titlePattern}
                onChange={e => setForm(p => ({ ...p, titlePattern: e.target.value }))}
                required
                placeholder="Standup {{date}}"
                className="w-full px-2 py-1.5 rounded border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Column <span className="text-destructive">*</span></label>
              <select
                required
                value={form.columnId}
                onChange={e => setForm(p => ({ ...p, columnId: e.target.value }))}
                className="w-full px-2 py-1.5 rounded border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <option value="">Choose…</option>
                {columns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Cadence</label>
              <select
                value={form.cadence}
                onChange={e => setForm(p => ({ ...p, cadence: e.target.value as Cadence }))}
                className="w-full px-2 py-1.5 rounded border border-border bg-background text-sm"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            {form.cadence === 'weekly' && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Day</label>
                <select
                  value={form.dayOfWeek}
                  onChange={e => setForm(p => ({ ...p, dayOfWeek: parseInt(e.target.value, 10) }))}
                  className="w-full px-2 py-1.5 rounded border border-border bg-background text-sm"
                >
                  {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
              </div>
            )}
            {form.cadence === 'monthly' && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Day of month (1–28)</label>
                <input
                  type="number" min={1} max={28}
                  value={form.dayOfMonth}
                  onChange={e => setForm(p => ({ ...p, dayOfMonth: parseInt(e.target.value, 10) }))}
                  className="w-full px-2 py-1.5 rounded border border-border bg-background text-sm"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Hour (UTC, 0–23)</label>
              <input
                type="number" min={0} max={23}
                value={form.hourUtc}
                onChange={e => setForm(p => ({ ...p, hourUtc: parseInt(e.target.value, 10) }))}
                className="w-full px-2 py-1.5 rounded border border-border bg-background text-sm"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={saving} className="px-4 py-1.5 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50">
              {saving ? 'Saving…' : 'Add recurrence'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">No recurring tasks yet.</p>
      ) : (
        <div className="border border-border rounded-lg divide-y divide-border">
          {rows.map(r => (
            <div key={r.id} className="flex items-center gap-3 px-3 py-2.5">
              <span className={`material-icons text-base ${r.active ? 'text-primary' : 'text-muted-foreground'}`}>
                {r.active ? 'autorenew' : 'pause_circle_outline'}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground truncate">{r.titlePattern ?? '(template-driven)'}</p>
                <p className="text-xs text-muted-foreground">
                  {describeSchedule(r)} · next: {new Date(r.nextFireAt).toLocaleString()}
                </p>
              </div>
              {canEdit && (
                <>
                  <button onClick={() => onToggle(r)} className="text-xs text-muted-foreground hover:text-foreground" title={r.active ? 'Pause' : 'Resume'}>
                    <span className="material-icons text-sm">{r.active ? 'pause' : 'play_arrow'}</span>
                  </button>
                  <button onClick={() => onDelete(r.id)} className="text-xs text-muted-foreground hover:text-destructive" title="Delete">
                    <span className="material-icons text-sm">delete_outline</span>
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
