'use client';

import { useState, useEffect } from 'react';
import {
  DndContext,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { priorityColor } from '@/lib/portal-utils';

interface SprintCard {
  id: number;
  title: string;
  priority: string | null;
  sprintId: number | null;
  columnId: number | null;
  columnName: string | null;
  columnIsDone?: boolean;
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
  canEdit: boolean;
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

function CardRowContent({
  card,
  sprintOptions,
  currentSprintId,
  canEdit,
  onMove,
  showSprintBadge = false,
  dragging = false,
  dragHandleProps,
}: {
  card: SprintCard;
  sprintOptions: Sprint[];
  currentSprintId: number | null;
  canEdit: boolean;
  onMove: (cardId: number, sprintId: number | null) => Promise<void>;
  showSprintBadge?: boolean;
  dragging?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dragHandleProps?: { listeners?: any; attributes?: any };
}) {
  const [moving, setMoving] = useState(false);

  async function handleMove(value: string) {
    setMoving(true);
    await onMove(card.id, value === '' ? null : parseInt(value, 10));
    setMoving(false);
  }

  const currentSprint = sprintOptions.find(s => s.id === currentSprintId);

  return (
    <div className={`flex items-center justify-between gap-2 px-2 py-2 rounded-lg transition-colors ${dragging ? 'bg-card border border-border shadow-lg opacity-90' : 'hover:bg-accent/50'}`}>
      {canEdit && dragHandleProps && (
        <button
          {...dragHandleProps.attributes}
          {...dragHandleProps.listeners}
          className="shrink-0 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing touch-none"
          aria-label="Drag card"
        >
          <span className="material-icons text-sm">drag_indicator</span>
        </button>
      )}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {card.priority && (
          <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${priorityColor(card.priority)}`}>
            {card.priority}
          </span>
        )}
        <span className="text-sm text-foreground truncate">{card.title}</span>
        {card.columnName && (
          <span className="text-xs text-muted-foreground shrink-0">· {card.columnName}</span>
        )}
        {showSprintBadge && currentSprint && (
          <span className="text-xs text-primary bg-primary/10 rounded px-1.5 py-0.5 shrink-0">
            {currentSprint.name}
          </span>
        )}
      </div>
      {canEdit && (
        <select
          disabled={moving}
          value={currentSprintId ?? ''}
          onChange={e => handleMove(e.target.value)}
          onClick={e => e.stopPropagation()}
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

function DraggableCard(props: {
  card: SprintCard;
  sprintOptions: Sprint[];
  currentSprintId: number | null;
  canEdit: boolean;
  onMove: (cardId: number, sprintId: number | null) => Promise<void>;
  showSprintBadge?: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `card-${props.card.id}`,
    data: { card: props.card, from: 'dock' },
    disabled: !props.canEdit,
  });
  return (
    <div ref={setNodeRef} className={isDragging ? 'opacity-40' : ''}>
      <CardRowContent
        {...props}
        dragHandleProps={{ listeners, attributes }}
      />
    </div>
  );
}

function SortableSprintCard(props: {
  card: SprintCard;
  sprintOptions: Sprint[];
  currentSprintId: number;
  canEdit: boolean;
  onMove: (cardId: number, sprintId: number | null) => Promise<void>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `sprint-card-${props.card.id}`,
    data: { card: props.card, from: 'sprint', sprintId: props.currentSprintId },
    disabled: !props.canEdit,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? 'opacity-40' : ''}
    >
      <CardRowContent
        card={props.card}
        sprintOptions={props.sprintOptions}
        currentSprintId={props.currentSprintId}
        canEdit={props.canEdit}
        onMove={props.onMove}
        dragHandleProps={{ listeners, attributes }}
      />
    </div>
  );
}

function SprintDropzone({ sprintId, children, className = '' }: { sprintId: number | null; children: React.ReactNode; className?: string }) {
  const { setNodeRef, isOver } = useDroppable({
    id: sprintId === null ? 'drop-backlog' : `drop-sprint-${sprintId}`,
    data: { sprintId },
  });
  return (
    <div
      ref={setNodeRef}
      className={`${className} transition-colors ${isOver ? 'ring-2 ring-primary ring-offset-1 bg-primary/5 rounded-xl' : ''}`}
    >
      {children}
    </div>
  );
}

export default function SprintPlanning({ projectId, canEdit }: Props) {
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [backlog, setBacklog] = useState<SprintCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [dockSearch, setDockSearch] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [form, setForm] = useState({ name: '', goal: '', startDate: '', endDate: '' });
  const [saving, setSaving] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState<number | null>(null);
  const [activeDrag, setActiveDrag] = useState<SprintCard | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function onDragStart(e: DragStartEvent) {
    const c = (e.active.data.current as { card?: SprintCard } | undefined)?.card;
    if (c) setActiveDrag(c);
  }
  function onDragEnd(e: DragEndEvent) {
    setActiveDrag(null);
    const { active, over } = e;
    if (!over) return;
    const data = active.data.current as { card?: SprintCard; from?: string; sprintId?: number } | undefined;
    const card = data?.card;
    if (!card) return;

    // If dropping on another sprint-card inside the SAME sprint → reorder
    const overId = String(over.id);
    if (data?.from === 'sprint' && overId.startsWith('sprint-card-')) {
      const overData = over.data.current as { card?: SprintCard; sprintId?: number } | undefined;
      if (overData?.sprintId === data.sprintId && overData?.card && overData.card.id !== card.id) {
        reorderWithinSprint(data.sprintId!, card.id, overData.card.id);
        return;
      }
    }

    // Otherwise: card moved to a different (or same) sprint container
    const target = (over.data.current as { sprintId?: number | null } | undefined)?.sprintId ?? null;
    if (target !== card.sprintId) moveCard(card.id, target);
  }

  async function reorderWithinSprint(sprintId: number, cardId: number, overCardId: number) {
    const sprint = sprints.find(s => s.id === sprintId);
    if (!sprint) return;
    const ids = sprint.cards.map(c => c.id);
    const from = ids.indexOf(cardId);
    const to = ids.indexOf(overCardId);
    if (from === -1 || to === -1 || from === to) return;
    const reordered = arrayMove(sprint.cards, from, to);
    setSprints(prev => prev.map(s => s.id === sprintId ? { ...s, cards: reordered } : s));
    await fetch(`/api/portal/sprints/${sprintId}/card-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cardIds: reordered.map(c => c.id) }),
    });
  }

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
    let found: SprintCard | undefined = backlog.find(c => c.id === cardId);
    if (!found) {
      for (const s of sprints) {
        found = s.cards.find(c => c.id === cardId);
        if (found) break;
      }
    }
    if (!found) return;
    if (found.sprintId === targetSprintId) return;
    const updated: SprintCard = { ...found, sprintId: targetSprintId };

    const res = await fetch(`/api/portal/cards/${cardId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sprintId: targetSprintId }),
    });
    const data = await res.json();
    if (!data.success) return;

    setSprints(prev =>
      prev.map(s => {
        const withoutCard = { ...s, cards: s.cards.filter(c => c.id !== cardId) };
        return s.id === targetSprintId ? { ...withoutCard, cards: [...withoutCard.cards, updated] } : withoutCard;
      }),
    );
    setBacklog(prev => {
      const withoutCard = prev.filter(c => c.id !== cardId);
      return targetSprintId === null ? [...withoutCard, updated] : withoutCard;
    });
  }

  if (loading) {
    return <div className="text-center py-12 text-muted-foreground">Loading sprints…</div>;
  }

  const priorityWeight: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
  const allCards: SprintCard[] = [
    ...backlog,
    ...sprints.flatMap(s => s.cards.map(c => ({ ...c, sprintId: s.id }))),
  ]
    .filter(c => c && typeof c.title === 'string')
    .sort((a, b) => {
      const aw = priorityWeight[a.priority ?? 'medium'] ?? 99;
      const bw = priorityWeight[b.priority ?? 'medium'] ?? 99;
      if (aw !== bw) return aw - bw;
      return (a.title ?? '').localeCompare(b.title ?? '');
    });

  const needle = dockSearch.trim().toLowerCase();
  const dockCards = allCards.filter(c => c.sprintId == null);
  const filteredDockCards = dockCards.filter(c => {
    if (needle && !c.title.toLowerCase().includes(needle) && !(c.columnName ?? '').toLowerCase().includes(needle)) return false;
    return true;
  });

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveDrag(null)}>
    <div className="space-y-4">
      {/* Header */}
      {canEdit && (
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

      {/* Two-column layout: sprints on the left, dock on the right */}
      <div className="grid gap-4 lg:grid-cols-2">

        {/* COLUMN 1: Sprints */}
        <div className="space-y-4">

          {/* Empty state */}
          {sprints.length === 0 && !showCreateForm && (
            <div className="bg-card border border-border rounded-xl p-12 text-center">
              <span className="material-icons text-5xl text-muted-foreground">sprint</span>
              <h3 className="mt-4 font-semibold text-foreground">No sprints yet</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {canEdit ? 'Create a sprint to start planning work.' : 'No sprints have been set up for this project yet.'}
              </p>
            </div>
          )}

          {/* Sprint list */}
          {sprints.map(sprint => {
        const cfg = statusConfig[sprint.status] ?? statusConfig.planning;
        const isOpen = expanded.has(sprint.id);
        const isUpdating = statusUpdating === sprint.id;

        return (
          <SprintDropzone key={sprint.id} sprintId={sprint.id}>
          <div className="bg-card border border-border rounded-xl overflow-hidden">
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
                    {(() => {
                      const total = sprint.cards.length;
                      const done = sprint.cards.filter(c => c.columnIsDone).length;
                      if (total === 0) return null;
                      const pct = Math.round((done / total) * 100);
                      return (
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${pct === 100 ? 'bg-green-100 text-green-700' : 'bg-blue-50 text-blue-700'}`}>
                          {done}/{total} done · {pct}%
                        </span>
                      );
                    })()}
                    {sprint.endDate && sprint.status === 'active' && (() => {
                      const days = Math.ceil((new Date(sprint.endDate!).getTime() - Date.now()) / 86400000);
                      if (days < 0) return <span className="text-xs text-destructive font-medium">{-days}d overdue</span>;
                      if (days === 0) return <span className="text-xs text-amber-600 font-medium">Ends today</span>;
                      return <span className="text-xs text-muted-foreground">{days}d left</span>;
                    })()}
                  </div>
                  {sprint.cards.length > 0 && (
                    <div className="mt-1.5 h-1 bg-muted rounded overflow-hidden">
                      <div
                        className="h-full bg-green-500 transition-all"
                        style={{ width: `${Math.round((sprint.cards.filter(c => c.columnIsDone).length / sprint.cards.length) * 100)}%` }}
                      />
                    </div>
                  )}
                  {(sprint.startDate || sprint.endDate) && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatDate(sprint.startDate)} {sprint.startDate && sprint.endDate ? '→' : ''} {formatDate(sprint.endDate)}
                    </p>
                  )}
                  {sprint.goal && (
                    <p className="text-xs text-muted-foreground mt-0.5 italic">&quot;{sprint.goal}&quot;</p>
                  )}
                </div>
              </button>

              {canEdit && (
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
              <div className="p-2 min-h-[3rem]">
                {sprint.cards.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    {canEdit ? 'Drop cards here, or assign from the sprint dock.' : 'No cards in this sprint.'}
                  </p>
                ) : (
                  <SortableContext items={sprint.cards.map(c => `sprint-card-${c.id}`)} strategy={verticalListSortingStrategy}>
                    {sprint.cards.map(card => (
                      <SortableSprintCard
                        key={card.id}
                        card={card}
                        sprintOptions={sprints}
                        currentSprintId={sprint.id}
                        canEdit={canEdit}
                        onMove={moveCard}
                      />
                    ))}
                  </SortableContext>
                )}
              </div>
            )}
          </div>
          </SprintDropzone>
        );
      })}

        </div>

        {/* COLUMN 2: Sprint dock (all project cards) */}
        <div className="bg-card border border-border rounded-xl overflow-hidden lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-6rem)] lg:flex lg:flex-col">
          <div className="p-4 border-b border-border">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-icons text-base text-muted-foreground">dock</span>
              <span className="font-semibold text-foreground">Sprint dock</span>
              <span className="text-xs text-muted-foreground bg-muted rounded-full px-1.5 py-0.5">
                {dockCards.length} unassigned
              </span>
            </div>

            <input
              type="text"
              value={dockSearch}
              onChange={e => setDockSearch(e.target.value)}
              placeholder="Search cards…"
              className="w-full px-3 py-1.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <SprintDropzone sprintId={null} className="p-2 lg:flex-1 lg:overflow-y-auto">
            {filteredDockCards.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">
                {dockSearch ? 'No cards match your search.' : 'No cards to show.'}
              </p>
            ) : (
              filteredDockCards.map(card => (
                <DraggableCard
                  key={card.id}
                  card={card}
                  sprintOptions={sprints}
                  currentSprintId={card.sprintId}
                  canEdit={canEdit}
                  onMove={moveCard}
                />
              ))
            )}
          </SprintDropzone>
        </div>
      </div>
    </div>

    <DragOverlay>
      {activeDrag ? (
        <div className="bg-card border border-border rounded-lg shadow-xl px-3 py-2 text-sm text-foreground flex items-center gap-2">
          {activeDrag.priority && (
            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${priorityColor(activeDrag.priority)}`}>
              {activeDrag.priority}
            </span>
          )}
          <span className="truncate max-w-xs">{activeDrag.title}</span>
        </div>
      ) : null}
    </DragOverlay>
    </DndContext>
  );
}
