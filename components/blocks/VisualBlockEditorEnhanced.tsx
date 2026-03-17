'use client';

import { useEffect, useState, useRef } from 'react';
import { Block, BlockType } from '@/types/blocks';
import { VisualBlockPreview } from './visual/VisualBlockPreview';
import { BlockSettings } from './visual/BlockSettings';
import { BlockEditorProvider, useBlockEditor } from '@/contexts/BlockEditorContext';
import { useKeyboardShortcuts } from '@/lib/hooks/useKeyboardShortcuts';
import { Breakpoint } from '@/types/responsive';
import { getViewportWidth } from '@/lib/utils/responsive';
import { ResponsiveIndicator } from './ResponsiveIndicator';
import { ResponsiveHelpButton } from './ResponsiveHelpModal';
import { SaveAsTemplateModal } from './SaveAsTemplateModal';
import { TemplateLibrary } from './TemplateLibrary';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface VisualBlockEditorEnhancedProps {
  blocks: Block[];
  onChange: (blocks: Block[]) => void;
  initialViewport?: Breakpoint;
  onViewportChange?: (viewport: Breakpoint) => void;
}

// Sortable block wrapper component
function SortableBlock({
  block,
  isSelected,
  isHovered,
  hasNestedSelection,
  selectedBlockId,
  index,
  totalBlocks,
  onSelect,
  onHover,
  onUpdate,
  onDelete,
  onMove,
  onDuplicate,
  onInsertAfter,
  onSaveAsTemplate,
  blockTypes,
}: {
  block: Block;
  isSelected: boolean;
  isHovered: boolean;
  hasNestedSelection: boolean;
  selectedBlockId: string | null;
  index: number;
  totalBlocks: number;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
  onUpdate: (id: string, updates: Partial<Block>) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, direction: 'up' | 'down') => void;
  onDuplicate: (id: string) => void;
  onInsertAfter: (id: string) => void;
  onSaveAsTemplate: (block: Block) => void;
  blockTypes: Array<{ type: BlockType; label: string }>;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group relative"
      onMouseEnter={() => onHover(block.id)}
      onMouseLeave={() => onHover(null)}
    >
      {/* Block Toolbar */}
      {(isSelected || isHovered) && (
        <div className="absolute -top-10 left-0 right-0 flex items-center justify-between gap-2 bg-card border border-border rounded-t-lg px-3 py-2 shadow-lg z-10">
          <div className="flex items-center gap-2">
            {/* Drag Handle */}
            <button
              {...attributes}
              {...listeners}
              type="button"
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded cursor-grab active:cursor-grabbing"
              title="Drag to reorder"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <span className="text-xs font-medium text-muted-foreground">
              {blockTypes.find((bt) => bt.type === block.type)?.label || block.type}
            </span>
            {hasNestedSelection && !isSelected && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(block.id);
                }}
                className="ml-1 px-2 py-0.5 text-xs bg-accent hover:bg-accent/80 rounded transition-colors"
                title="Select container"
              >
                Select container
              </button>
            )}
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onMove(block.id, 'up')}
              disabled={index === 0}
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded disabled:opacity-30 disabled:cursor-not-allowed"
              title="Move up"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => onMove(block.id, 'down')}
              disabled={index === totalBlocks - 1}
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded disabled:opacity-30 disabled:cursor-not-allowed"
              title="Move down"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <div className="w-px h-4 bg-border mx-1" />
            <button
              type="button"
              onClick={() => onDuplicate(block.id)}
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded"
              title="Duplicate"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => onSaveAsTemplate(block)}
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded"
              title="Save as template"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => onDelete(block.id)}
              className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
              title="Delete"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Block Content */}
      <div
        onClick={(e) => {
          // For container blocks, nested block clicks are stopped by e.stopPropagation().
          // This handler fires for clicks on empty container space.
          onSelect(block.id);
        }}
        className={`rounded-lg transition-all cursor-pointer relative ${
          isSelected
            ? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
            : hasNestedSelection
            ? 'ring-2 ring-primary/40 ring-offset-2 ring-offset-background'
            : isHovered
            ? 'ring-2 ring-border'
            : ''
        }`}
      >
        <ResponsiveIndicator block={block} />
        <VisualBlockPreview
          block={block}
          isSelected={isSelected || hasNestedSelection}
          onChange={(updates) => onUpdate(block.id, updates)}
          selectedBlockId={selectedBlockId}
          onSelectBlock={onSelect}
        />
      </div>

      {/* Insert Block Button */}
      <div className="flex items-center justify-center py-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={() => onInsertAfter(block.id)}
          className="p-1 bg-primary text-primary-foreground rounded-full hover:bg-primary/90 shadow-md"
          title="Insert block below"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// Inner editor component (exported for use with external provider)
export function EditorInner({
  onChange,
  blockTypes,
}: {
  onChange: (blocks: Block[]) => void;
  blockTypes: Array<{ type: BlockType; label: string; icon: string; category: string; description: string }>;
}) {
  const {
    state,
    undo,
    redo,
    reorderBlocks,
    updateBlock,
    deleteBlock,
    duplicateBlock,
    setBlocks,
    selectBlock,
    isSettingsPoppedOut,
    openSettingsPopOut,
    currentViewport,
    setCurrentViewport,
  } = useBlockEditor();
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);

  // Sync local selectedBlockId with context
  useEffect(() => {
    selectBlock(selectedBlockId);
  }, [selectedBlockId, selectBlock]);
  const [hoveredBlockId, setHoveredBlockId] = useState<string | null>(null);
  const [showBlockInserter, setShowBlockInserter] = useState(false);
  const [showTemplateLibrary, setShowTemplateLibrary] = useState(false);
  const [saveTemplateBlock, setSaveTemplateBlock] = useState<Block | null>(null);
  const [insertAfterBlockId, setInsertAfterBlockId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  // Configure drag sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Keyboard shortcuts
  useKeyboardShortcuts(
    [
      {
        keys: 'mod+z',
        description: 'Undo',
        handler: () => {
          if (state.canUndo) undo();
          return false;
        },
      },
      {
        keys: 'mod+shift+z',
        description: 'Redo',
        handler: () => {
          if (state.canRedo) redo();
          return false;
        },
      },
      {
        keys: 'mod+d',
        description: 'Duplicate block',
        handler: () => {
          if (selectedBlockId) duplicateBlock(selectedBlockId);
          return false;
        },
      },
      {
        keys: 'mod+enter',
        description: 'Insert block after selected',
        handler: () => {
          if (selectedBlockId) {
            setInsertAfterBlockId(selectedBlockId);
            setShowBlockInserter(true);
          }
          return false;
        },
      },
      {
        keys: 'mod+shift+up',
        description: 'Move block up',
        handler: () => {
          if (selectedBlockId) {
            const idx = state.blocks.findIndex(b => b.id === selectedBlockId);
            if (idx > 0) reorderBlocks(idx, idx - 1);
          }
          return false;
        },
      },
      {
        keys: 'mod+shift+down',
        description: 'Move block down',
        handler: () => {
          if (selectedBlockId) {
            const idx = state.blocks.findIndex(b => b.id === selectedBlockId);
            if (idx >= 0 && idx < state.blocks.length - 1) reorderBlocks(idx, idx + 1);
          }
          return false;
        },
      },
    ],
    [undo, redo, state.canUndo, state.canRedo, selectedBlockId, duplicateBlock, reorderBlocks, state.blocks]
  );

  // Sync blocks to parent
  useEffect(() => {
    onChange(state.blocks);
  }, [state.blocks, onChange]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = state.blocks.findIndex((b) => b.id === active.id);
      const newIndex = state.blocks.findIndex((b) => b.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        reorderBlocks(oldIndex, newIndex);
      }
    }

    setActiveId(null);
  };

  const moveBlock = (id: string, direction: 'up' | 'down') => {
    const index = state.blocks.findIndex((b) => b.id === id);
    if (index === -1) return;

    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= state.blocks.length) return;

    reorderBlocks(index, newIndex);
  };

  const addBlock = (type: BlockType, afterBlockId: string | null = null) => {
    const newBlock = createDefaultBlock(type, state.blocks.length);
    let tempBlocks = [...state.blocks];

    if (afterBlockId) {
      const index = tempBlocks.findIndex((b) => b.id === afterBlockId);
      tempBlocks.splice(index + 1, 0, newBlock);
    } else {
      tempBlocks.push(newBlock);
    }

    // Update order - create new objects to avoid mutating frozen objects
    const newBlocks = tempBlocks.map((b, i) => ({
      ...b,
      order: i,
    }));

    setBlocks(newBlocks);
    setSelectedBlockId(newBlock.id);
    setShowBlockInserter(false);
    setInsertAfterBlockId(null);
  };

  // Helper function to recursively find a block (including nested blocks)
  const findBlock = (blockId: string, blocksList: Block[] = state.blocks): Block | null => {
    for (const block of blocksList) {
      if (block.id === blockId) return block;

      // Check nested blocks in columns
      if (block.type === 'columns') {
        for (const column of block.columns) {
          const found = findBlock(blockId, column.blocks);
          if (found) return found;
        }
      }

      // Check nested blocks in tabs
      if (block.type === 'tabs') {
        for (const tab of block.tabs) {
          const found = findBlock(blockId, tab.blocks);
          if (found) return found;
        }
      }
    }
    return null;
  };

  // Check if a nested block within a container is selected
  const isNestedBlockSelected = (containerBlock: Block): boolean => {
    if (!selectedBlockId) return false;
    if (selectedBlockId === containerBlock.id) return false;

    if (containerBlock.type === 'columns') {
      return containerBlock.columns.some(col =>
        col.blocks.some(b => b.id === selectedBlockId || isNestedBlockSelected(b))
      );
    }
    if (containerBlock.type === 'tabs') {
      return containerBlock.tabs.some(tab =>
        tab.blocks.some(b => b.id === selectedBlockId || isNestedBlockSelected(b))
      );
    }
    return false;
  };

  const categories = Array.from(new Set(blockTypes.map((bt) => bt.category)));
  const selectedBlock = selectedBlockId ? findBlock(selectedBlockId) : null;
  const activeBlock = state.blocks.find((b) => b.id === activeId);

  return (
    <div className="relative">
      {/* Editor */}
      <div className="relative flex gap-0" ref={editorRef}>
        {/* Responsive Preview Container */}
        <div className={`flex-1 min-h-[500px] flex transition-all ${
          currentViewport === 'desktop' ? '' : 'justify-center'
        } ${selectedBlock && !isSettingsPoppedOut ? 'mr-80' : ''}`}>
          <div
            className={`bg-background transition-all duration-300 ease-in-out ${
              currentViewport === 'desktop' ? 'w-full' : 'shadow-sm'
            }`}
            style={{
              width: currentViewport === 'desktop' ? '100%' : `${getViewportWidth(currentViewport)}px`,
              maxWidth: '100%',
            }}
          >
          {state.blocks.length === 0 ? (
            <div className="p-16 text-center">
              <div className="mb-6">
                <span className="text-6xl">✍️</span>
              </div>
              <h3 className="text-xl font-semibold mb-2">Start creating content</h3>
              <p className="text-muted-foreground mb-6">Add your first block to begin</p>
              <button
                type="button"
                onClick={() => setShowBlockInserter(true)}
                className="px-6 py-3 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 font-medium"
              >
                + Add Block
              </button>
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
              <SortableContext items={state.blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
                <div className="p-8 space-y-2">
                  {state.blocks.map((block, index) => (
                    <SortableBlock
                      key={block.id}
                      block={block}
                      isSelected={selectedBlockId === block.id}
                      isHovered={hoveredBlockId === block.id}
                      hasNestedSelection={isNestedBlockSelected(block)}
                      selectedBlockId={selectedBlockId}
                      index={index}
                      totalBlocks={state.blocks.length}
                      onSelect={setSelectedBlockId}
                      onHover={setHoveredBlockId}
                      onUpdate={updateBlock}
                      onDelete={deleteBlock}
                      onMove={moveBlock}
                      onDuplicate={duplicateBlock}
                      onInsertAfter={(id) => {
                        setInsertAfterBlockId(id);
                        setShowBlockInserter(true);
                      }}
                      onSaveAsTemplate={(block) => setSaveTemplateBlock(block)}
                      blockTypes={blockTypes}
                    />
                  ))}
                </div>
              </SortableContext>
              <DragOverlay>
                {activeBlock ? (
                  <div className="bg-card border-2 border-primary rounded-lg p-4 shadow-2xl opacity-90">
                    <div className="text-sm font-medium text-foreground">
                      {blockTypes.find((bt) => bt.type === activeBlock.type)?.label || activeBlock.type}
                    </div>
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          )}
          </div>
        </div>

        {/* Settings Sidebar */}
        {selectedBlock && !isSettingsPoppedOut && (
          <div className="w-80 bg-white dark:bg-gray-900 border-l border-border fixed right-0 top-[120px] bottom-0 z-10 overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">
                  {blockTypes.find((bt) => bt.type === selectedBlock.type)?.label || 'Block'} Settings
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={openSettingsPopOut}
                    className="p-1 text-muted-foreground hover:text-foreground rounded-full hover:bg-accent"
                    title="Pop out settings"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedBlockId(null)}
                    className="p-1 text-muted-foreground hover:text-foreground rounded-full hover:bg-accent"
                    title="Close settings"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
              <BlockSettings block={selectedBlock} onChange={(updates) => updateBlock(selectedBlock.id, updates)} currentViewport={currentViewport} />
            </div>
          </div>
        )}
      </div>

      {/* Block Inserter Modal */}
      {showBlockInserter && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => {
            setShowBlockInserter(false);
            setInsertAfterBlockId(null);
          }}
        >
          <div
            className="bg-white dark:bg-gray-900 border border-border rounded-lg max-w-3xl w-full max-h-[80vh] overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-border bg-white dark:bg-gray-900">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-foreground">Add a Block</h3>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowBlockInserter(false);
                      setInsertAfterBlockId(null);
                      setShowTemplateLibrary(true);
                    }}
                    className="px-3 py-1.5 text-sm font-medium text-primary border border-primary rounded-md hover:bg-primary/10 transition-colors flex items-center gap-1.5"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                    </svg>
                    From Template
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowBlockInserter(false);
                      setInsertAfterBlockId(null);
                    }}
                    className="p-2 text-muted-foreground hover:text-foreground rounded-full hover:bg-accent"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            <div className="overflow-y-auto max-h-[calc(80vh-100px)] bg-white dark:bg-gray-900">
              {categories.map(category => (
                <div key={category} className="p-6 border-b border-border last:border-0 bg-white dark:bg-gray-900">
                  <h4 className="text-sm font-semibold text-muted-foreground uppercase mb-4 tracking-wide">{category}</h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {blockTypes
                      .filter(bt => bt.category === category)
                      .map(blockType => (
                        <button
                          key={blockType.type}
                          type="button"
                          onClick={() => addBlock(blockType.type, insertAfterBlockId)}
                          className="p-4 border border-border rounded-lg hover:border-primary hover:bg-primary/5 transition-all text-left group bg-white dark:bg-gray-900"
                        >
                          <div className="flex items-start gap-3">
                            <div className="text-2xl flex-shrink-0">{blockType.icon}</div>
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-foreground group-hover:text-primary mb-1">
                                {blockType.label}
                              </div>
                              <div className="text-xs text-muted-foreground line-clamp-2">
                                {blockType.description}
                              </div>
                            </div>
                          </div>
                        </button>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Template Library Modal */}
      {showTemplateLibrary && (
        <TemplateLibrary
          onInsert={(templateBlocks) => {
            // Insert template blocks into the editor
            const newBlocks = [...state.blocks];
            const insertIndex = insertAfterBlockId
              ? newBlocks.findIndex((b) => b.id === insertAfterBlockId) + 1
              : newBlocks.length;

            // Update order for inserted blocks
            const updatedBlocks = [
              ...newBlocks.slice(0, insertIndex),
              ...templateBlocks.map((b, i) => ({ ...b, order: insertIndex + i })),
              ...newBlocks.slice(insertIndex).map((b, i) => ({ ...b, order: insertIndex + templateBlocks.length + i })),
            ];

            setBlocks(updatedBlocks);
            setInsertAfterBlockId(null);
            if (templateBlocks.length === 1) {
              setSelectedBlockId(templateBlocks[0].id);
            }
          }}
          onClose={() => {
            setShowTemplateLibrary(false);
            setInsertAfterBlockId(null);
          }}
        />
      )}

      {/* Save As Template Modal */}
      {saveTemplateBlock && (
        <SaveAsTemplateModal
          blocks={[saveTemplateBlock]}
          onClose={() => setSaveTemplateBlock(null)}
        />
      )}
    </div>
  );
}

// Main export with provider
export function VisualBlockEditorEnhanced({ blocks, onChange, initialViewport, onViewportChange }: VisualBlockEditorEnhancedProps) {
  const blockTypes: Array<{ type: BlockType; label: string; icon: string; category: string; description: string }> = [
    { type: 'heading', label: 'Heading', icon: '📝', category: 'Basic', description: 'Add a title or heading' },
    { type: 'text', label: 'Paragraph', icon: '📄', category: 'Basic', description: 'Start with plain text' },
    { type: 'button', label: 'Button', icon: '🔘', category: 'Basic', description: 'Add a call-to-action button' },
    { type: 'quote', label: 'Quote', icon: '💬', category: 'Basic', description: 'Add a quotation' },
    { type: 'image', label: 'Image', icon: '🖼️', category: 'Media', description: 'Insert an image' },
    { type: 'youtube', label: 'YouTube', icon: '📺', category: 'Media', description: 'Embed a YouTube video' },
    { type: 'video', label: 'Video', icon: '🎬', category: 'Media', description: 'Embed a video file' },
    { type: 'code', label: 'Code', icon: '💻', category: 'Media', description: 'Display code snippet' },
    { type: 'spacer', label: 'Spacer', icon: '↕️', category: 'Layout', description: 'Add vertical space' },
    { type: 'divider', label: 'Divider', icon: '➖', category: 'Layout', description: 'Add a horizontal line' },
    { type: 'columns', label: 'Columns', icon: '📊', category: 'Layout', description: 'Display content in columns' },
    { type: 'accordion', label: 'Accordion', icon: '📑', category: 'Layout', description: 'Collapsible content sections' },
    { type: 'tabs', label: 'Tabs', icon: '🗂️', category: 'Layout', description: 'Tabbed content sections' },
    { type: 'hero', label: 'Hero', icon: '🎯', category: 'Components', description: 'Hero section with CTA' },
    { type: 'services-grid', label: 'Services', icon: '📦', category: 'Components', description: 'Grid of services' },
    { type: 'cta', label: 'Call to Action', icon: '📢', category: 'Components', description: 'CTA section' },
    { type: 'card-grid', label: 'Card Grid', icon: '🎴', category: 'Components', description: 'Grid of cards' },
    { type: 'stats', label: 'Stats', icon: '📈', category: 'Components', description: 'Statistics display' },
    { type: 'testimonial', label: 'Testimonial', icon: '⭐', category: 'Components', description: 'Customer testimonial' },
    { type: 'featured-content', label: 'Featured Content', icon: '✨', category: 'Components', description: 'Featured content with image' },
    { type: 'blog-posts', label: 'Blog Posts', icon: '📰', category: 'Components', description: 'Display blog posts' },
  ];

  return (
    <BlockEditorProvider
      initialBlocks={blocks}
      onBlocksChange={onChange}
      initialViewport={initialViewport}
      onViewportChange={onViewportChange}
    >
      <EditorInner onChange={onChange} blockTypes={blockTypes} />
    </BlockEditorProvider>
  );
}

function createDefaultBlock(type: BlockType, order: number): Block {
  const id = `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const base = { id, order, type };

  switch (type) {
    case 'text':
      return { ...base, type: 'text', content: 'Start writing or type / to insert a block...', alignment: 'left', size: 'base' };
    case 'heading':
      return { ...base, type: 'heading', content: 'Write your heading...', level: 2, alignment: 'left' };
    case 'image':
      return { ...base, type: 'image', url: '', alt: '', width: 'full', alignment: 'center' };
    case 'button':
      return { ...base, type: 'button', text: 'Click me', url: '', variant: 'primary', size: 'md', alignment: 'left' };
    case 'quote':
      return { ...base, type: 'quote', content: 'Add a memorable quote...', author: '', citation: '' };
    case 'code':
      return { ...base, type: 'code', code: '// Enter your code here...', language: 'javascript' };
    case 'video':
      return { ...base, type: 'video', url: '', caption: '', autoplay: false, controls: true };
    case 'youtube':
      return { ...base, type: 'youtube', url: '', caption: '' };
    case 'spacer':
      return { ...base, type: 'spacer', height: 'md' };
    case 'divider':
      return { ...base, type: 'divider', lineStyle: 'solid' };
    case 'columns':
      return { ...base, type: 'columns', columns: [
        { id: `col-${Date.now()}-1`, width: 50, blocks: [] },
        { id: `col-${Date.now()}-2`, width: 50, blocks: [] }
      ], gap: 'md' };
    case 'accordion':
      return { ...base, type: 'accordion', title: 'Frequently Asked Questions', items: [
        { id: `item-${Date.now()}-1`, title: 'First question?', content: 'Answer to the first question.' },
        { id: `item-${Date.now()}-2`, title: 'Second question?', content: 'Answer to the second question.' }
      ]};
    case 'tabs':
      return { ...base, type: 'tabs', tabs: [
        { id: `tab-${Date.now()}-1`, label: 'Tab 1', blocks: [] },
        { id: `tab-${Date.now()}-2`, label: 'Tab 2', blocks: [] }
      ]};
    case 'hero':
      return { ...base, type: 'hero', title: 'Hero Title', subtitle: 'Subtitle', description: 'Description', ctaText: 'Get Started', ctaLink: '/contact' };
    case 'services-grid':
      return { ...base, type: 'services-grid', title: 'Our Services', services: [], columns: 3 };
    case 'cta':
      return { ...base, type: 'cta', title: 'Ready to get started?', description: 'Join thousands of satisfied customers', primaryButtonText: 'Get Started', primaryButtonUrl: '/contact', backgroundStyle: 'gradient' };
    case 'card-grid':
      return { ...base, type: 'card-grid', title: 'Features', cards: [], columns: 3 };
    case 'stats':
      return { ...base, type: 'stats', title: 'By the numbers', stats: [], columns: 3 };
    case 'testimonial':
      return { ...base, type: 'testimonial', quote: 'This is an amazing product!', author: 'John Doe', role: 'CEO', company: 'Company Inc' };
    case 'featured-content':
      return { ...base, type: 'featured-content', title: 'Featured Content', description: 'Description of the featured content', imagePosition: 'right', buttonText: 'Learn More', buttonUrl: '/learn-more' };
    case 'blog-posts':
      return { ...base, type: 'blog-posts', title: 'Latest Posts', limit: 3, columns: 3, showExcerpt: true };
    default:
      return { ...base, type: 'text', content: 'Unknown block type', alignment: 'left', size: 'base' };
  }
}
