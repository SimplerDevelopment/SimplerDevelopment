/**
 * Right-rail sidebar — assignees, priority, due date, and the delete-card
 * confirmation control. Watch toggle lives at the top, in CardWatchers.
 */
'use client';

import { priorityColor } from '@/lib/portal-utils';
import type { Assignee, CardDetail, MentionUser, CardType, WorkflowState } from '../_lib/types';
import { CARD_TYPE_OPTIONS, CARD_TYPE_META, WORKFLOW_STATE_OPTIONS, WORKFLOW_STATE_META, POINTS_OPTIONS } from '../_lib/agile';
import { CardWatchers } from './CardWatchers';

interface Props {
  card: CardDetail;
  canEdit: boolean;
  assignees: Assignee[];
  mentionUsers: MentionUser[];
  showAssigneeMenu: boolean;
  setShowAssigneeMenu: (v: boolean | ((prev: boolean) => boolean)) => void;
  addAssignee: (user: MentionUser) => void;
  removeAssignee: (id: number) => void;

  watching: boolean;
  toggleWatch: () => void;

  saveField: (field: string, value: unknown) => void;
  savingField: string | null;

  confirmDelete: boolean;
  setConfirmDelete: (v: boolean) => void;
  deleting: boolean;
  removeCard: () => void;
}

export function CardSidebar({
  card,
  canEdit,
  assignees,
  mentionUsers,
  showAssigneeMenu,
  setShowAssigneeMenu,
  addAssignee,
  removeAssignee,
  watching,
  toggleWatch,
  saveField,
  savingField,
  confirmDelete,
  setConfirmDelete,
  deleting,
  removeCard,
}: Props) {
  const assigneeCandidates = mentionUsers.filter(u => !assignees.some(a => a.id === u.id));
  return (
    <div className="w-52 shrink-0 border-l border-border p-4 space-y-5 overflow-y-auto bg-card">
      <CardWatchers watching={watching} toggleWatch={toggleWatch} />

      <div>
        <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
          Assignees
        </label>
        <div className="space-y-1.5">
          {assignees.map(a => (
            <div key={a.id} className="flex items-center gap-2 text-sm">
              <span className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-semibold text-primary shrink-0">
                {(a.name ?? '?').trim().charAt(0).toUpperCase()}
              </span>
              <span className="flex-1 text-foreground truncate">{a.name}</span>
              {canEdit && (
                <button
                  onClick={() => removeAssignee(a.id)}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={`Remove ${a.name}`}
                >
                  <span className="material-icons text-sm">close</span>
                </button>
              )}
            </div>
          ))}
          {assignees.length === 0 && (
            <p className="text-xs text-muted-foreground italic">No one assigned</p>
          )}
          {canEdit && (
            <div className="relative">
              <button
                onClick={() => setShowAssigneeMenu(v => !v)}
                className="w-full flex items-center justify-center gap-1 px-2 py-1 rounded border border-dashed border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary"
              >
                <span className="material-icons text-sm">
                  {showAssigneeMenu ? 'close' : 'person_add'}
                </span>
                {showAssigneeMenu ? 'Close' : 'Add'}
              </button>
              {showAssigneeMenu && (
                <div className="absolute top-full left-0 right-0 mt-1 z-20 bg-popover border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {assigneeCandidates.map(u => (
                    <button
                      key={u.id}
                      onClick={() => {
                        addAssignee(u);
                        setShowAssigneeMenu(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-accent text-left"
                    >
                      <span className="material-icons text-sm text-muted-foreground">person</span>
                      {u.name}
                    </button>
                  ))}
                  {assigneeCandidates.length === 0 && (
                    <p className="text-xs text-muted-foreground italic p-3">No one left to add</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
          Type
        </label>
        {canEdit ? (
          <select
            value={card.cardType ?? 'task'}
            onChange={e => saveField('cardType', e.target.value as CardType)}
            disabled={savingField === 'cardType'}
            className="w-full px-2 py-1.5 rounded border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {CARD_TYPE_OPTIONS.map(t => <option key={t} value={t}>{CARD_TYPE_META[t].label}</option>)}
          </select>
        ) : (
          <div className="flex items-center gap-1.5 text-sm text-foreground">
            <span className={`material-icons text-base ${CARD_TYPE_META[card.cardType ?? 'task'].color}`}>
              {CARD_TYPE_META[card.cardType ?? 'task'].icon}
            </span>
            {CARD_TYPE_META[card.cardType ?? 'task'].label}
          </div>
        )}
      </div>

      <div>
        <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
          Story points
        </label>
        {canEdit ? (
          <div className="flex flex-wrap gap-1">
            {POINTS_OPTIONS.map(p => (
              <button
                key={p}
                onClick={() => saveField('storyPoints', card.storyPoints === p ? null : p)}
                disabled={savingField === 'storyPoints'}
                className={`min-w-[28px] h-7 px-1.5 rounded text-xs font-medium border transition-colors ${
                  card.storyPoints === p
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background text-foreground border-border hover:border-primary/50'
                }`}
                aria-label={`${p} points${card.storyPoints === p ? ' (selected, click to clear)' : ''}`}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => saveField('storyPoints', null)}
              disabled={savingField === 'storyPoints' || card.storyPoints == null}
              className="min-w-[28px] h-7 px-1.5 rounded text-xs font-medium border border-border bg-background text-muted-foreground hover:text-destructive hover:border-destructive disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Clear points"
            >
              —
            </button>
          </div>
        ) : (
          <span className="text-sm text-foreground">
            {card.storyPoints == null ? <span className="text-muted-foreground">—</span> : card.storyPoints}
          </span>
        )}
      </div>

      <div>
        <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
          Workflow state
        </label>
        {canEdit ? (
          <select
            value={card.workflowState ?? 'todo'}
            onChange={e => saveField('workflowState', e.target.value as WorkflowState)}
            disabled={savingField === 'workflowState'}
            className="w-full px-2 py-1.5 rounded border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {WORKFLOW_STATE_OPTIONS.map(s => <option key={s} value={s}>{WORKFLOW_STATE_META[s].label}</option>)}
          </select>
        ) : (
          <span className={`text-xs px-2 py-1 rounded font-medium ${WORKFLOW_STATE_META[card.workflowState ?? 'todo'].color}`}>
            {WORKFLOW_STATE_META[card.workflowState ?? 'todo'].label}
          </span>
        )}
      </div>

      <div>
        <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
          Priority
        </label>
        {canEdit ? (
          <select
            value={card.priority ?? 'medium'}
            onChange={e => saveField('priority', e.target.value)}
            disabled={savingField === 'priority'}
            className="w-full px-2 py-1.5 rounded border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        ) : (
          <span
            className={`text-xs px-2 py-1 rounded font-medium ${priorityColor(card.priority ?? 'medium')}`}
          >
            {card.priority ?? 'medium'}
          </span>
        )}
      </div>

      <div>
        <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
          Due Date
        </label>
        {canEdit ? (
          <input
            type="date"
            value={card.dueDate ? new Date(card.dueDate).toISOString().split('T')[0] : ''}
            onChange={e => saveField('dueDate', e.target.value || null)}
            disabled={savingField === 'dueDate'}
            className="w-full px-2 py-1.5 rounded border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        ) : (
          <span className="text-sm text-foreground">
            {card.dueDate ? (
              new Date(card.dueDate).toLocaleDateString('en-US')
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </span>
        )}
      </div>

      {canEdit && (
        <div className="pt-4 border-t border-border">
          {confirmDelete ? (
            <div className="space-y-2">
              <p className="text-xs text-destructive font-medium">Delete this card?</p>
              <div className="flex gap-2">
                <button
                  onClick={removeCard}
                  disabled={deleting}
                  className="flex-1 px-2 py-1.5 bg-destructive text-destructive-foreground rounded text-xs font-medium hover:bg-destructive/90 disabled:opacity-50"
                >
                  {deleting ? 'Deleting…' : 'Delete'}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1 px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-destructive transition-colors w-full"
            >
              <span className="material-icons text-base">delete_outline</span>Delete card
            </button>
          )}
        </div>
      )}
    </div>
  );
}
