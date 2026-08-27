'use client';

// The board's filter controls (PUX-152, design doc screen 11). Extracted from
// KanbanBoard.tsx — which sits at its file-size cap — in two shapes:
//   LegacyBoardFilters  today's markup, verbatim (the board's unit tests query
//                       it by placeholder / text / class — do not restyle it)
//   StudioBoardFilters  "the four filters that already exist, in one row":
//                       search + Sprint / Priority / Assignee / Label selects.
// Same state either way; the board owns it and passes it down.
//
// ponytail: the Studio selects pick ONE value per filter (the sets still
// allow many — the legacy chips toggle them). Multi-select dropdowns if
// anyone asks for "high or urgent" in the redesign.
import type { Dispatch, SetStateAction } from 'react';
import { pInput, pSelect } from '@/components/portal/portal-ui';
import type { CardLabel, SprintOption } from '@/components/portal/KanbanBoard';

export interface BoardFiltersProps {
  studio: boolean;
  search: string;
  onSearch: (v: string) => void;
  priority: Set<string>;
  setPriority: Dispatch<SetStateAction<Set<string>>>;
  sprints: SprintOption[];
  sprintId: number | 'backlog' | null;
  onSprint: (v: number | 'backlog' | null) => void;
  assignees: { id: number; name: string }[];
  assigneeIds: Set<number>;
  setAssignees: Dispatch<SetStateAction<Set<number>>>;
  labels: CardLabel[];
  labelIds: Set<number>;
  setLabels: Dispatch<SetStateAction<Set<number>>>;
  activeCount: number;
  onClear: () => void;
}

const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

function toggleSetValue<T>(setter: Dispatch<SetStateAction<Set<T>>>, value: T) {
  setter(prev => {
    const next = new Set(prev);
    if (next.has(value)) next.delete(value); else next.add(value);
    return next;
  });
}

export default function BoardFilters(props: BoardFiltersProps) {
  return props.studio ? <StudioBoardFilters {...props} /> : <LegacyBoardFilters {...props} />;
}

const sel = `${pSelect} h-8 w-auto rounded-lg py-0 pl-2.5 pr-8 text-xs`;

export function StudioBoardFilters({
  search, onSearch, priority, setPriority, sprints, sprintId, onSprint,
  assignees, assigneeIds, setAssignees, labels, labelIds, setLabels, activeCount, onClear,
}: BoardFiltersProps) {
  const one = <T,>(setter: Dispatch<SetStateAction<Set<T>>>, v: T | null) => setter(new Set(v === null ? [] : [v]));
  const first = <T,>(s: Set<T>): T | '' => (s.size === 1 ? [...s][0] : '');
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <div className="relative w-[280px] max-w-full">
        <span className="material-icons absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">search</span>
        <input type="text" value={search} onChange={e => onSearch(e.target.value)} placeholder="Search cards…" className={`${pInput} h-8 rounded-lg py-0 pl-8 text-xs`} />
      </div>
      {sprints.length > 0 && (
        <select aria-label="Sprint" className={sel} value={sprintId === null ? '' : String(sprintId)} onChange={e => onSprint(e.target.value === '' ? null : e.target.value === 'backlog' ? 'backlog' : Number(e.target.value))}>
          <option value="">All sprints</option>
          {sprints.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          <option value="backlog">Backlog</option>
        </select>
      )}
      <select aria-label="Priority" className={sel} value={first(priority)} onChange={e => one(setPriority, e.target.value || null)}>
        <option value="">Priority: Any</option>
        {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
      </select>
      {assignees.length > 0 && (
        <select aria-label="Assignee" className={sel} value={first(assigneeIds)} onChange={e => one(setAssignees, e.target.value ? Number(e.target.value) : null)}>
          <option value="">Assignee: Anyone</option>
          {assignees.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      )}
      {labels.length > 0 && (
        <select aria-label="Label" className={sel} value={first(labelIds)} onChange={e => one(setLabels, e.target.value ? Number(e.target.value) : null)}>
          <option value="">Label: Any</option>
          {labels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      )}
      {activeCount > 0 && (
        <button type="button" onClick={onClear} className="ml-auto text-xs text-muted-foreground hover:text-destructive">Clear filters ({activeCount})</button>
      )}
    </div>
  );
}

export function LegacyBoardFilters({
  search, onSearch, priority, setPriority, sprints, sprintId, onSprint,
  assignees, assigneeIds, setAssignees, labels, labelIds, setLabels, activeCount, onClear,
}: BoardFiltersProps) {
  return (
      <div className="space-y-2 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <span className="material-icons text-sm text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2">search</span>
            <input
              type="text"
              value={search}
              onChange={e => onSearch(e.target.value)}
              placeholder="Filter cards…"
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          {PRIORITIES.map(p => (
            <button
              key={p}
              onClick={() => toggleSetValue(setPriority, p)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${priority.has(p) ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}
            >
              {p}
            </button>
          ))}
          {activeCount > 0 && (
            <button onClick={onClear} className="text-xs px-2.5 py-1 rounded-full text-muted-foreground hover:text-destructive ml-auto">
              Clear filters ({activeCount})
            </button>
          )}
        </div>
        {(sprints.length > 0 || assignees.length > 0 || labels.length > 0) && (
          <div className="flex items-center gap-3 flex-wrap text-xs">
            {sprints.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-muted-foreground">Sprint:</span>
                <button onClick={() => onSprint(null)}
                  className={`px-2 py-0.5 rounded-full border ${sprintId === null ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>All</button>
                {sprints.map(s => (
                  <button key={s.id} onClick={() => onSprint(s.id)}
                    className={`px-2 py-0.5 rounded-full border ${sprintId === s.id ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>{s.name}</button>
                ))}
                <button onClick={() => onSprint('backlog')}
                  className={`px-2 py-0.5 rounded-full border ${sprintId === 'backlog' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>Backlog</button>
              </div>
            )}
            {assignees.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-muted-foreground">Assignee:</span>
                {assignees.map(a => (
                  <button key={a.id} onClick={() => toggleSetValue(setAssignees, a.id)}
                    className={`px-2 py-0.5 rounded-full border ${assigneeIds.has(a.id) ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>
                    {a.name}
                  </button>
                ))}
              </div>
            )}
            {labels.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-muted-foreground">Label:</span>
                {labels.map(l => {
                  const on = labelIds.has(l.id);
                  return (
                    <button key={l.id} onClick={() => toggleSetValue(setLabels, l.id)}
                      className="px-2 py-0.5 rounded-full border transition-colors"
                      style={{
                        backgroundColor: on ? l.color : 'transparent',
                        color: on ? '#fff' : l.color,
                        borderColor: l.color,
                      }}>
                      {l.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
  );
}
