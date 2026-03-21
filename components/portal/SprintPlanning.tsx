'use client';

import { useState, useEffect } from 'react';
import { priorityColor } from '@/lib/portal-utils';

interface SprintCard {
  id: number;
  title: string;
  priority: string | null;
  sprintId: number | null;
  columnId: number | null;
  columnName: string | null;
  order: number;
}

interface Sprint {
  id: number;
  name: string;
  goal: string | null;
  startDate: string | null;
  endDate: string | null;
  status: string;
  order: number;
  cards: SprintCard[];
}

interface Props {
  projectId: number;
  isStaff: boolean;
}

const statusConfig: Record<string, { label: string; color: string; icon: string }> = {
  planning: { label: 'Planning', color: 'bg-blue-100 text-blue-700', icon: 'edit_calendar' },
  active:   { label: 'Active',   color: 'bg-green-100 text-green-700', icon: 'play_circle' },
  completed:{ label: 'Completed',color: 'bg-gray-100 text-gray-500',  icon: 'check_circle' },
};

function formatDate(d: string | null) {
  if (!d) return null;
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function CardRow({
  card,
  sprintOptions,
  currentSprintId,
  isStaff,
  onMove,
}: {
  card: SprintCard;
  sprintOptions: Sprint[];
  currentSprintId: number | null;
  isStaff: boolean;
  onMove: (cardId: number, sprintId: number | null) => Promise<void>;
}) {
  const [moving, setMoving] = useState(false);

  async function handleMove(value: string) {
    setMoving(true);
    await onMove(card.id, value === '' ? null : parseInt(value, 10));
    setMoving(false);
  }

  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-accent/50 transition-colors">
      <div className="flex items-center gap-2 min-w-0">
        {card.priority && (
          <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${priorityColor(card.priority)}`}>
            {card.priority}
          </span>
        )}
        <span className="text-sm text-foreground truncate">{card.title}</span>
        {card.columnName && (
          <span className="text-xs text-muted-foreground shrink-0">· {card.columnName}</span>
        )}
      </div>
      {isStaff && (
        <select
          disabled={moving}
          value={currentSprintId ?? ''}
          onChange={e => handleMove(e.target.value)}
          className="text-xs border border-border rounded px-2 py-1 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary shrink-0 disabled:opacity-50"
        >
          <option value="">Backlog</option>
          {sprintOptions.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      )}
    </div>
  );
}

export default function SprintPlanning({ projectId, isStaff }: Props) {
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [backlog, setBacklog] = useState<SprintCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [backlogExpanded, setBacklogExpanded] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [form, setForm] = useState({ name: '', goal: '', startDate: '', endDate: '' });
  const [saving, setSaving] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState<number | null>(null);

  useEffect(() => {
    fetch(`/api/portal/projects/${projectId}/sprints`)
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setSprints(data.data.sprints);
          setBacklog(data.data.backlog);
          // Auto-expand active sprint
          const active = data.data.sprints.find((s: Sprint) => s.status === 'active');
          if (active) setExpanded(new Set([active.id]));
        }
        setLoading(false);
      });
  }, [projectId]);

  function toggleExpanded(id: number) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function createSprint(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch(`/api/portal/projects/${projectId}/sprints`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setSaving(false);
    if (data.success) {
      setSprints(prev => [...prev, data.data]);
      setForm({ name: '', goal: '', startDate: '', endDate: '' });
      setShowCreateForm(false);
      setExpanded(prev => new Set([...prev, data.data.id]));
    }
  }

  async function updateStatus(sprintId: number, status: string) {
    setStatusUpdating(sprintId);
    const res = await fetch(`/api/portal/sprints/${sprintId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    const data = await res.json();
    setStatusUpdating(null);
    if (data.success) {
      setSprints(prev => prev.map(s => s.id === sprintId ? { ...s, status } : s));
    }
  }

  async function deleteSprint(sprintId: number) {
    if (!confirm('Delete this sprint? Cards will return to backlog.')) return;
    const res = await fetch(`/api/portal/sprints/${sprintId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      // Move sprint cards back to backlog
      const sprint = sprints.find(s => s.id === sprintId);
      if (sprint) {
        setBacklog(prev => [...prev, ...sprint.cards.map(c => ({ ...c, sprintId: null }))]);
      }
      setSprints(prev => prev.filter(s => s.id !== sprintId));
    }
  }

  async function moveCard(cardId: number, targetSprintId: number | null) {
    const res = await fetch(`/api/portal/cards/${cardId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sprintId: targetSprintId }),
    });
    const data = await res.json();
    if (!data.success) return;

    // Find the card across all sources
    let card: SprintCard | undefined;
    setSprints(prev => {
      const next = prev.map(s => {
        const idx = s.cards.findIndex(c => c.id === cardId);
        if (idx === -1) return s;
        card = { ...s.cards[idx], sprintId: targetSprintId };
        return { ...s, cards: s.cards.filter(c => c.id !== cardId) };
      });
      return next;
    });
    setBacklog(prev => {
      const existing = prev.find(c => c.id === cardId);
      if (existing) card = { ...existing, sprintId: targetSprintId };
      return prev.filter(c => c.id !== cardId);
    });

    if (targetSprintId === null) {
      setBacklog(prev => [...prev, card!]);
    } else {
      setSprints(prev => prev.map(s =>
        s.id === targetSprintId ? { ...s, cards: [...s.cards, card!] } : s
      ));
    }
  }

  if (loading) {
    return <div className="text-center py-12 text-muted-foreground">Loading sprints…</div>;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      {isStaff && (
        <div className="flex justify-end">
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <span className="material-icons text-base">add</span>
            New Sprint
          </button>
        </div>
      )}

      {/* Create form */}
      {showCreateForm && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-base font-semibold text-foreground mb-4">Create Sprint</h3>
          <form onSubmit={createSprint} className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Sprint Name <span className="text-destructive">*</span></label>
              <input
                required
                type="text"
                placeholder="Sprint 1"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Goal</label>
              <input
                type="text"
                placeholder="What does this sprint achieve?"
                value={form.goal}
                onChange={e => setForm({ ...form, goal: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Start Date</label>
              <input
                type="date"
                value={form.startDate}
                onChange={e => setForm({ ...form, startDate: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">End Date</label>
              <input
                type="date"
                value={form.endDate}
                onChange={e => setForm({ ...form, endDate: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="sm:col-span-2 flex justify-end gap-3">
              <button type="button" onClick={() => setShowCreateForm(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                {saving ? <><span className="material-icons text-base animate-spin">refresh</span>Creating…</> : 'Create Sprint'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Empty state */}
      {sprints.length === 0 && !showCreateForm && (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <span className="material-icons text-5xl text-muted-foreground">sprint</span>
          <h3 className="mt-4 font-semibold text-foreground">No sprints yet</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {isStaff ? 'Create a sprint to start planning work.' : 'No sprints have been set up for this project yet.'}
          </p>
        </div>
      )}

      {/* Sprint list */}
      {sprints.map(sprint => {
        const cfg = statusConfig[sprint.status] ?? statusConfig.planning;
        const isOpen = expanded.has(sprint.id);
        const isUpdating = statusUpdating === sprint.id;

        return (
          <div key={sprint.id} className="bg-card border border-border rounded-xl overflow-hidden">
            {/* Sprint header */}
            <div className="flex items-center gap-3 p-4 border-b border-border">
              <button
                onClick={() => toggleExpanded(sprint.id)}
                className="flex items-center gap-3 flex-1 text-left min-w-0"
              >
                <span className={`material-icons text-base transition-transform ${isOpen ? 'rotate-90' : ''}`}>
                  chevron_right
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-foreground">{sprint.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${cfg.color}`}>
                      <span className="material-icons text-xs">{cfg.icon}</span>
                      {cfg.label}
                    </span>
                    <span className="text-xs text-muted-foreground bg-muted rounded-full px-1.5 py-0.5">
                      {sprint.cards.length} card{sprint.cards.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  {(sprint.startDate || sprint.endDate) && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatDate(sprint.startDate)} {sprint.startDate && sprint.endDate ? '→' : ''} {formatDate(sprint.endDate)}
                    </p>
                  )}
                  {sprint.goal && (
                    <p className="text-xs text-muted-foreground mt-0.5 italic">"{sprint.goal}"</p>
                  )}
                </div>
              </button>

              {isStaff && (
                <div className="flex items-center gap-2 shrink-0">
                  {sprint.status === 'planning' && (
                    <button
                      disabled={isUpdating}
                      onClick={() => updateStatus(sprint.id, 'active')}
                      className="text-xs px-3 py-1.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
                    >
                      Start Sprint
                    </button>
                  )}
                  {sprint.status === 'active' && (
                    <button
                      disabled={isUpdating}
                      onClick={() => updateStatus(sprint.id, 'completed')}
                      className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                      Complete
                    </button>
                  )}
                  <button
                    onClick={() => deleteSprint(sprint.id)}
                    className="p-1.5 text-muted-foreground hover:text-destructive transition-colors rounded"
                    title="Delete sprint"
                  >
                    <span className="material-icons text-base">delete_outline</span>
                  </button>
                </div>
              )}
            </div>

            {/* Cards */}
            {isOpen && (
              <div className="p-2">
                {sprint.cards.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    No cards in this sprint. Assign cards from the backlog below.
                  </p>
                ) : (
                  sprint.cards.map(card => (
                    <CardRow
                      key={card.id}
                      card={card}
                      sprintOptions={sprints}
                      currentSprintId={sprint.id}
                      isStaff={isStaff}
                      onMove={moveCard}
                    />
                  ))
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Backlog */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <button
          onClick={() => setBacklogExpanded(!backlogExpanded)}
          className="flex items-center gap-3 w-full p-4 border-b border-border text-left"
        >
          <span className={`material-icons text-base transition-transform ${backlogExpanded ? 'rotate-90' : ''}`}>
            chevron_right
          </span>
          <span className="font-semibold text-foreground">Backlog</span>
          <span className="text-xs text-muted-foreground bg-muted rounded-full px-1.5 py-0.5">
            {backlog.length} card{backlog.length !== 1 ? 's' : ''}
          </span>
        </button>
        {backlogExpanded && (
          <div className="p-2">
            {backlog.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">All cards are assigned to sprints.</p>
            ) : (
              backlog.map(card => (
                <CardRow
                  key={card.id}
                  card={card}
                  sprintOptions={sprints}
                  currentSprintId={null}
                  isStaff={isStaff}
                  onMove={moveCard}
                />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
