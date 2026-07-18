/**
 * Labels strip + popover label-picker / inline label creator.
 */
'use client';

import type { Label } from '../_lib/types';

interface Props {
  labels: Label[];
  projectLabels: Label[];
  canEdit: boolean;
  showLabelMenu: boolean;
  setShowLabelMenu: (v: boolean | ((prev: boolean) => boolean)) => void;
  newLabelName: string;
  setNewLabelName: (v: string) => void;
  newLabelColor: string;
  setNewLabelColor: (v: string) => void;
  toggleLabel: (label: Label) => void;
  createAndAttachLabel: () => void;
}

export function CardLabels({
  labels,
  projectLabels,
  canEdit,
  showLabelMenu,
  setShowLabelMenu,
  newLabelName,
  setNewLabelName,
  newLabelColor,
  setNewLabelColor,
  toggleLabel,
  createAndAttachLabel,
}: Props) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
        Labels
      </h3>
      <div className="flex flex-wrap items-center gap-1.5">
        {labels.map(l => (
          <span
            key={l.id}
            className="text-xs px-2 py-0.5 rounded font-medium flex items-center gap-1"
            style={{ backgroundColor: `${l.color}22`, color: l.color }}
          >
            {l.name}
            {canEdit && (
              <button
                onClick={() => toggleLabel(l)}
                className="hover:opacity-70"
                aria-label={`Remove ${l.name}`}
              >
                <span className="material-icons text-xs">close</span>
              </button>
            )}
          </span>
        ))}
        {labels.length === 0 && (
          <span className="text-xs text-muted-foreground italic">No labels</span>
        )}
        {canEdit && (
          <div className="relative">
            <button
              onClick={() => setShowLabelMenu(v => !v)}
              className="flex items-center gap-1 text-xs px-2 py-0.5 rounded border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-primary"
            >
              <span className="material-icons text-xs">{showLabelMenu ? 'close' : 'add'}</span>
              {showLabelMenu ? 'Close' : 'Add label'}
            </button>
            {showLabelMenu && (
              <div className="absolute top-full left-0 mt-1 z-20 bg-popover border border-border rounded-lg shadow-lg w-64 p-2 space-y-2">
                <div className="max-h-48 overflow-y-auto space-y-0.5">
                  {projectLabels.length === 0 && (
                    <p className="text-xs text-muted-foreground italic p-2">
                      No labels yet. Create one below.
                    </p>
                  )}
                  {projectLabels.map(l => {
                    const on = labels.some(x => x.id === l.id);
                    return (
                      <button
                        key={l.id}
                        onClick={() => toggleLabel(l)}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-accent text-left ${on ? 'bg-accent/50' : ''}`}
                      >
                        <span
                          className="w-3 h-3 rounded shrink-0"
                          style={{ backgroundColor: l.color }}
                        />
                        <span className="flex-1 truncate">{l.name}</span>
                        {on && <span className="material-icons text-sm text-primary">check</span>}
                      </button>
                    );
                  })}
                </div>
                <div className="border-t border-border pt-2 flex items-center gap-1.5">
                  <input
                    type="color"
                    value={newLabelColor}
                    onChange={e => setNewLabelColor(e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer shrink-0"
                  />
                  <input
                    type="text"
                    value={newLabelName}
                    onChange={e => setNewLabelName(e.target.value)}
                    placeholder="New label…"
                    maxLength={50}
                    onKeyDown={e => {
                      if (e.key === 'Enter') createAndAttachLabel();
                    }}
                    className="flex-1 px-2 py-1 rounded border border-border bg-background text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <button
                    onClick={createAndAttachLabel}
                    disabled={!newLabelName.trim()}
                    className="px-2 py-1 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
