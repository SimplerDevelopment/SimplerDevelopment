/** Regenerate-from-prompt modal — sends a single prompt to the deck's `/generate` endpoint to rewrite all slides. */
'use client';

import type { FormEvent } from 'react';

export interface RegenerateModalProps {
  prompt: string;
  regenerating: boolean;
  error: string;
  onPromptChange: (v: string) => void;
  onClose: () => void;
  onSubmit: (e: FormEvent) => void;
}

export function RegenerateModal({ prompt, regenerating, error, onPromptChange, onClose, onSubmit }: RegenerateModalProps) {
  return (
    <form onSubmit={onSubmit} className="bg-card border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Regenerate All Slides</h3>
        <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <span className="material-icons text-base">close</span>
        </button>
      </div>
      <textarea
        value={prompt}
        onChange={(e) => onPromptChange(e.target.value)}
        placeholder="Describe what the new deck should focus on..."
        rows={3}
        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
        disabled={regenerating}
      />
      {error && (
        <div className="flex items-center gap-2 p-2 bg-red-900/20 border border-red-800 rounded-lg text-red-400 text-xs">
          <span className="material-icons text-sm">error</span>
          {error}
        </div>
      )}
      <button
        type="submit"
        disabled={regenerating || !prompt.trim()}
        className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-50"
      >
        {regenerating ? (
          <><span className="material-icons animate-spin text-base">autorenew</span>Generating...</>
        ) : (
          <><span className="material-icons text-base">auto_awesome</span>Regenerate Deck</>
        )}
      </button>
    </form>
  );
}
