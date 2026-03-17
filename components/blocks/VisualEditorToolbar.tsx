'use client';

import { useRef, useEffect } from 'react';
import { useBlockEditor } from '@/contexts/BlockEditorContext';

export function VisualEditorToolbar() {
  const { state, undo, redo, togglePreviewMode, pageSettings } = useBlockEditor();
  const previewChannelRef = useRef<BroadcastChannel | null>(null);

  // Keep a BroadcastChannel open to send live updates to the preview tab
  useEffect(() => {
    previewChannelRef.current = new BroadcastChannel('block-editor-preview');
    return () => previewChannelRef.current?.close();
  }, []);

  // Send block and page settings updates to preview tab
  useEffect(() => {
    previewChannelRef.current?.postMessage({
      type: 'BLOCKS_UPDATE',
      blocks: state.blocks,
    });
  }, [state.blocks]);

  useEffect(() => {
    previewChannelRef.current?.postMessage({
      type: 'PAGE_SETTINGS_UPDATE',
      pageSettings,
    });
  }, [pageSettings]);

  const openFullPreview = () => {
    // Store current state in sessionStorage for the preview page to read
    sessionStorage.setItem('previewBlocks', JSON.stringify(state.blocks));
    sessionStorage.setItem('previewPageSettings', JSON.stringify(pageSettings));

    const titleEl = document.querySelector('[data-post-title]');
    const title = titleEl?.textContent || document.title || 'Preview';
    sessionStorage.setItem('previewTitle', title);

    // Also send via BroadcastChannel for live updates
    previewChannelRef.current?.postMessage({ type: 'BLOCKS_UPDATE', blocks: state.blocks });
    previewChannelRef.current?.postMessage({ type: 'TITLE_UPDATE', title });
    previewChannelRef.current?.postMessage({ type: 'PAGE_SETTINGS_UPDATE', pageSettings });

    window.open('/preview/live', '_blank');
  };

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

      {/* Inline Preview Toggle */}
      <button
        type="button"
        onClick={() => togglePreviewMode()}
        className={`flex items-center justify-center px-3 py-1.5 text-xs rounded border transition-colors ${
          state.previewMode
            ? 'border-primary bg-primary/10 text-primary'
            : 'border-border hover:bg-accent'
        }`}
        title={state.previewMode ? 'Exit Preview' : 'Inline Preview'}
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

      {/* Full Page Preview Button */}
      <button
        type="button"
        onClick={openFullPreview}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border border-border hover:bg-accent transition-colors"
        title="Full Page Preview (opens in new tab)"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
        <span className="hidden sm:inline">Preview</span>
      </button>
    </div>
  );
}
