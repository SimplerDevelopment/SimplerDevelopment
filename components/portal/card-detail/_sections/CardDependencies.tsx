/**
 * Dependencies (blockers + blocking) section.
 */
'use client';

import type { DependencyRef } from '../_lib/types';

interface Props {
  cardId: number;
  blockers: DependencyRef[];
  blocking: DependencyRef[];
  projectCards: DependencyRef[];
  canEdit: boolean;
  showDepMenu: boolean;
  setShowDepMenu: (v: boolean) => void;
  openDepMenu: () => void;
  addBlocker: (target: DependencyRef) => void;
  removeBlocker: (id: number) => void;
}

export function CardDependencies({
  cardId,
  blockers,
  blocking,
  projectCards,
  canEdit,
  showDepMenu,
  setShowDepMenu,
  openDepMenu,
  addBlocker,
  removeBlocker,
}: Props) {
  if (blockers.length === 0 && blocking.length === 0 && !canEdit) return null;
  const candidates = projectCards.filter(c => c.id !== cardId && !blockers.some(b => b.id === c.id));
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Dependencies
        </h3>
        {canEdit && (
          <div className="relative">
            <button
              onClick={openDepMenu}
              className="flex items-center gap-1 text-xs text-primary hover:text-primary/80"
            >
              <span className="material-icons text-sm">{showDepMenu ? 'close' : 'add_link'}</span>
              {showDepMenu ? 'Close' : 'Add blocker'}
            </button>
            {showDepMenu && (
              <div className="absolute right-0 top-full mt-1 z-20 bg-popover border border-border rounded-lg shadow-lg w-72 max-h-64 overflow-y-auto">
                {candidates.map(c => (
                  <button
                    key={c.id}
                    onClick={() => {
                      addBlocker(c);
                      setShowDepMenu(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-accent text-left"
                  >
                    {c.key && <span className="font-mono text-muted-foreground shrink-0">{c.key}</span>}
                    <span
                      className={`flex-1 truncate ${c.columnIsDone ? 'line-through text-muted-foreground' : 'text-foreground'}`}
                    >
                      {c.title}
                    </span>
                  </button>
                ))}
                {candidates.length === 0 && (
                  <p className="text-xs text-muted-foreground italic p-3">
                    No other cards to depend on.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      {blockers.length > 0 && (
        <>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
            Blocked by
          </p>
          <ul className="space-y-1 mb-2">
            {blockers.map(b => (
              <li key={b.id} className="flex items-center gap-2 text-sm group">
                <span className="material-icons text-sm text-destructive">block</span>
                {b.key && (
                  <span className="font-mono text-xs text-muted-foreground shrink-0">{b.key}</span>
                )}
                <span
                  className={`flex-1 truncate ${b.columnIsDone ? 'line-through text-muted-foreground' : 'text-foreground'}`}
                >
                  {b.title}
                </span>
                {canEdit && (
                  <button
                    onClick={() => removeBlocker(b.id)}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                    aria-label="Remove blocker"
                  >
                    <span className="material-icons text-sm">close</span>
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {blocking.length > 0 && (
        <>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 mt-2">
            Blocking
          </p>
          <ul className="space-y-1">
            {blocking.map(b => (
              <li key={b.id} className="flex items-center gap-2 text-sm">
                <span className="material-icons text-sm text-amber-600">bolt</span>
                {b.key && (
                  <span className="font-mono text-xs text-muted-foreground shrink-0">{b.key}</span>
                )}
                <span
                  className={`flex-1 truncate ${b.columnIsDone ? 'line-through text-muted-foreground' : 'text-foreground'}`}
                >
                  {b.title}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {blockers.length === 0 && blocking.length === 0 && !showDepMenu && (
        <p className="text-xs text-muted-foreground italic">No dependencies.</p>
      )}
    </div>
  );
}
