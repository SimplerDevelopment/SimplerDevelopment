'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ColumnsBlock, Block, BlockType } from '@/types/blocks';
import { VisualBlockPreview } from './VisualBlockPreview';
import { TokenColorPicker } from './TokenColorPicker';
import { useBlockEditor } from '@/contexts/BlockEditorContext';

/** Parse numeric width from number or string ("50%") format */
function parseColWidth(w: number | string): number {
  return typeof w === 'string' ? parseFloat(w) || 50 : w;
}

/** Normalize column widths: scale proportionally if they sum > 100% */
function normalizeColWidths(columns: { width: number | string }[]): number[] {
  const raw = columns.map(c => parseColWidth(c.width));
  const total = raw.reduce((s, w) => s + w, 0);
  return total > 100 ? raw.map(w => (w / total) * 100) : raw;
}

interface ColumnsBlockPreviewProps {
  block: ColumnsBlock;
  isSelected: boolean;
  onChange: (updates: Partial<ColumnsBlock>) => void;
  selectedBlockId?: string | null;
  onSelectBlock?: (id: string | null) => void;
}

export function ColumnsBlockPreview({ block, isSelected, onChange, selectedBlockId, onSelectBlock }: ColumnsBlockPreviewProps) {
  const { currentViewport } = useBlockEditor();
  const [selectedColumnId, setSelectedColumnId] = useState<string | null>(null);
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [showBlockInserter, setShowBlockInserter] = useState(false);
  const [insertIntoColumnId, setInsertIntoColumnId] = useState<string | null>(null);
  const [resizing, setResizing] = useState<{ index: number; startX: number; startWidths: number[] } | null>(null);
  const [draggedBlock, setDraggedBlock] = useState<{ columnId: string; blockId: string } | null>(null);
  const [dragOverBlock, setDragOverBlock] = useState<{ columnId: string; blockId: string; position: 'top' | 'bottom' } | null>(null);
  const [draggedColumnId, setDraggedColumnId] = useState<string | null>(null);
  const [dropColumnTarget, setDropColumnTarget] = useState<{ columnId: string; position: 'left' | 'right' } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const gapClasses = {
    sm: 'gap-2',
    md: 'gap-4',
    lg: 'gap-6',
  };

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

  const addColumn = () => {
    if (block.columns.length >= 12) return;

    const newWidth = Math.floor(100 / (block.columns.length + 1));
    const updatedColumns = block.columns.map(col => ({
      ...col,
      width: newWidth,
    }));

    onChange({
      columns: [
        ...updatedColumns,
        {
          id: `col-${Date.now()}`,
          width: newWidth,
          blocks: [],
        },
      ],
    });
  };

  const deleteColumn = (columnId: string) => {
    if (block.columns.length <= 1) return;

    const newColumns = block.columns.filter(col => col.id !== columnId);
    const newWidth = Math.floor(100 / newColumns.length);
    const updatedColumns = newColumns.map(col => ({
      ...col,
      width: newWidth,
    }));

    onChange({ columns: updatedColumns });
    if (selectedColumnId === columnId) {
      setSelectedColumnId(null);
    }
  };

  const copyColumn = (columnId: string) => {
    if (block.columns.length >= 12) return;

    const columnIndex = block.columns.findIndex(col => col.id === columnId);
    const columnToCopy = block.columns[columnIndex];
    if (!columnToCopy) return;

    const newWidth = Math.floor(100 / (block.columns.length + 1));
    const copiedColumn = {
      ...columnToCopy,
      id: `col-${Date.now()}`,
      width: newWidth,
      blocks: columnToCopy.blocks.map(b => ({
        ...b,
        id: `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      })),
    };

    const newColumns = block.columns.map(col => ({
      ...col,
      width: newWidth,
    }));

    // Insert copied column right after the source column
    newColumns.splice(columnIndex + 1, 0, copiedColumn);

    onChange({ columns: newColumns });
  };

  const reorderColumns = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    const newColumns = [...block.columns];
    const [moved] = newColumns.splice(fromIndex, 1);
    newColumns.splice(toIndex, 0, moved);
    onChange({ columns: newColumns });
  };

  const updateColumnSettings = (columnId: string, updates: Partial<typeof block.columns[0]>) => {
    onChange({
      columns: block.columns.map(col =>
        col.id === columnId ? { ...col, ...updates } : col
      ),
    });
  };

  const handleColumnDragStart = (e: React.DragEvent, columnId: string) => {
    e.stopPropagation();
    setDraggedColumnId(columnId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleColumnDragOver = (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!draggedColumnId || draggedColumnId === columnId) return;

    const rect = e.currentTarget.getBoundingClientRect();
    // Use vertical midpoint when stacked, horizontal when side-by-side
    const stackOnMobile = block.stackOnMobile !== false;
    const stackOnTablet = block.stackOnTablet === true;
    const isStacked =
      (currentViewport === 'mobile' && stackOnMobile) ||
      (currentViewport === 'tablet' && stackOnTablet);

    if (isStacked) {
      const midpoint = rect.top + rect.height / 2;
      const position = e.clientY < midpoint ? 'left' : 'right'; // left=above, right=below
      setDropColumnTarget({ columnId, position });
    } else {
      const midpoint = rect.left + rect.width / 2;
      const position = e.clientX < midpoint ? 'left' : 'right';
      setDropColumnTarget({ columnId, position });
    }
  };

  const handleColumnDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!draggedColumnId || !dropColumnTarget) return;

    const fromIndex = block.columns.findIndex(c => c.id === draggedColumnId);
    let toIndex = block.columns.findIndex(c => c.id === dropColumnTarget.columnId);

    if (dropColumnTarget.position === 'right') toIndex++;
    if (fromIndex < toIndex) toIndex--;

    reorderColumns(fromIndex, toIndex);
    setDraggedColumnId(null);
    setDropColumnTarget(null);
  };

  const handleColumnDragEnd = () => {
    setDraggedColumnId(null);
    setDropColumnTarget(null);
  };

  const addBlockToColumn = (columnId: string, blockType: BlockType) => {
    const newBlock = createDefaultBlock(blockType);

    onChange({
      columns: block.columns.map(col =>
        col.id === columnId
          ? { ...col, blocks: [...col.blocks, newBlock] }
          : col
      ),
    });

    setShowBlockInserter(false);
    setInsertIntoColumnId(null);
  };

  const updateColumnBlock = (columnId: string, blockId: string, updates: Partial<Block>) => {
    onChange({
      columns: block.columns.map(col =>
        col.id === columnId
          ? {
              ...col,
              blocks: col.blocks.map((b) => {
                if (b.id === blockId) {
                  const updatedBlock = { ...b, ...updates } as Block;
                  // Ensure block has an ID
                  if (!updatedBlock.id) {
                    updatedBlock.id = blockId || `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                  }
                  return updatedBlock;
                }
                return b;
              }),
            }
          : col
      ),
    });
  };

  const deleteColumnBlock = (columnId: string, blockId: string) => {
    onChange({
      columns: block.columns.map(col =>
        col.id === columnId
          ? { ...col, blocks: col.blocks.filter(b => b.id !== blockId) }
          : col
      ),
    });
  };

  const moveBlockWithinColumn = (columnId: string, fromIndex: number, toIndex: number) => {
    const column = block.columns.find(col => col.id === columnId);
    if (!column) return;

    const newBlocks = [...column.blocks];
    const [movedBlock] = newBlocks.splice(fromIndex, 1);
    newBlocks.splice(toIndex, 0, movedBlock);

    onChange({
      columns: block.columns.map(col =>
        col.id === columnId
          ? { ...col, blocks: newBlocks }
          : col
      ),
    });
  };

  const handleDragStart = (e: React.DragEvent, columnId: string, blockId: string) => {
    e.stopPropagation();
    setDraggedBlock({ columnId, blockId });
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, columnId: string, blockId: string) => {
    e.preventDefault();
    e.stopPropagation();

    if (!draggedBlock) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;
    const position = e.clientY < midpoint ? 'top' : 'bottom';

    setDragOverBlock({ columnId, blockId, position });
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverBlock(null);
  };

  const handleDrop = (e: React.DragEvent, targetColumnId: string, targetBlockId: string) => {
    e.preventDefault();
    e.stopPropagation();

    if (!draggedBlock || !dragOverBlock) return;

    const sourceColumn = block.columns.find(col => col.id === draggedBlock.columnId);
    const targetColumn = block.columns.find(col => col.id === targetColumnId);

    if (!sourceColumn || !targetColumn) return;

    const sourceBlockIndex = sourceColumn.blocks.findIndex(b => b.id === draggedBlock.blockId);
    const targetBlockIndex = targetColumn.blocks.findIndex(b => b.id === targetBlockId);

    if (sourceBlockIndex === -1 || targetBlockIndex === -1) return;

    // Same column - reorder
    if (draggedBlock.columnId === targetColumnId) {
      let newIndex = targetBlockIndex;
      if (dragOverBlock.position === 'bottom') {
        newIndex = targetBlockIndex + 1;
      }
      // Adjust if moving down
      if (sourceBlockIndex < newIndex) {
        newIndex--;
      }

      moveBlockWithinColumn(targetColumnId, sourceBlockIndex, newIndex);
    } else {
      // Different columns - move block
      const movedBlock = sourceColumn.blocks[sourceBlockIndex];

      onChange({
        columns: block.columns.map(col => {
          if (col.id === draggedBlock.columnId) {
            return { ...col, blocks: col.blocks.filter(b => b.id !== draggedBlock.blockId) };
          }
          if (col.id === targetColumnId) {
            const newBlocks = [...col.blocks];
            const insertIndex = dragOverBlock.position === 'top' ? targetBlockIndex : targetBlockIndex + 1;
            newBlocks.splice(insertIndex, 0, movedBlock);
            return { ...col, blocks: newBlocks };
          }
          return col;
        }),
      });
    }

    setDraggedBlock(null);
    setDragOverBlock(null);
  };

  const handleDragEnd = () => {
    setDraggedBlock(null);
    setDragOverBlock(null);
  };

  const startResize = (index: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setResizing({
      index,
      startX: e.clientX,
      startWidths: block.columns.map(col => parseFloat(String(col.width))),
    });
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!resizing || !containerRef.current) return;

    const container = containerRef.current;
    const containerWidth = container.offsetWidth;
    const deltaX = e.clientX - resizing.startX;
    const deltaPercent = (deltaX / containerWidth) * 100;

    const newWidths = [...resizing.startWidths];
    const leftColIndex = resizing.index;
    const rightColIndex = resizing.index + 1;

    // Calculate new widths
    const newLeftWidth = Math.max(5, Math.min(95, resizing.startWidths[leftColIndex] + deltaPercent));
    const newRightWidth = Math.max(5, Math.min(95, resizing.startWidths[rightColIndex] - deltaPercent));

    // Ensure total is maintained
    const totalChange = newLeftWidth - resizing.startWidths[leftColIndex];

    newWidths[leftColIndex] = newLeftWidth;
    newWidths[rightColIndex] = resizing.startWidths[rightColIndex] - totalChange;

    // Ensure widths don't go below minimum
    if (newWidths[leftColIndex] >= 5 && newWidths[rightColIndex] >= 5) {
      onChange({
        columns: block.columns.map((col, idx) => ({
          ...col,
          width: Math.round(newWidths[idx] * 10) / 10,
        })),
      });
    }
  };

  const handleMouseUp = () => {
    setResizing(null);
  };

  // Add event listeners for resize
  useEffect(() => {
    if (resizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resizing]);

  const getGridCols = (count: number) => {
    const gridClasses: Record<number, string> = {
      1: 'grid-cols-1',
      2: 'grid-cols-2',
      3: 'grid-cols-3',
      4: 'grid-cols-4',
      5: 'grid-cols-5',
      6: 'grid-cols-6',
      7: 'grid-cols-7',
      8: 'grid-cols-8',
      9: 'grid-cols-9',
      10: 'grid-cols-10',
      11: 'grid-cols-11',
      12: 'grid-cols-12',
    };
    return gridClasses[count] || 'grid-cols-1';
  };

  const gapValue = block.gap === 'sm' ? 8 : block.gap === 'lg' ? 24 : 16;
  const effectiveGap = isSelected ? gapValue : 0;

  // Determine stacking based on editor viewport setting (not CSS media queries)
  const stackOnMobile = block.stackOnMobile !== false; // Default to true
  const stackOnTablet = block.stackOnTablet === true; // Default to false

  const shouldStack =
    (currentViewport === 'mobile' && stackOnMobile) ||
    (currentViewport === 'tablet' && stackOnTablet);

  const reverseOnStack = block.reverseOnStack === true;
  const stackingClasses = shouldStack
    ? (reverseOnStack ? 'flex-col-reverse' : 'flex-col')
    : 'flex-row';

  return (
    <div className="p-6">
      <div
        ref={containerRef}
        className={`flex relative ${stackingClasses}`}
        style={{ gap: `${effectiveGap}px` }}
      >
        {(() => {
          const normWidths = normalizeColWidths(block.columns);
          return block.columns.map((column, columnIndex) => {
          // Ensure column has an ID
          const columnId = column.id || `col-temp-${columnIndex}`;
          const isColumnDragging = draggedColumnId === columnId;
          const isColumnDropTarget = dropColumnTarget?.columnId === columnId;

          // Per-column padding
          const columnPaddingClass = !isSelected ? '' : '';
          const contentPadding = column.padding === 'sm' ? 'p-2' : column.padding === 'lg' ? 'p-6' : column.padding === 'md' ? 'p-4' : '';
          const verticalAlignClass = column.verticalAlign === 'center' ? 'justify-center' : column.verticalAlign === 'bottom' ? 'justify-end' : 'justify-start';
          const colWidth = `${normWidths[columnIndex]}%`;

          return (
          <React.Fragment key={columnId}>
            {/* Drop indicator - left/top */}
            {isColumnDropTarget && dropColumnTarget?.position === 'left' && (
              shouldStack
                ? <div className="h-1 bg-primary rounded-full w-full flex-shrink-0" />
                : <div className="w-1 bg-primary rounded-full self-stretch flex-shrink-0" />
            )}
            <div
              className={`rounded-lg relative group flex flex-col ${verticalAlignClass} ${column.cssClass || ''} ${
                isSelected
                  ? `border-2 p-3 min-h-[200px] ${
                      selectedColumnId === column.id
                        ? 'border-primary bg-primary/5'
                        : 'border-dashed border-border bg-muted/10'
                    }`
                  : `${contentPadding}`
              } ${isColumnDragging ? 'opacity-40' : ''}`}
              style={{
                width: shouldStack ? '100%' : colWidth,
                flex: shouldStack ? '0 0 100%' : `0 0 ${colWidth}`,
                ...(column.backgroundColor ? { backgroundColor: column.backgroundColor } : {}),
              }}
              onClick={(e) => {
                if (isSelected) {
                  e.stopPropagation();
                  setSelectedColumnId(column.id);
                }
              }}
              onDragOver={(e) => {
                if (draggedColumnId) handleColumnDragOver(e, columnId);
              }}
              onDrop={handleColumnDrop}
              onDragEnd={handleColumnDragEnd}
            >
            {/* Column Header with Actions - Only show when selected */}
            {isSelected && (
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
                <div className="flex items-center gap-1.5">
                  {/* Drag handle for column reorder */}
                  <div
                    className="p-0.5 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing"
                    draggable={true}
                    onDragStart={(e) => handleColumnDragStart(e, column.id)}
                    title="Drag to reorder column"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                  </div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Col {columnIndex + 1} ({Math.round(parseColWidth(column.width) * 10) / 10}%)
                  </p>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingColumnId(editingColumnId === column.id ? null : column.id);
                    }}
                    className={`p-1 rounded transition-colors ${editingColumnId === column.id ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-accent'}`}
                    title="Column settings"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      copyColumn(column.id);
                    }}
                    disabled={block.columns.length >= 12}
                    className="p-1 text-blue-500 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded disabled:opacity-30"
                    title="Copy column"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteColumn(column.id);
                    }}
                    disabled={block.columns.length <= 1}
                    className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded disabled:opacity-30"
                    title="Delete column"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            )}

            {/* Column Settings Panel - Inline */}
            {isSelected && editingColumnId === column.id && (
              <div className="mb-3 p-3 bg-card border border-border rounded-md space-y-3" onClick={(e) => e.stopPropagation()}>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Width (%)</label>
                  <input
                    type="number"
                    min={5}
                    max={95}
                    value={Math.round(parseColWidth(column.width))}
                    onChange={(e) => {
                      const newWidth = Math.max(5, Math.min(95, parseInt(e.target.value) || 5));
                      updateColumnSettings(column.id, { width: newWidth });
                    }}
                    className="w-full text-sm rounded border border-border bg-background px-2 py-1 text-foreground"
                  />
                </div>
                <div>
                  <TokenColorPicker
                    label="Background Color"
                    value={column.backgroundColor || ''}
                    onChange={(v) => updateColumnSettings(column.id, { backgroundColor: v || undefined })}
                    placeholder="transparent"
                  />
                  {column.backgroundColor && (
                    <button
                      type="button"
                      onClick={() => updateColumnSettings(column.id, { backgroundColor: undefined })}
                      className="mt-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Padding</label>
                    <select
                      value={column.padding || 'none'}
                      onChange={(e) => updateColumnSettings(column.id, { padding: e.target.value as any })}
                      className="w-full text-sm rounded border border-border bg-background px-2 py-1 text-foreground"
                    >
                      <option value="none">None</option>
                      <option value="sm">Small</option>
                      <option value="md">Medium</option>
                      <option value="lg">Large</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Vertical Align</label>
                    <select
                      value={column.verticalAlign || 'top'}
                      onChange={(e) => updateColumnSettings(column.id, { verticalAlign: e.target.value as any })}
                      className="w-full text-sm rounded border border-border bg-background px-2 py-1 text-foreground"
                    >
                      <option value="top">Top</option>
                      <option value="center">Center</option>
                      <option value="bottom">Bottom</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">CSS Class</label>
                  <input
                    type="text"
                    value={column.cssClass || ''}
                    onChange={(e) => updateColumnSettings(column.id, { cssClass: e.target.value || undefined })}
                    placeholder="e.g., rounded-lg shadow-sm"
                    className="w-full text-sm rounded border border-border bg-background px-2 py-1 text-foreground"
                  />
                </div>
              </div>
            )}

            {/* Column Content */}
            {column.blocks.length > 0 ? (
              <div className={isSelected ? "space-y-2" : "space-y-0"}>
                {column.blocks.map((columnBlock, blockIndex) => {
                  const blockId = columnBlock.id;
                  const isNestedBlockSelected = selectedBlockId === blockId;
                  const isDragging = draggedBlock?.blockId === blockId;
                  const isDropTarget = dragOverBlock?.blockId === blockId;

                  return (
                    <div key={blockId || `temp-${blockIndex}`} className="relative group/block">
                      {/* Drop indicator - top */}
                      {isDropTarget && dragOverBlock?.position === 'top' && (
                        <div className="absolute -top-1 left-0 right-0 h-0.5 bg-primary z-20" />
                      )}

                      {/* Drag handle - visible when column is selected */}
                      {isSelected && blockId && (
                        <div
                          className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-full pr-2 opacity-0 group-hover/block:opacity-100 transition-opacity z-10 cursor-move"
                          draggable={true}
                          onDragStart={(e) => {
                            e.stopPropagation();
                            handleDragStart(e, column.id, blockId);
                          }}
                        >
                          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                          </svg>
                        </div>
                      )}

                      <div
                        onDragOver={(e) => handleDragOver(e, column.id, blockId)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, column.id, blockId)}
                        onDragEnd={handleDragEnd}
                        onClick={(e) => {
                          // Prevent parent Columns block from being selected
                          e.stopPropagation();

                          // If block doesn't have an ID, generate one first
                          if (!blockId) {
                            const newBlockId = `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                            const newColId = columnId.startsWith('col-temp-') ? `col-${Date.now()}-${columnIndex}` : columnId;

                            // Update the block with new IDs
                            onChange({
                              columns: block.columns.map((col, idx) => {
                                if (idx === columnIndex) {
                                  return {
                                    ...col,
                                    id: newColId,
                                    blocks: col.blocks.map((b, bIdx) =>
                                      bIdx === blockIndex ? { ...b, id: newBlockId } as Block : b
                                    )
                                  };
                                }
                                return col;
                              })
                            });

                            // Select the block with the new ID
                            if (onSelectBlock) {
                              // Use setTimeout to ensure the update has been processed
                              setTimeout(() => {
                                onSelectBlock(newBlockId);
                              }, 0);
                            }
                          } else {
                            // Select this nested block
                            if (onSelectBlock) {
                              onSelectBlock(blockId);
                            }
                          }
                        }}
                        className={`${isSelected ? "rounded border bg-card overflow-hidden" : "overflow-hidden"} ${
                          isNestedBlockSelected ? 'border-primary ring-2 ring-primary ring-offset-1 ring-offset-background' : 'border-border'
                        } ${
                          isDragging ? 'opacity-50' : ''
                        } cursor-pointer transition-all`}
                      >
                        <VisualBlockPreview
                          block={columnBlock}
                          isSelected={isNestedBlockSelected}
                          onChange={(updates) => updateColumnBlock(column.id, blockId, updates)}
                          selectedBlockId={selectedBlockId}
                          onSelectBlock={onSelectBlock}
                        />
                      </div>

                      {/* Drop indicator - bottom */}
                      {isDropTarget && dragOverBlock?.position === 'bottom' && (
                        <div className="absolute -bottom-1 left-0 right-0 h-0.5 bg-primary z-20" />
                      )}

                      {isSelected && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteColumnBlock(column.id, blockId);
                          }}
                          className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded opacity-0 group-hover/block:opacity-100 transition-opacity z-10"
                          title="Delete block"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              isSelected && (
                <div
                  className={`flex items-center justify-center h-32 border-2 border-dashed rounded transition-colors ${
                    dragOverBlock?.columnId === columnId && !dragOverBlock?.blockId
                      ? 'border-primary bg-primary/10'
                      : 'border-border'
                  }`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (draggedBlock) {
                      setDragOverBlock({ columnId, blockId: '', position: 'bottom' });
                    }
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDragOverBlock(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    if (!draggedBlock) return;

                    const sourceColumn = block.columns.find(col => col.id === draggedBlock.columnId);
                    if (!sourceColumn) return;

                    const sourceBlockIndex = sourceColumn.blocks.findIndex(b => b.id === draggedBlock.blockId);
                    if (sourceBlockIndex === -1) return;

                    const movedBlock = sourceColumn.blocks[sourceBlockIndex];

                    // Move block to empty column
                    onChange({
                      columns: block.columns.map(col => {
                        if (col.id === draggedBlock.columnId) {
                          return { ...col, blocks: col.blocks.filter(b => b.id !== draggedBlock.blockId) };
                        }
                        if (col.id === columnId) {
                          return { ...col, blocks: [movedBlock] };
                        }
                        return col;
                      }),
                    });

                    setDraggedBlock(null);
                    setDragOverBlock(null);
                  }}
                >
                  <p className="text-sm text-muted-foreground italic">Empty column</p>
                </div>
              )
            )}

            {/* Add Block to Column Button */}
            {isSelected && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setInsertIntoColumnId(column.id);
                  setShowBlockInserter(true);
                }}
                className="w-full mt-2 p-2 border border-dashed border-border rounded hover:border-primary hover:bg-primary/5 text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                + Add Block
              </button>
            )}
          </div>

          {/* Drop indicator - right/bottom */}
          {isColumnDropTarget && dropColumnTarget?.position === 'right' && (
            shouldStack
              ? <div className="h-1 bg-primary rounded-full w-full flex-shrink-0" />
              : <div className="w-1 bg-primary rounded-full self-stretch flex-shrink-0" />
          )}

          {/* Resize / Divider Handle */}
          {columnIndex < block.columns.length - 1 && isSelected && (
            shouldStack ? (
              /* Horizontal divider when stacked - visual separator only (no resize in stacked mode) */
              <div className="relative flex items-center justify-center my-1" style={{ height: '12px' }}>
                <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 h-px bg-border rounded-full" />
              </div>
            ) : (
              /* Vertical divider when side-by-side */
              <div
                className="relative flex items-center justify-center cursor-col-resize group/resize"
                style={{ width: '16px', marginLeft: `-${gapValue / 2}px`, marginRight: `-${gapValue / 2}px` }}
                onMouseDown={(e) => startResize(columnIndex, e)}
              >
                <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-1 bg-border group-hover/resize:bg-primary transition-colors rounded-full" />
                <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-4 opacity-0 group-hover/resize:opacity-100 transition-opacity">
                  <div className="h-full w-full flex items-center justify-center">
                    <div className="w-1 h-8 bg-primary rounded-full" />
                  </div>
                </div>
              </div>
            )
          )}
          </React.Fragment>
          );
        });
        })()}
      </div>

      {/* Add Column Button */}
      {isSelected && (
        <div className="mt-4 pt-4 border-t border-border">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              addColumn();
            }}
            disabled={block.columns.length >= 12}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
          >
            + Add Column ({block.columns.length}/12)
          </button>
        </div>
      )}

      {/* Block Inserter Modal */}
      {showBlockInserter && insertIntoColumnId && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={(e) => {
            e.stopPropagation();
            setShowBlockInserter(false);
            setInsertIntoColumnId(null);
          }}
        >
          <div
            className="bg-white dark:bg-gray-900 border border-border rounded-lg max-w-2xl w-full max-h-[70vh] overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-border bg-white dark:bg-gray-900">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold text-foreground">Add Block to Column</h3>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowBlockInserter(false);
                    setInsertIntoColumnId(null);
                  }}
                  className="p-1 text-muted-foreground hover:text-foreground rounded-full hover:bg-accent"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="overflow-y-auto max-h-[calc(70vh-80px)] bg-white dark:bg-gray-900">
              {Array.from(new Set(blockTypes.map(bt => bt.category))).map(category => (
                <div key={category} className="p-4 border-b border-border last:border-0 bg-white dark:bg-gray-900">
                  <h4 className="text-sm font-semibold text-muted-foreground uppercase mb-3 tracking-wide">{category}</h4>
                  <div className="grid grid-cols-3 gap-3">
                    {blockTypes
                      .filter(bt => bt.category === category)
                      .map(blockType => (
                        <button
                          key={blockType.type}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            addBlockToColumn(insertIntoColumnId, blockType.type);
                          }}
                          className="p-3 border border-border rounded-lg hover:border-primary hover:bg-primary/5 transition-all text-left group bg-white dark:bg-gray-900"
                        >
                          <div className="flex flex-col items-center gap-2">
                            <div className="text-2xl">{blockType.icon}</div>
                            <div className="text-xs font-medium text-foreground group-hover:text-primary text-center">
                              {blockType.label}
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
    </div>
  );
}

function createDefaultBlock(type: BlockType): Block {
  const id = `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const order = 0;
  const base = { id, order, type };

  switch (type) {
    case 'text':
      return { ...base, type: 'text', content: 'Start writing...', alignment: 'left', size: 'base' };
    case 'heading':
      return { ...base, type: 'heading', content: 'Heading', level: 2, alignment: 'left' };
    case 'image':
      return { ...base, type: 'image', url: '', alt: '', width: 'full', alignment: 'center' };
    case 'button':
      return { ...base, type: 'button', text: 'Click me', url: '', variant: 'primary', size: 'md', alignment: 'left' };
    case 'quote':
      return { ...base, type: 'quote', content: 'Add a quote...', author: '', citation: '' };
    case 'code':
      return { ...base, type: 'code', code: '// Code here...', language: 'javascript' };
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
    case 'booking':
      return { ...base, type: 'booking', slug: '', title: 'Schedule a Meeting', description: 'Pick a time that works for you', showPageTitle: true, height: '700px' };
    case 'survey':
      return { ...base, type: 'survey', slug: '', title: 'Take Our Survey', description: "We'd love to hear your feedback", showPageTitle: true, height: '700px' };
    default:
      return { ...base, type: 'text', content: 'Block', alignment: 'left', size: 'base' };
  }
}
