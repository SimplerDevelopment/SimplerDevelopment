'use client';

import { VisualEditorToolbar } from '@/components/blocks/VisualEditorToolbar';
import { ViewportSelector } from '@/components/blocks/ViewportSelector';

interface PostFormInnerProps {
  contentMode: 'blocks' | 'raw';
  editorMode: 'visual' | 'classic';
  onEditorModeChange: (mode: 'visual' | 'classic') => void;
  contentMenuOpen: boolean;
  onContentMenuToggle: () => void;
  onContentModeChange: (mode: 'blocks' | 'raw') => void;
}

export function PostFormInnerControls({
  contentMode,
  editorMode,
  onEditorModeChange,
  contentMenuOpen,
  onContentMenuToggle,
  onContentModeChange,
}: PostFormInnerProps) {
  // Determine current mode label
  const getCurrentModeLabel = () => {
    if (contentMode === 'raw') return 'JSON';
    if (contentMode === 'blocks' && editorMode === 'visual') return 'Block Editor';
    return 'Classic';
  };

  const handleModeSelect = (mode: 'visual' | 'classic' | 'raw') => {
    if (mode === 'raw') {
      onContentModeChange('raw');
    } else {
      onContentModeChange('blocks');
      onEditorModeChange(mode);
    }
    onContentMenuToggle();
  };

  return (
    <div className="flex items-center gap-3">
      {/* Undo, Redo, Preview (only show when in block mode and visual editor) */}
      {contentMode === 'blocks' && editorMode === 'visual' && <VisualEditorToolbar />}

      {/* Viewport Selector (only show when in block mode and visual editor) */}
      {contentMode === 'blocks' && editorMode === 'visual' && <ViewportSelector />}

      {/* Editor Mode Dropdown Menu with Eye Icon */}
      <div className="relative">
        <button
          type="button"
          onClick={onContentMenuToggle}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-accent transition-colors"
          title="Editor Mode"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          <span className="hidden sm:inline">{getCurrentModeLabel()}</span>
        </button>

        {contentMenuOpen && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={onContentMenuToggle}
            />
            <div className="absolute right-0 mt-2 w-56 bg-background border border-border rounded-md shadow-lg overflow-hidden z-20">
              <div className="py-1">
                <button
                  type="button"
                  onClick={() => handleModeSelect('visual')}
                  className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                    contentMode === 'blocks' && editorMode === 'visual'
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-foreground hover:bg-accent'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                    </svg>
                    Block Editor
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => handleModeSelect('classic')}
                  className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                    contentMode === 'blocks' && editorMode === 'classic'
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-foreground hover:bg-accent'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Classic
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => handleModeSelect('raw')}
                  className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                    contentMode === 'raw'
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-foreground hover:bg-accent'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                    </svg>
                    JSON
                  </div>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
