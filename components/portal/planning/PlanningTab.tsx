'use client';

// Orchestrator for the consolidated Planning tab (PUX-008 + PUX-009): merges
// the pre-consolidation BacklogTab.tsx + SprintPlanning.tsx into one dnd
// context, and adds a Planner/Roadmap view-mode toggle that reuses
// ProjectRoadmapTab.tsx unchanged.
//
// Owns the single fetch of /api/portal/projects/[id]/sprints — used by both
// the sprint columns and the backlog panel, so it's fetched exactly once.

import { useEffect, useState } from 'react';
import {
  DndContext,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { priorityColor } from '@/lib/portal-utils';
import ProjectRoadmapTab from '../ProjectRoadmapTab';
import type { CardType } from '../card-detail/_lib/types';
import PlanningCreateSprintForm, { type SprintFormState } from './PlanningCreateSprintForm';
import PlanningSprintColumn from './PlanningSprintColumn';
import PlanningBacklogPanel from './PlanningBacklogPanel';
import CardDetailModal from '../card-detail/CardDetailModal';
import type { PlanningCard, PlanningSprint } from './types';

interface Props {
  projectId: number;
  projectKey: string | null;
  canEdit: boolean;
  isStaff: boolean;
  currentUserId: number;
}

export default function PlanningTab({ projectId, projectKey, canEdit, isStaff, currentUserId }: Props) {
  const [sprints, setSprints] = useState<PlanningSprint[]>([]);
  const [backlog, setBacklog] = useState<PlanningCard[]>([]);
  const [selectedCardId, setSelectedCardId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [form, setForm] = useState<SprintFormState>({ name: '', goal: '', startDate: '', endDate: '' });
  const [saving, setSaving] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState<number | null>(null);
  const [activeDrag, setActiveDrag] = useState<PlanningCard | null>(null);
  const [typeFilter, setTypeFilter] = useState<CardType | 'all'>('all');
  const [showOnlyEstimated, setShowOnlyEstimated] = useState(false);
  const [viewMode, setViewMode] = useState<'planner' | 'roadmap'>('planner');
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  useEffect(() => {
    fetch(`/api/portal/projects/${projectId}/sprints`)
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setSprints(data.data.sprints);
          setBacklog(data.data.backlog);
          // Auto-expand active sprint
          const active = data.data.sprints.find((s: PlanningSprint) => s.status === 'active');
          if (active) setExpanded(new Set([active.id]));
        }
        setLoading(false);
      });
  }, [projectId]);

  // Re-pull sprints + backlog after the card-detail modal edits or deletes a
  // card, so Planner rows reflect the change. No loading flag or auto-expand —
  // this is a background refresh, not the initial load.
  async function refresh() {
    const data = await fetch(`/api/portal/projects/${projectId}/sprints`).then(r => r.json());
    if (data.success) {
      setSprints(data.data.sprints);
      setBacklog(data.data.backlog);
    }
  }

  function toggleExpanded(id: number) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function onDragStart(e: DragStartEvent) {
    const c = (e.active.data.current as { card?: PlanningCard } | undefined)?.card;
    if (c) setActiveDrag(c);
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveDrag(null);
    const { active, over } = e;
    if (!over) return;
    const data = active.data.current as { card?: PlanningCard; from?: string; sprintId?: number } | undefined;
    const card = data?.card;
    if (!card) return;

    // If dropping on another sprint-card inside the SAME sprint → reorder
    const overId = String(over.id);
    if (data?.from === 'sprint' && overId.startsWith('sprint-card-')) {
      const overData = over.data.current as { card?: PlanningCard; sprintId?: number } | undefined;
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
    let found: PlanningCard | undefined = backlog.find(c => c.id === cardId);
    if (!found) {
      for (const s of sprints) {
        found = s.cards.find(c => c.id === cardId);
        if (found) break;
      }
    }
    if (!found) return;
    if (found.sprintId === targetSprintId) return;
    const updated: PlanningCard = { ...found, sprintId: targetSprintId };

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

  const priorityWeight: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
  const allCards: PlanningCard[] = [
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

  const dockCards = allCards.filter(c => c.sprintId == null);
  const filteredDockCards = dockCards.filter(c => {
    if (typeFilter !== 'all' && c.cardType !== typeFilter) return false;
    if (showOnlyEstimated && c.storyPoints == null) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      {/* View mode toggle + New Sprint action */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/40">
          <button
            onClick={() => setViewMode('planner')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${viewMode === 'planner' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <span className="material-icons text-sm">dashboard</span>
            Planner
          </button>
          <button
            onClick={() => setViewMode('roadmap')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${viewMode === 'roadmap' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <span className="material-icons text-sm">timeline</span>
            Roadmap
          </button>
        </div>

        {viewMode === 'planner' && canEdit && (
          <button
            onClick={() => setShowCreateForm(v => !v)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <span className="material-icons text-base">add</span>
            New Sprint
          </button>
        )}
      </div>

      {viewMode === 'roadmap' ? (
        <ProjectRoadmapTab projectId={projectId} projectKey={projectKey} />
      ) : loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading sprints…</div>
      ) : (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveDrag(null)}>
          <div className="space-y-4">
            {showCreateForm && (
              <PlanningCreateSprintForm
                form={form}
                onFormChange={setForm}
                onSubmit={createSprint}
                saving={saving}
                onCancel={() => setShowCreateForm(false)}
              />
            )}

            {/* Two-column layout: sprints on the left, backlog dock on the right */}
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-4">
                {sprints.length === 0 && !showCreateForm && (
                  <div className="bg-card border border-border rounded-xl p-12 text-center">
                    <span className="material-icons text-5xl text-muted-foreground">sprint</span>
                    <h3 className="mt-4 font-semibold text-foreground">No sprints yet</h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {canEdit ? 'Create a sprint to start planning work.' : 'No sprints have been set up for this project yet.'}
                    </p>
                  </div>
                )}

                {sprints.map(sprint => (
                  <PlanningSprintColumn
                    key={sprint.id}
                    sprint={sprint}
                    allSprints={sprints}
                    isOpen={expanded.has(sprint.id)}
                    isUpdating={statusUpdating === sprint.id}
                    canEdit={canEdit}
                    onToggleExpand={toggleExpanded}
                    onUpdateStatus={updateStatus}
                    onDeleteSprint={deleteSprint}
                    onMove={moveCard}
                    onOpenCard={setSelectedCardId}
                  />
                ))}
              </div>

              <PlanningBacklogPanel
                projectId={projectId}
                projectKey={projectKey}
                canEdit={canEdit}
                cards={filteredDockCards}
                allSprints={sprints}
                onMove={moveCard}
                onOpenCard={setSelectedCardId}
                typeFilter={typeFilter}
                onTypeFilterChange={setTypeFilter}
                showOnlyEstimated={showOnlyEstimated}
                onShowOnlyEstimatedChange={setShowOnlyEstimated}
              />
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
      )}

      {selectedCardId !== null && (
        <CardDetailModal
          cardId={selectedCardId}
          projectId={projectId}
          isStaff={isStaff}
          canEdit={canEdit}
          currentUserId={currentUserId}
          onClose={() => { setSelectedCardId(null); void refresh(); }}
          onDeleted={() => { setSelectedCardId(null); void refresh(); }}
          onUpdated={() => { void refresh(); }}
        />
      )}
    </div>
  );
}
