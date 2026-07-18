// Shared types for the consolidated Planning tab (Backlog + Sprints + Roadmap).
//
// The GET /api/portal/projects/[id]/sprints endpoint returns every card (both
// backlog and sprint cards) in the SAME shape, so one unified card type covers
// both the backlog dock and the sprint columns — no separate "backlog card"
// vs "sprint card" interfaces needed.

import type { CardType, WorkflowState } from '../card-detail/_lib/types';

export interface PlanningCard {
  id: number;
  number: number | null;
  title: string;
  priority: string | null;
  sprintId: number | null;
  sprintOrder: number | null;
  columnId: number | null;
  columnName: string | null;
  columnIsDone: boolean | null;
  order: number;
  storyPoints: number | null;
  cardType: CardType;
  parentCardId: number | null;
  workflowState: WorkflowState;
}

export interface PlanningSprint {
  id: number;
  name: string;
  goal: string | null;
  startDate: string | null;
  endDate: string | null;
  status: string;
  order: number;
  cards: PlanningCard[];
}
