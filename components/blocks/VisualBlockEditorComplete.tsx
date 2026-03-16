'use client';

import { useEffect, useState, useRef } from 'react';
import { Block } from '@/types/blocks';
import { Breakpoint } from '@/types/responsive';
import { VisualBlockEditorEnhanced } from './VisualBlockEditorEnhanced';
import { BlockEditorProvider, useBlockEditor } from '@/contexts/BlockEditorContext';
import { useKeyboardShortcuts } from '@/lib/hooks/useKeyboardShortcuts';
import { KeyboardShortcutReference } from '@/components/ui/KeyboardShortcutReference';
import { parseRichContentWithWarnings } from '@/lib/utils/richPaste';
import { TextBlockRender } from './render/TextBlockRender';
import { HeadingBlockRender } from './render/HeadingBlockRender';
import { ImageBlockRender } from './render/ImageBlockRender';
import { QuoteBlockRender } from './render/QuoteBlockRender';
import { CodeBlockRender } from './render/CodeBlockRender';
import { VideoBlockRender } from './render/VideoBlockRender';
import { YoutubeBlockRender } from './render/YoutubeBlockRender';
import { ColumnsBlockRender } from './render/ColumnsBlockRender';
import { ButtonBlockRender } from './render/ButtonBlockRender';
import { SpacerBlockRender } from './render/SpacerBlockRender';
import { DividerBlockRender } from './render/DividerBlockRender';

interface VisualBlockEditorCompleteProps {
  blocks: Block[];
  onChange: (blocks: Block[]) => void;
  onSave?: () => void;
  initialViewport?: Breakpoint;
  onViewportChange?: (viewport: Breakpoint) => void;
  onEditorStateChange?: (state: {
    canUndo: boolean;
    canRedo: boolean;
    isPreviewMode: boolean;
  }) => void;
  onUndoClick?: () => void;
  onRedoClick?: () => void;
  onTogglePreview?: () => void;
}

// Inner component with full keyboard shortcuts
function EditorWithShortcuts({
  onChange,
  onSave,
}: {
  onChange: (blocks: Block[]) => void;
  onSave?: () => void;
}) {
  const {
    state,
    undo,
    redo,
    duplicateBlock,
    deleteBlock,
    reorderBlocks,
    selectBlock,
    toggleKeyboardReference,
    togglePreviewMode,
    addBlock,
  } = useBlockEditor();

  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [pasteWarning, setPasteWarning] = useState<string | null>(null);

  // Sync selected block with context
  useEffect(() => {
    if (selectedBlockId !== state.selectedBlockId) {
      selectBlock(selectedBlockId);
    }
  }, [selectedBlockId, state.selectedBlockId, selectBlock]);

  // Find selected block index
  const selectedBlockIndex = state.blocks.findIndex(
    (b) => b.id === state.selectedBlockId
  );

  // Handle paste events
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      // Only handle paste if editor is focused
      const target = e.target as HTMLElement;
      if (!target.closest('[data-block-editor]')) {
        return;
      }

      // Try to get HTML from clipboard
      const html = e.clipboardData?.getData('text/html');
      if (!html || html.trim().length === 0) {
        return;
      }

      // Parse rich content
      const { blocks: pastedBlocks, warnings } = parseRichContentWithWarnings(html);

      if (pastedBlocks.length === 0) {
        return;
      }

      // Show warnings if any
      if (warnings.length > 0) {
        setPasteWarning(warnings.join('. '));
        setTimeout(() => setPasteWarning(null), 5000);
      }

      // Insert blocks after selected block or at end
      const insertIndex = selectedBlockIndex >= 0 ? selectedBlockIndex + 1 : state.blocks.length;

      // Update order values
      const blocksWithOrder = pastedBlocks.map((block, idx) => ({
        ...block,
        order: insertIndex + idx,
      }));

      // Insert new blocks
      const newBlocks = [
        ...state.blocks.slice(0, insertIndex),
        ...blocksWithOrder,
        ...state.blocks.slice(insertIndex).map(b => ({ ...b, order: b.order + blocksWithOrder.length })),
      ];

      // Update blocks with history
      addBlock(blocksWithOrder[0], insertIndex);
      if (blocksWithOrder.length > 1) {
        // Add remaining blocks
        blocksWithOrder.slice(1).forEach((block, idx) => {
          addBlock(block, insertIndex + idx + 1);
        });
      }

      // Prevent default paste behavior
      e.preventDefault();
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [state.blocks, selectedBlockIndex, addBlock]);

  // Register all keyboard shortcuts
  useKeyboardShortcuts(
    [
      // Editing
      {
        keys: 'mod+z',
        description: 'Undo',
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
        description: 'Redo',
        handler: () => {
          if (state.canRedo) {
            redo();
          }
          return false;
        },
        preventDefault: true,
      },
      {
        keys: 'mod+s',
        description: 'Save',
        handler: () => {
          if (onSave) {
            onSave();
          }
          return false;
        },
        preventDefault: true,
      },

      // Block operations
      {
        keys: 'mod+enter',
        description: 'Add new block',
        handler: () => {
          // Add a new text block after the selected block
          const newBlock: Block = {
            id: `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type: 'text',
            content: '',
            order: state.blocks.length,
            alignment: 'left',
            size: 'base',
          };
          addBlock(newBlock, selectedBlockIndex + 1);
          return false;
        },
        preventDefault: true,
      },
      {
        keys: 'mod+d',
        description: 'Duplicate block',
        handler: () => {
          if (state.selectedBlockId) {
            duplicateBlock(state.selectedBlockId);
          }
          return false;
        },
        preventDefault: true,
      },
      {
        keys: 'mod+backspace',
        description: 'Delete block',
        handler: () => {
          if (state.selectedBlockId && state.blocks.length > 1) {
            if (confirm('Delete this block?')) {
              deleteBlock(state.selectedBlockId);
            }
          }
          return false;
        },
        preventDefault: true,
      },
      {
        keys: 'mod+shift+up',
        description: 'Move block up',
        handler: () => {
          if (selectedBlockIndex > 0) {
            reorderBlocks(selectedBlockIndex, selectedBlockIndex - 1);
          }
          return false;
        },
        preventDefault: true,
      },
      {
        keys: 'mod+shift+down',
        description: 'Move block down',
        handler: () => {
          if (
            selectedBlockIndex !== -1 &&
            selectedBlockIndex < state.blocks.length - 1
          ) {
            reorderBlocks(selectedBlockIndex, selectedBlockIndex + 1);
          }
          return false;
        },
        preventDefault: true,
      },

      // Navigation
      {
        keys: 'up',
        description: 'Select previous block',
        handler: () => {
          if (selectedBlockIndex > 0) {
            selectBlock(state.blocks[selectedBlockIndex - 1].id);
          }
          return false;
        },
        preventDefault: false,
      },
      {
        keys: 'down',
        description: 'Select next block',
        handler: () => {
          if (
            selectedBlockIndex !== -1 &&
            selectedBlockIndex < state.blocks.length - 1
          ) {
            selectBlock(state.blocks[selectedBlockIndex + 1].id);
          }
          return false;
        },
        preventDefault: false,
      },
      {
        keys: 'esc',
        description: 'Deselect block',
        handler: () => {
          selectBlock(null);
          return false;
        },
        preventDefault: false,
      },

      // System
      {
        keys: '?',
        description: 'Show shortcuts',
        handler: () => {
          toggleKeyboardReference(true);
          return false;
        },
        preventDefault: true,
      },
      {
        keys: 'mod+shift+p',
        description: 'Toggle preview',
        handler: () => {
          togglePreviewMode();
          return false;
        },
        preventDefault: true,
      },
    ],
    [
      undo,
      redo,
      onSave,
      state.canUndo,
      state.canRedo,
      state.selectedBlockId,
      state.blocks,
      selectedBlockIndex,
      duplicateBlock,
      deleteBlock,
      reorderBlocks,
      selectBlock,
      toggleKeyboardReference,
      togglePreviewMode,
      addBlock,
    ]
  );

  // Sync blocks to parent only when they actually change
  // Use a ref to track if this is the initial render
  const initialRenderRef = useRef(true);
  const previousBlocksRef = useRef(state.blocks);

  useEffect(() => {
    // Skip on initial render to avoid overwriting parent's initial state
    if (initialRenderRef.current) {
      initialRenderRef.current = false;
      previousBlocksRef.current = state.blocks;
      console.log('[VisualBlockEditorComplete] Initial render, blocks:', state.blocks.length);
      return;
    }

    // Only call onChange if blocks actually changed (by reference)
    if (previousBlocksRef.current !== state.blocks) {
      console.log('[VisualBlockEditorComplete] Blocks changed, calling onChange with', state.blocks.length, 'blocks');
      console.log('[VisualBlockEditorComplete] onChange function:', onChange);
      onChange(state.blocks);
      previousBlocksRef.current = state.blocks;
    }
  }, [state.blocks, onChange]);

  // Render block in preview mode
  const renderBlockPreview = (block: Block) => {
    switch (block.type) {
      case 'text':
        return <TextBlockRender block={block} />;
      case 'heading':
        return <HeadingBlockRender block={block} />;
      case 'image':
        return <ImageBlockRender block={block} />;
      case 'quote':
        return <QuoteBlockRender block={block} />;
      case 'code':
        return <CodeBlockRender block={block} />;
      case 'video':
        return <VideoBlockRender block={block} />;
      case 'youtube':
        return <YoutubeBlockRender block={block} />;
      case 'columns':
        return <ColumnsBlockRender block={block} />;
      case 'button':
        return <ButtonBlockRender block={block} />;
      case 'spacer':
        return <SpacerBlockRender block={block} />;
      case 'divider':
        return <DividerBlockRender block={block} />;
      default:
        return <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded">Unsupported block type: {block.type}</div>;
    }
  };

  return (
    <div className="relative" data-block-editor>
      {/* Conditional Rendering: Preview or Edit */}
      {state.previewMode ? (
        <div className="preview-mode bg-background p-8">
          <div className="max-w-4xl mx-auto space-y-4">
            {(() => { console.log('[Preview] Rendering', state.blocks.length, 'blocks:', state.blocks); return null; })()}
            {state.blocks.map((block, index) => (
              <div
                key={block.id}
                className="relative group"
                onMouseEnter={() => selectBlock(block.id)}
                onMouseLeave={() => selectBlock(null)}
              >
                {/* Preview Content */}
                <div className="block-preview">
                  {renderBlockPreview(block)}
                </div>

                {/* Hover Overlay with Edit Button */}
                {state.selectedBlockId === block.id && (
                  <div className="absolute inset-0 bg-primary/5 border-2 border-primary rounded-lg pointer-events-none">
                    <button
                      type="button"
                      onClick={() => {
                        togglePreviewMode();
                        selectBlock(block.id);
                      }}
                      className="absolute top-2 right-2 pointer-events-auto px-3 py-1.5 bg-primary text-primary-foreground rounded shadow-lg hover:bg-primary/90 transition-colors text-sm font-medium flex items-center gap-1"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Edit
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <VisualBlockEditorEnhanced
          blocks={state.blocks}
          onChange={(updatedBlocks) => {
            // VisualBlockEditorEnhanced syncs state.blocks here
            // We need to propagate this to the parent component
            console.log('[VisualBlockEditorComplete] VisualBlockEditorEnhanced onChange called with', updatedBlocks.length, 'blocks - calling parent onChange');
            onChange(updatedBlocks);
          }}
        />
      )}

      {/* Paste Warning */}
      {pasteWarning && (
        <div className="fixed top-4 right-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg shadow-lg px-4 py-3 max-w-md">
          <div className="flex items-start gap-2">
            <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <h4 className="text-sm font-semibold text-yellow-800 dark:text-yellow-200">Paste Warning</h4>
              <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">{pasteWarning}</p>
            </div>
            <button
              type="button"
              onClick={() => setPasteWarning(null)}
              className="ml-auto text-yellow-600 dark:text-yellow-500 hover:text-yellow-800 dark:hover:text-yellow-300"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Keyboard Shortcuts Reference Modal */}
      <KeyboardShortcutReference
        isOpen={state.showKeyboardReference}
        onClose={() => toggleKeyboardReference(false)}
      />

      {/* Save Status Indicator */}
      {state.saveStatus !== 'idle' && (
        <div className="fixed bottom-4 right-4 bg-card border border-border rounded-lg shadow-lg px-4 py-2 flex items-center gap-2">
          {state.saveStatus === 'saving' && (
            <>
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-foreground">Saving...</span>
            </>
          )}
          {state.saveStatus === 'saved' && (
            <>
              <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-sm text-green-600 dark:text-green-400">Saved</span>
            </>
          )}
          {state.saveStatus === 'error' && (
            <>
              <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span className="text-sm text-red-600 dark:text-red-400">Error saving</span>
              {onSave && (
                <button
                  type="button"
                  onClick={onSave}
                  className="text-xs px-2 py-1 bg-primary text-primary-foreground rounded hover:bg-primary/90"
                >
                  Retry
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Complete block editor with all features:
 * - Undo/redo (50-action history)
 * - Drag-and-drop block reordering
 * - Comprehensive keyboard shortcuts
 * - Keyboard shortcuts reference modal
 * - Rich content paste (Word, Google Docs, websites)
 * - Preview mode toggle (Cmd+Shift+P)
 * - Save status indicator
 *
 * @example
 * ```tsx
 * <VisualBlockEditorComplete
 *   blocks={blocks}
 *   onChange={(blocks) => setBlocks(blocks)}
 *   onSave={async () => {
 *     await saveToDatabase(blocks);
 *   }}
 * />
 * ```
 */
export function VisualBlockEditorComplete({
  blocks,
  onChange,
  onSave,
  initialViewport,
  onViewportChange,
}: VisualBlockEditorCompleteProps) {
  return (
    <BlockEditorProvider
      initialBlocks={blocks}
      onBlocksChange={onChange}
      initialViewport={initialViewport}
      onViewportChange={onViewportChange}
    >
      <EditorWithShortcuts onChange={onChange} onSave={onSave} />
    </BlockEditorProvider>
  );
}
