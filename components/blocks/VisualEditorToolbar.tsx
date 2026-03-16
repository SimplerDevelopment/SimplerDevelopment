'use client';

import { useBlockEditor } from '@/contexts/BlockEditorContext';

export function VisualEditorToolbar() {
  const { state, undo, redo, togglePreviewMode } = useBlockEditor();

  return (
    <div className="flex items-center gap-2">
      {/* Undo Button */}
      <button
        type="button"
        onClick={undo}
        disabled={!state.canUndo}
        className="flex items-center justify-center px-3 py-1.5 text-xs rounded border border-border hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        title="Undo (Cmd+Z)"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
        </svg>
      </button>

      {/* Redo Button */}
      <button
        type="button"
        onClick={redo}
        disabled={!state.canRedo}
        className="flex items-center justify-center px-3 py-1.5 text-xs rounded border border-border hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        title="Redo (Cmd+Shift+Z)"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" />
        </svg>
      </button>

      {/* Preview Toggle Button */}
      <button
        type="button"
        onClick={() => togglePreviewMode()}
        className="flex items-center justify-center px-3 py-1.5 text-xs rounded border border-border hover:bg-accent transition-colors"
        title={state.previewMode ? 'Exit Preview (Cmd+Shift+P)' : 'Preview (Cmd+Shift+P)'}
      >
        {state.previewMode ? (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        )}
      </button>
    </div>
  );
}
