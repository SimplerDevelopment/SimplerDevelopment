'use client';

// The right pane of the Planning tab: BacklogTab.tsx's type-filter chips +
// SavedViewsPicker fused with SprintPlanning.tsx's draggable dock rendering.
// Filter STATE lives in PlanningTab.tsx; this component is presentational
// plus the SavedViewsPicker wiring (scope="backlog", unchanged so existing
// saved views keep matching).

import { useMemo } from 'react';
import { CARD_TYPE_META, CARD_TYPE_OPTIONS } from '../card-detail/_lib/agile';
import type { CardType } from '../card-detail/_lib/types';
import SavedViewsPicker from '../SavedViewsPicker';
import { DraggableCard, SprintDropzone } from './PlanningCardRow';
import type { PlanningCard, PlanningSprint } from './types';

const KEY_OF = (projectKey: string | null, num: number | null) =>
  projectKey && num != null ? `${projectKey}-${num}` : null;

interface Props {
  projectId: number;
  projectKey: string | null;
  canEdit: boolean;
  /** Already-filtered (by typeFilter/showOnlyEstimated) unassigned cards. */
  cards: PlanningCard[];
  allSprints: PlanningSprint[];
  onMove: (cardId: number, sprintId: number | null) => Promise<void>;
  onOpenCard: (cardId: number) => void;
  typeFilter: CardType | 'all';
  onTypeFilterChange: (t: CardType | 'all') => void;
  showOnlyEstimated: boolean;
  onShowOnlyEstimatedChange: (v: boolean) => void;
}

export default function PlanningBacklogPanel({
  projectId,
  projectKey,
  canEdit,
  cards,
  allSprints,
  onMove,
  onOpenCard,
  typeFilter,
  onTypeFilterChange,
  showOnlyEstimated,
  onShowOnlyEstimatedChange,
}: Props) {
  const totalPoints = useMemo(
    () => cards.reduce((sum, c) => sum + (c.storyPoints ?? 0), 0),
    [cards],
  );
  const unsizedCount = useMemo(
    () => cards.filter(c => c.storyPoints == null).length,
    [cards],
  );

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-6rem)] lg:flex lg:flex-col">
      <div className="p-4 border-b border-border space-y-3">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <span className="material-icons text-base text-muted-foreground">dock</span>
              <span className="font-semibold text-foreground">Backlog</span>
              <span className="text-xs text-muted-foreground bg-muted rounded-full px-1.5 py-0.5">
                {cards.length} unassigned
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {totalPoints} pts total
              {unsizedCount > 0 && <span className="text-amber-600"> · {unsizedCount} unsized</span>}
            </p>
          </div>
          <SavedViewsPicker
            projectId={projectId}
            scope="backlog"
            currentFilter={{ typeFilter, showOnlyEstimated }}
            canShare={canEdit}
            onApply={(f) => {
              const next = f as { typeFilter?: CardType | 'all'; showOnlyEstimated?: boolean };
              if (next.typeFilter) onTypeFilterChange(next.typeFilter);
              if (typeof next.showOnlyEstimated === 'boolean') onShowOnlyEstimatedChange(next.showOnlyEstimated);
            }}
          />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => onTypeFilterChange('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${
              typeFilter === 'all' ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground hover:bg-accent'
            }`}
          >
            All
          </button>
          {CARD_TYPE_OPTIONS.map(t => (
            <button
              key={t}
              onClick={() => onTypeFilterChange(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 capitalize ${
                typeFilter === t ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground hover:bg-accent'
              }`}
            >
              <span className={`material-icons text-sm ${typeFilter === t ? '' : CARD_TYPE_META[t].color}`}>{CARD_TYPE_META[t].icon}</span>
              {CARD_TYPE_META[t].label}
            </button>
          ))}
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer ml-2">
            <input
              type="checkbox"
              checked={showOnlyEstimated}
              onChange={e => onShowOnlyEstimatedChange(e.target.checked)}
              className="accent-primary"
            />
            Sized only
          </label>
        </div>
      </div>

      <SprintDropzone sprintId={null} className="p-2 lg:flex-1 lg:overflow-y-auto">
        {cards.length === 0 ? (
          <div className="text-center py-8">
            <span className="material-icons text-4xl text-muted-foreground">inbox</span>
            <p className="text-xs text-muted-foreground mt-2">No cards match the current filters.</p>
          </div>
        ) : (
          cards.map(card => {
            const meta = CARD_TYPE_META[card.cardType];
            const key = KEY_OF(projectKey, card.number);
            return (
              <DraggableCard
                key={card.id}
                card={card}
                sprintOptions={allSprints}
                currentSprintId={card.sprintId}
                canEdit={canEdit}
                onMove={onMove}
                onOpen={onOpenCard}
                leading={
                  <>
                    <span className={`material-icons text-sm shrink-0 ${meta.color}`} title={meta.label}>
                      {meta.icon}
                    </span>
                    {key && <span className="font-mono text-xs text-muted-foreground shrink-0">{key}</span>}
                    {card.storyPoints == null ? (
                      <span className="text-xs text-amber-600 shrink-0">unsized</span>
                    ) : (
                      <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary shrink-0">
                        {card.storyPoints}
                      </span>
                    )}
                  </>
                }
              />
            );
          })
        )}
      </SprintDropzone>
    </div>
  );
}
