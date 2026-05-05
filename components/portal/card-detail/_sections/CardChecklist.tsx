/**
 * Checklist section — items, toggle, add, remove.
 */
'use client';

import type { ChecklistItem } from '../_lib/types';

interface Props {
  checklist: ChecklistItem[];
  canEdit: boolean;
  newChecklistText: string;
  setNewChecklistText: (v: string) => void;
  addChecklist: () => void;
  toggleChecklistItem: (item: ChecklistItem) => void;
  removeChecklistItem: (id: number) => void;
}

export function CardChecklist({
  checklist,
  canEdit,
  newChecklistText,
  setNewChecklistText,
  addChecklist,
  toggleChecklistItem,
  removeChecklistItem,
}: Props) {
  if (checklist.length === 0 && !canEdit) return null;
  const completed = checklist.filter(i => i.completed).length;
  const pct = checklist.length === 0 ? 0 : Math.round((completed / checklist.length) * 100);
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Checklist{' '}
          {checklist.length > 0 && (
            <span className="ml-1.5 normal-case text-foreground">
              {completed}/{checklist.length}
            </span>
          )}
        </h3>
      </div>
      {checklist.length > 0 && (
        <>
          <div className="h-1 bg-muted rounded overflow-hidden mb-2">
            <div className="h-full bg-green-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <ul className="space-y-1 mb-2">
            {checklist.map(item => (
              <li key={item.id} className="flex items-start gap-2 group text-sm">
                <button
                  onClick={() => canEdit && toggleChecklistItem(item)}
                  disabled={!canEdit}
                  className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                    item.completed
                      ? 'bg-primary border-primary text-primary-foreground'
                      : 'border-border bg-background hover:border-primary'
                  } ${!canEdit ? 'cursor-default opacity-80' : ''}`}
                  aria-label={item.completed ? 'Mark incomplete' : 'Mark complete'}
                >
                  {item.completed && <span className="material-icons text-xs">check</span>}
                </button>
                <span
                  className={`flex-1 ${item.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}
                >
                  {item.text}
                </span>
                {canEdit && (
                  <button
                    onClick={() => removeChecklistItem(item.id)}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                    aria-label="Delete item"
                  >
                    <span className="material-icons text-sm">close</span>
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {canEdit && (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newChecklistText}
            onChange={e => setNewChecklistText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') addChecklist();
            }}
            placeholder="Add an item…"
            maxLength={500}
            className="flex-1 px-2 py-1.5 rounded border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            onClick={addChecklist}
            disabled={!newChecklistText.trim()}
            className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}
