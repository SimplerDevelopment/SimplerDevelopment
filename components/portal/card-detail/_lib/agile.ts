// Static metadata for the agile fields surfaced in card detail and on the
// kanban board. Centralized so the icon/label mapping stays consistent across
// the modal sidebar, the card chip, and the backlog view.

import type { CardType, WorkflowState } from './types';

export const POINTS_OPTIONS = [0, 1, 2, 3, 5, 8, 13, 21] as const;

export const CARD_TYPE_META: Record<CardType, { label: string; icon: string; color: string }> = {
  task:  { label: 'Task',  icon: 'task_alt',         color: 'text-blue-600' },
  story: { label: 'Story', icon: 'auto_stories',     color: 'text-emerald-600' },
  epic:  { label: 'Epic',  icon: 'flag',             color: 'text-purple-600' },
  bug:   { label: 'Bug',   icon: 'bug_report',       color: 'text-red-600' },
  spike: { label: 'Spike', icon: 'science',          color: 'text-amber-600' },
};

export const WORKFLOW_STATE_META: Record<WorkflowState, { label: string; color: string }> = {
  todo:        { label: 'To do',       color: 'bg-gray-100 text-gray-700' },
  in_progress: { label: 'In progress', color: 'bg-blue-100 text-blue-700' },
  in_review:   { label: 'In review',   color: 'bg-amber-100 text-amber-800' },
  done:        { label: 'Done',        color: 'bg-emerald-100 text-emerald-700' },
  canceled:    { label: 'Canceled',    color: 'bg-gray-100 text-gray-500 line-through' },
};

export const CARD_TYPE_OPTIONS: CardType[] = ['task', 'story', 'epic', 'bug', 'spike'];
export const WORKFLOW_STATE_OPTIONS: WorkflowState[] = ['todo', 'in_progress', 'in_review', 'done', 'canceled'];
