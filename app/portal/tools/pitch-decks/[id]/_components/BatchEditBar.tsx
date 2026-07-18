/** Sticky bottom bar shown when 1+ slides are selected — applies an AI prompt to all selected slides at once. */
'use client';

import type { FormEvent } from 'react';

export interface BatchEditBarProps {
  selectedCount: number;
  totalSlides: number;
  prompt: string;
  generating: boolean;
  onPromptChange: (v: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
  onSubmit: (e: FormEvent) => void;
}

export function BatchEditBar({ selectedCount, totalSlides, prompt, generating, onPromptChange, onSelectAll, onClear, onSubmit }: BatchEditBarProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border shadow-lg px-3 sm:px-6 py-3">
      {/* Stacked on phone (selection-info above, input/button below), single row at sm+ */}
      <form onSubmit={onSubmit} className="max-w-4xl mx-auto flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <span className="material-icons text-primary text-lg">checklist</span>
          <span className="text-sm font-medium text-foreground">{selectedCount} slide{selectedCount > 1 ? 's' : ''}</span>
          <button
            type="button"
            onClick={onSelectAll}
            className="text-xs text-primary hover:text-primary/80 transition-colors"
          >
            {selectedCount === totalSlides ? 'Deselect all' : 'Select all'}
          </button>
          <span className="text-border">|</span>
          <button
            type="button"
            onClick={onClear}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
        </div>
        <div className="flex items-center gap-2 sm:flex-1">
          <div className="flex-1 relative">
            <span className="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-lg">auto_awesome</span>
            <input
              type="text"
              value={prompt}
              onChange={(e) => onPromptChange(e.target.value)}
              placeholder="Apply to selected slides... e.g. 'Make the tone more formal'"
              className="w-full pl-10 pr-3 py-2.5 bg-background border border-border rounded-lg text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              disabled={generating}
            />
          </div>
          <button
            type="submit"
            disabled={generating || !prompt.trim()}
            className="px-3 sm:px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-50 shrink-0 flex items-center gap-1.5"
          >
            {generating ? (
              <><span className="material-icons animate-spin text-base">autorenew</span><span className="hidden sm:inline">Editing {selectedCount}...</span></>
            ) : (
              <><span className="material-icons text-base">edit_note</span><span className="hidden sm:inline">Edit {selectedCount} Slides</span><span className="sm:hidden">Edit {selectedCount}</span></>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
