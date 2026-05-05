/** Version history sidebar — list checkpoints, save manual checkpoint, restore. */
'use client';

import type { VersionMeta } from '../_lib/api';

const triggerLabel: Record<string, string> = {
  manual: 'Checkpoint',
  ai_generate: 'Before AI generate',
  ai_regenerate: 'Before AI regenerate',
  ai_slide_edit: 'Before AI slide edit',
};
const triggerIcon: Record<string, string> = {
  manual: 'save',
  ai_generate: 'auto_awesome',
  ai_regenerate: 'auto_awesome',
  ai_slide_edit: 'edit',
};

export interface HistoryPanelProps {
  versions: VersionMeta[];
  savingVersion: boolean;
  restoring: boolean;
  slideCount: number;
  onClose: () => void;
  onSaveCheckpoint: () => void;
  onRestore: (versionId: number) => void;
}

export function HistoryPanel({ versions, savingVersion, restoring, slideCount, onClose, onSaveCheckpoint, onRestore }: HistoryPanelProps) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Version History</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={onSaveCheckpoint}
            disabled={savingVersion || slideCount === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1 text-xs bg-primary text-primary-foreground rounded-lg font-medium disabled:opacity-50"
          >
            {savingVersion ? (
              <span className="material-icons animate-spin text-xs">autorenew</span>
            ) : (
              <span className="material-icons text-xs">save</span>
            )}
            Save Checkpoint
          </button>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <span className="material-icons text-base">close</span>
          </button>
        </div>
      </div>
      {versions.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          No versions yet. Versions are auto-saved before each AI edit.
        </p>
      ) : (
        <div className="max-h-60 overflow-y-auto space-y-1.5">
          {versions.map((v) => (
            <div key={v.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-accent/50 transition-colors group">
              <span className="material-icons text-base text-muted-foreground">{triggerIcon[v.trigger] || 'history'}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground truncate">
                  {v.label || triggerLabel[v.trigger] || v.trigger}
                </div>
                <div className="text-xs text-muted-foreground">
                  {v.slideCount} slides &middot; {new Date(v.createdAt).toLocaleString()}
                </div>
              </div>
              <button
                onClick={() => onRestore(v.id)}
                disabled={restoring}
                className="opacity-0 group-hover:opacity-100 inline-flex items-center gap-1 px-2 py-1 text-xs border border-border rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-all disabled:opacity-50"
              >
                <span className="material-icons text-xs">restore</span>
                Restore
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
