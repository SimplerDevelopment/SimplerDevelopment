'use client';

import { useEffect } from 'react';
import { Block } from '@/types/blocks';
import { VisualBlockEditor } from './VisualBlockEditor';
import { BlockEditorProvider, useBlockEditor } from '@/contexts/BlockEditorContext';
import { useKeyboardShortcuts } from '@/lib/hooks/useKeyboardShortcuts';

interface VisualBlockEditorWithHistoryProps {
  blocks: Block[];
  onChange: (blocks: Block[]) => void;
}

// Inner component that uses the context
function EditorWithToolbar({ onChange }: { onChange: (blocks: Block[]) => void }) {
  const { state, undo, redo, setBlocks } = useBlockEditor();

  // Register keyboard shortcuts
  useKeyboardShortcuts([
    {
      keys: 'mod+z',
      description: 'Undo last action',
      handler: () => {
        if (state.canUndo) {
          undo();
        }
        return false;
      },
      preventDefault: true,
    },
    {
      keys: 'mod+shift+z',
      description: 'Redo last action',
      handler: () => {
        if (state.canRedo) {
          redo();
        }
        return false;
      },
      preventDefault: true,
    },
  ], [undo, redo, state.canUndo, state.canRedo]);

  // Sync blocks to parent onChange
  useEffect(() => {
    onChange(state.blocks);
  }, [state.blocks, onChange]);

  const handleEditorChange = (blocks: Block[]) => {
    // Update blocks through context (which handles history)
    setBlocks(blocks);
  };

  return (
    <div className="relative">
      {/* Undo/Redo Toolbar */}
      <div className="sticky top-0 z-20 bg-background border-b border-border px-4 py-2 flex items-center gap-2">
        <button
          type="button"
          onClick={undo}
          disabled={!state.canUndo}
          className="flex items-center gap-2 px-3 py-1.5 text-sm rounded border border-border hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title="Undo (Cmd+Z)"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
          </svg>
          <span className="font-medium">Undo</span>
        </button>
        <button
          type="button"
          onClick={redo}
          disabled={!state.canRedo}
          className="flex items-center gap-2 px-3 py-1.5 text-sm rounded border border-border hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title="Redo (Cmd+Shift+Z)"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" />
          </svg>
          <span className="font-medium">Redo</span>
        </button>
        <div className="flex-1" />
        {(state.canUndo || state.canRedo) && (
          <div className="text-xs text-muted-foreground flex items-center gap-4">
            <span>Use Cmd+Z to undo, Cmd+Shift+Z to redo</span>
          </div>
        )}
      </div>

      {/* Editor */}
      <VisualBlockEditor
        blocks={state.blocks}
        onChange={handleEditorChange}
      />
    </div>
  );
}

/**
 * VisualBlockEditor with undo/redo functionality
 *
 * This wraps the existing VisualBlockEditor with BlockEditorProvider
 * to add history management and undo/redo capabilities.
 *
 * @example
 * ```tsx
 * <VisualBlockEditorWithHistory
 *   blocks={blocks}
 *   onChange={(blocks) => setBlocks(blocks)}
 * />
 * ```
 */
export function VisualBlockEditorWithHistory({
  blocks,
  onChange,
}: VisualBlockEditorWithHistoryProps) {
  return (
    <BlockEditorProvider initialBlocks={blocks} onBlocksChange={onChange}>
      <EditorWithToolbar onChange={onChange} />
    </BlockEditorProvider>
  );
}
