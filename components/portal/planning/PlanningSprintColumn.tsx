'use client';

// One sprint's card block for the Planning tab — extracted from the
// pre-consolidation SprintPlanning.tsx sprint-list render (header with
// expand/collapse, status badge, progress, dates, goal, actions, then the
// card list body).

import { useState } from 'react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SprintDropzone, SortableSprintCard } from './PlanningCardRow';
import type { PlanningSprint } from './types';

const statusConfig: Record<string, { label: string; color: string; icon: string }> = {
  planning: { label: 'Planning', color: 'bg-blue-100 text-blue-700', icon: 'edit_calendar' },
  active:   { label: 'Active',   color: 'bg-green-100 text-green-700', icon: 'play_circle' },
  completed:{ label: 'Completed',color: 'bg-gray-100 text-gray-500',  icon: 'check_circle' },
};

function formatDate(d: string | null) {
  if (!d) return null;
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface Props {
  sprint: PlanningSprint;
  allSprints: PlanningSprint[];
  isOpen: boolean;
  isUpdating: boolean;
  canEdit: boolean;
  onToggleExpand: (id: number) => void;
  onUpdateStatus: (id: number, status: string) => void;
  onDeleteSprint: (id: number) => void;
  onMove: (cardId: number, sprintId: number | null) => Promise<void>;
  onOpenCard: (cardId: number) => void;
}

export default function PlanningSprintColumn({
  sprint,
  allSprints,
  isOpen,
  isUpdating,
  canEdit,
  onToggleExpand,
  onUpdateStatus,
  onDeleteSprint,
  onMove,
  onOpenCard,
}: Props) {
  const cfg = statusConfig[sprint.status] ?? statusConfig.planning;
  // Captured once on mount — stable for the "days left" calc. useState lazy
  // initializer satisfies react-hooks/purity (same pattern as
  // ProjectRoadmapTab.tsx's "today" marker).
  const [now] = useState(() => Date.now());

  return (
    <SprintDropzone sprintId={sprint.id}>
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {/* Sprint header */}
        <div className="flex items-center gap-3 p-4 border-b border-border">
          <button
            onClick={() => onToggleExpand(sprint.id)}
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
                  const days = Math.ceil((new Date(sprint.endDate!).getTime() - now) / 86400000);
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
                  onClick={() => onUpdateStatus(sprint.id, 'active')}
                  className="text-xs px-3 py-1.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  Start Sprint
                </button>
              )}
              {sprint.status === 'active' && (
                <button
                  disabled={isUpdating}
                  onClick={() => onUpdateStatus(sprint.id, 'completed')}
                  className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  Complete
                </button>
              )}
              <button
                onClick={() => onDeleteSprint(sprint.id)}
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
                    sprintOptions={allSprints}
                    currentSprintId={sprint.id}
                    canEdit={canEdit}
                    onMove={onMove}
                    onOpen={onOpenCard}
                  />
                ))}
              </SortableContext>
            )}
          </div>
        )}
      </div>
    </SprintDropzone>
  );
}
