'use client';

import { useState } from 'react';
import { formatCurrency, priorityColor } from '../_lib/ui';
import type { Deal, Stage } from '../_lib/types';

interface DealKanbanProps {
  stages: Stage[];
  deals: Deal[];
  loading: boolean;
  onMoveDeal: (dealId: number, newStageId: number) => void | Promise<void>;
  onOpenDeal: (deal: Deal) => void;
}

/**
 * Pipeline kanban board: one column per stage, draggable deal cards. Mirrors
 * the inline implementation that lived in page.tsx — drag/drop state, totals,
 * card click → openDeal — with no behavior changes.
 */
export default function DealKanban({
  stages,
  deals,
  loading,
  onMoveDeal,
  onOpenDeal,
}: DealKanbanProps) {
  const [dragDealId, setDragDealId] = useState<number | null>(null);
  const [dragOverStageId, setDragOverStageId] = useState<number | null>(null);

  function getDealsForStage(stageId: number): Deal[] {
    return deals.filter((d) => d.stageId === stageId);
  }

  function getStageTotal(stageId: number): number {
    return getDealsForStage(stageId).reduce((sum, d) => sum + d.value, 0);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="material-icons animate-spin text-primary text-2xl">refresh</span>
      </div>
    );
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {stages.map((stage) => {
        const stageDeals = getDealsForStage(stage.id);
        const stageTotal = getStageTotal(stage.id);
        const isOver = dragOverStageId === stage.id;
        return (
          <div
            key={stage.id}
            className="flex-shrink-0 w-72"
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverStageId(stage.id);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverStageId(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragOverStageId(null);
              if (dragDealId && dragDealId !== null) {
                const deal = deals.find((d) => d.id === dragDealId);
                if (deal && deal.stageId !== stage.id) {
                  void onMoveDeal(dragDealId, stage.id);
                }
              }
              setDragDealId(null);
            }}
          >
            {/* Stage header */}
            <div className="bg-card border border-border rounded-t-xl px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: stage.color || '#6b7280' }}
                  />
                  <h4 className="text-sm font-semibold text-foreground">{stage.name}</h4>
                  <span className="text-xs text-muted-foreground bg-accent px-1.5 py-0.5 rounded-full">
                    {stageDeals.length}
                  </span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-1 font-medium">
                {formatCurrency(stageTotal)}
              </p>
            </div>

            {/* Deal cards */}
            <div
              className={`space-y-2 min-h-[200px] border-x border-b border-border rounded-b-xl p-2 transition-colors ${
                isOver ? 'bg-primary/10 border-primary/30' : 'bg-muted/30'
              }`}
            >
              {stageDeals.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6">
                  {isOver ? 'Drop here' : 'No deals'}
                </p>
              )}
              {stageDeals.map((deal) => (
                <div
                  key={deal.id}
                  draggable
                  onDragStart={(e) => {
                    setDragDealId(deal.id);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragEnd={() => {
                    setDragDealId(null);
                    setDragOverStageId(null);
                  }}
                  onClick={() => onOpenDeal(deal)}
                  className={`bg-card border border-border rounded-lg p-3 space-y-2 hover:border-primary/40 transition-colors cursor-grab active:cursor-grabbing ${
                    dragDealId === deal.id ? 'opacity-40' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="material-icons text-xs text-muted-foreground/50">drag_indicator</span>
                      <h5 className="text-sm font-medium text-foreground leading-tight">{deal.title}</h5>
                    </div>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${
                        priorityColor[deal.priority] ?? 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {deal.priority}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-foreground">{formatCurrency(deal.value)}</p>
                    {deal.recurringValue != null && deal.recurringValue > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded font-medium">
                        {formatCurrency(deal.recurringValue)}/
                        {deal.billingCycle === 'annual'
                          ? 'yr'
                          : deal.billingCycle === 'quarterly'
                            ? 'qtr'
                            : 'mo'}
                      </span>
                    )}
                  </div>
                  {deal.contactName && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="material-icons text-xs">person</span>
                      {deal.contactName}
                    </div>
                  )}
                  {deal.companyName && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="material-icons text-xs">business</span>
                      {deal.companyName}
                    </div>
                  )}
                  {deal.expectedCloseDate && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="material-icons text-xs">event</span>
                      {new Date(deal.expectedCloseDate).toLocaleDateString()}
                    </div>
                  )}
                  {deal.ownerName && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="material-icons text-xs">account_circle</span>
                      {deal.ownerName}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
