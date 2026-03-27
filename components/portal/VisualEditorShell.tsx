'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  pointerWithin,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  useDroppable,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  useSortable,
} from '@dnd-kit/sortable';

// No-op sorting strategy: items stay in place during drag, only reorder on drop
const noMovementStrategy = () => null;
import { useVisualEditorParent } from '@/lib/visual-editor/useVisualEditorParent';
import { DynamicPropertyPanel } from './DynamicPropertyPanel';
import { StyleSettings } from '@/components/blocks/visual/StyleSettings';
import { findBlockById, findBlockPath, updateBlockById, removeBlockById, insertBlockInContainer, insertBlockAfter, getAllBlocks } from '@/lib/utils/blockHelpers';
import type { Block, BlockType, BlockStyle, ColumnsBlock } from '@/types/blocks';
import type { Breakpoint } from '@/types/responsive';
import type { ComponentManifestEntry } from '@/types/visual-editor';

// ─── Block type definitions for picker ───────────────────────────────────────

const BUILT_IN_BLOCK_TYPES: Array<{ type: BlockType; label: string; icon: string; category: string; description: string }> = [
  { type: 'heading', label: 'Heading', icon: 'title', category: 'Basic', description: 'Add a title or heading' },
  { type: 'text', label: 'Paragraph', icon: 'notes', category: 'Basic', description: 'Start with plain text' },
  { type: 'button', label: 'Button', icon: 'smart_button', category: 'Basic', description: 'Call-to-action button' },
  { type: 'quote', label: 'Quote', icon: 'format_quote', category: 'Basic', description: 'Add a quotation' },
  { type: 'image', label: 'Image', icon: 'image', category: 'Media', description: 'Insert an image' },
  { type: 'youtube', label: 'YouTube', icon: 'play_circle', category: 'Media', description: 'Embed YouTube video' },
  { type: 'video', label: 'Video', icon: 'videocam', category: 'Media', description: 'Embed a video file' },
  { type: 'gallery', label: 'Gallery', icon: 'photo_library', category: 'Media', description: 'Image gallery' },
  { type: 'code', label: 'Code', icon: 'code', category: 'Media', description: 'Code snippet' },
  { type: 'spacer', label: 'Spacer', icon: 'height', category: 'Layout', description: 'Add vertical space' },
  { type: 'divider', label: 'Divider', icon: 'horizontal_rule', category: 'Layout', description: 'Horizontal line' },
  { type: 'columns', label: 'Columns', icon: 'view_column', category: 'Layout', description: 'Multi-column layout' },
  { type: 'section', label: 'Section', icon: 'crop_free', category: 'Layout', description: 'Container wrapper' },
  { type: 'tabs', label: 'Tabs', icon: 'tab', category: 'Layout', description: 'Tabbed sections' },
  { type: 'accordion', label: 'Accordion', icon: 'expand_more', category: 'Layout', description: 'Collapsible sections' },
  { type: 'hero', label: 'Hero', icon: 'view_carousel', category: 'Components', description: 'Hero section with CTA' },
  { type: 'cta', label: 'Call to Action', icon: 'campaign', category: 'Components', description: 'CTA section' },
  { type: 'card-grid', label: 'Card Grid', icon: 'grid_view', category: 'Components', description: 'Grid of cards' },
  { type: 'stats', label: 'Statistics', icon: 'bar_chart', category: 'Components', description: 'Stats display' },
  { type: 'testimonial', label: 'Testimonial', icon: 'rate_review', category: 'Components', description: 'Customer quote' },
  { type: 'featured-content', label: 'Featured', icon: 'star', category: 'Components', description: 'Featured content' },
  { type: 'services-grid', label: 'Services', icon: 'apps', category: 'Components', description: 'Services grid' },
];

const BLOCK_ICON_MAP: Record<string, string> = {};
for (const bt of BUILT_IN_BLOCK_TYPES) BLOCK_ICON_MAP[bt.type] = bt.icon;

// ─── Props ───────────────────────────────────────────────────────────────────

interface UndoRedoControls {
  sendUndo: () => void;
  sendRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

interface VisualEditorShellProps {
  blocks: Block[];
  selectedBlockId: string | null;
  iframeSrc: string;
  viewport?: 'desktop' | 'tablet' | 'mobile';
  previewMode?: boolean;
  onBlocksChange: (blocks: Block[]) => void;
  onSelectBlock: (blockId: string | null) => void;
  onAddBlock: (type: string, afterBlockId?: string) => void;
  onDeleteBlock: (blockId: string) => void;
  onUpdateBlock: (blockId: string, updates: Partial<Block>) => void;
  onUndoRedoChange?: (controls: UndoRedoControls) => void;
}

// ─── Main Shell ──────────────────────────────────────────────────────────────

export function VisualEditorShell({
  blocks,
  selectedBlockId: selectedBlockIdProp,
  iframeSrc,
  viewport = 'desktop',
  previewMode = false,
  onBlocksChange,
  onSelectBlock,
  onAddBlock,
  onDeleteBlock,
  onUpdateBlock,
  onUndoRedoChange,
}: VisualEditorShellProps) {
  const [internalSelectedBlockId, setInternalSelectedBlockId] = useState<string | null>(null);
  const selectedBlockId = selectedBlockIdProp ?? internalSelectedBlockId;
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerCategory, setPickerCategory] = useState<string | null>(null);
  const [pickerSearch, setPickerSearch] = useState('');
  const [rightPanelTab, setRightPanelTab] = useState<'content' | 'style'>('content');

  const selectBlock = useCallback((blockId: string) => {
    setInternalSelectedBlockId(blockId);
    onSelectBlock(blockId);
  }, [onSelectBlock]);

  const handleBlockHovered = useCallback(() => {}, []);

  const {
    iframeRef,
    iframeReady,
    customComponents,
    sendBlocksUpdate,
    sendSelectBlock,
    handleIframeLoad,
    sendUndo,
    sendRedo,
    undoRedoState,
  } = useVisualEditorParent({
    blocks,
    selectedBlockId,
    onBlockClicked: selectBlock,
    onBlockHovered: handleBlockHovered,
    onBlocksReordered: onBlocksChange,
    onAddBlockAfter: (blockId: string) => {
      const newBlock = {
        id: `block-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: 'text' as const,
        order: 0,
        content: 'New block — click to edit',
      } as Block;
      // Insert after the target block (works for nested blocks too)
      const topIdx = blocks.findIndex(b => b.id === blockId);
      let updated: Block[];
      if (topIdx !== -1) {
        updated = [...blocks];
        updated.splice(topIdx + 1, 0, newBlock);
      } else {
        // Nested — use recursive insert
        updated = insertBlockAfter(blocks, blockId, newBlock);
      }
      onBlocksChange(updated);
      selectBlock(newBlock.id);
    },
    onBlockResized: (blockId: string, width: string | undefined, height: string | undefined) => {
      const style: Record<string, string> = {};
      if (width) style.width = width;
      if (height) style.height = height;
      handleUpdateBlock(blockId, { style: { ...(findBlockById(blocks, blockId)?.style || {}), ...style } } as Partial<Block>);
    },
    onBlockStyleUpdated: (blockId: string, style: Record<string, string>) => {
      handleUpdateBlock(blockId, { style: { ...(findBlockById(blocks, blockId)?.style || {}), ...style } } as Partial<Block>);
    },
    onColumnResized: (blockId: string, columnWidths: number[]) => {
      const block = findBlockById(blocks, blockId) as ColumnsBlock | undefined;
      if (!block || block.type !== 'columns') return;
      const updatedColumns = block.columns.map((col, i) => ({
        ...col,
        width: columnWidths[i] ?? col.width,
      }));
      handleUpdateBlock(blockId, { columns: updatedColumns } as Partial<Block>);
    },
    onGapChanged: (blockId: string, gap: 'sm' | 'md' | 'lg') => {
      handleUpdateBlock(blockId, { gap } as Partial<Block>);
    },
  });

  useEffect(() => { sendBlocksUpdate(blocks); }, [blocks, sendBlocksUpdate]);
  useEffect(() => { sendSelectBlock(selectedBlockId); }, [selectedBlockId, sendSelectBlock]);

  // Notify parent of undo/redo availability
  useEffect(() => {
    onUndoRedoChange?.({ sendUndo, sendRedo, canUndo: undoRedoState.canUndo, canRedo: undoRedoState.canRedo });
  }, [undoRedoState, sendUndo, sendRedo, onUndoRedoChange]);

  const allBlockTypes = useMemo(() => {
    const custom = customComponents.map((c) => ({
      type: c.type as BlockType, label: c.label, icon: c.icon, category: c.category, description: c.description,
    }));
    return [...BUILT_IN_BLOCK_TYPES, ...custom];
  }, [customComponents]);

  const categories = useMemo(() => Array.from(new Set(allBlockTypes.map((b) => b.category))), [allBlockTypes]);

  // Find selected block (including nested)
  const selectedBlock = selectedBlockId ? findBlockById(blocks, selectedBlockId) : null;
  const selectedCustomManifest = selectedBlock ? customComponents.find((c) => c.type === selectedBlock.type) : null;

  const viewportWidth = { desktop: '100%', tablet: '768px', mobile: '375px' }[viewport];
  const currentViewport: Breakpoint = viewport === 'mobile' ? 'mobile' : viewport === 'tablet' ? 'tablet' : 'desktop';

  // Handle block updates (including nested)
  const handleUpdateBlock = useCallback((blockId: string, updates: Partial<Block>) => {
    const updated = updateBlockById(blocks, blockId, updates);
    onBlocksChange(updated);
  }, [blocks, onBlocksChange]);

  // DnD for layers (supports nesting)
  const [draggedBlockId, setDraggedBlockId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 10,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 8,
      },
    }),
    useSensor(KeyboardSensor),
  );

  const [layerOverId, setLayerOverId] = useState<string | null>(null);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setDraggedBlockId(event.active.id as string);
    setLayerOverId(null);
  }, []);

  const handleLayerDragOver = useCallback((event: DragOverEvent) => {
    setLayerOverId(event.over ? (event.over.id as string) : null);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setDraggedBlockId(null);
    setLayerOverId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // Check if dropping onto a container drop zone (id format: "dropzone:{containerId}:{slotIndex}")
    if (overId.startsWith('dropzone:')) {
      const firstColon = overId.indexOf(':');
      const lastColon = overId.lastIndexOf(':');
      const containerId = overId.substring(firstColon + 1, lastColon);
      const slotIndex = parseInt(overId.substring(lastColon + 1));
      const draggedBlock = findBlockById(blocks, activeId);
      if (!draggedBlock || isNaN(slotIndex)) return;

      // Don't drop a container into itself
      if (containerId === activeId) return;

      // Remove from current position, insert at end of container slot
      let updated = removeBlockById(blocks, activeId);
      // Find the container to get current child count for append position
      const container = findBlockById(updated, containerId);
      let appendAt = 0;
      if (container) {
        if (container.type === 'columns' && container.columns[slotIndex]) {
          appendAt = container.columns[slotIndex].blocks.length;
        } else if (container.type === 'tabs' && container.tabs[slotIndex]) {
          appendAt = container.tabs[slotIndex].blocks.length;
        } else if (container.type === 'section') {
          appendAt = container.blocks.length;
        }
      }
      updated = insertBlockInContainer(updated, containerId, slotIndex, appendAt, draggedBlock);
      onBlocksChange(updated);
      return;
    }

    const draggedBlock = findBlockById(blocks, activeId);
    if (!draggedBlock) return;

    // Standard reorder: both at top level
    const oldIndex = blocks.findIndex((b) => b.id === activeId);
    const newIndex = blocks.findIndex((b) => b.id === overId);
    if (oldIndex !== -1 && newIndex !== -1) {
      onBlocksChange(arrayMove(blocks, oldIndex, newIndex));
      return;
    }

    // Moving a nested block to top level (drop on a top-level block)
    if (oldIndex === -1 && newIndex !== -1) {
      let updated = removeBlockById(blocks, activeId);
      updated.splice(newIndex, 0, draggedBlock);
      onBlocksChange(updated);
      return;
    }

    // Moving a top-level block to where a nested block is (swap positions)
    if (oldIndex !== -1 && newIndex === -1) {
      const overPath = findBlockPath(blocks, overId);
      if (!overPath) return;
      let updated = removeBlockById(blocks, activeId);
      updated = insertBlockInContainer(updated, overPath.containerId, overPath.slotIndex, overPath.blockIndex, draggedBlock);
      onBlocksChange(updated);
      return;
    }

    // Both nested — move active to over's position
    if (oldIndex === -1 && newIndex === -1) {
      const overPath = findBlockPath(blocks, overId);
      if (!overPath) return;
      let updated = removeBlockById(blocks, activeId);
      updated = insertBlockInContainer(updated, overPath.containerId, overPath.slotIndex, overPath.blockIndex, draggedBlock);
      onBlocksChange(updated);
    }
  }, [blocks, onBlocksChange]);

  // Collect all block IDs + drop zone IDs for DnD context
  const allBlockIds = useMemo(() => {
    const all = getAllBlocks(blocks);
    const ids = all.map(b => b.id);
    // Add drop zone IDs for all containers (including nested ones)
    for (const block of all) {
      if (block.type === 'columns') block.columns.forEach((_, i) => ids.push(`dropzone:${block.id}:${i}`));
      if (block.type === 'tabs') block.tabs.forEach((_, i) => ids.push(`dropzone:${block.id}:${i}`));
      if (block.type === 'section') ids.push(`dropzone:${block.id}:0`);
    }
    return ids;
  }, [blocks]);

  return (
    <div className="flex h-[calc(100vh-3rem)] overflow-hidden">
      {/* ── Left Panel ── */}
      {!previewMode && (
      <div className="w-60 flex-shrink-0 border-r border-border bg-muted flex flex-col overflow-hidden">
        <div className="p-3 shrink-0">
          <button
            type="button"
            onClick={() => setPickerOpen(!pickerOpen)}
            className="w-full flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <span className="material-icons text-base">add</span>
            Add Block
          </button>
        </div>

        {pickerOpen && (
          <div className="flex flex-col min-h-0 max-h-[60%] shrink-0">
            <div className="px-3 pb-2 shrink-0">
              {/* Search */}
              <div className="flex items-center gap-1.5 rounded border border-border bg-background px-2 py-1.5 mb-2">
                <span className="material-icons text-sm text-muted-foreground">search</span>
                <input
                  type="text"
                  value={pickerSearch}
                  onChange={(e) => setPickerSearch(e.target.value)}
                  placeholder="Search blocks..."
                  className="flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
                />
                {pickerSearch && (
                  <button type="button" onClick={() => setPickerSearch('')} className="text-muted-foreground hover:text-foreground">
                    <span className="material-icons text-sm">close</span>
                  </button>
                )}
              </div>
              {/* Category filters */}
              <div className="flex flex-wrap gap-1">
                {categories.map((cat) => (
                  <button type="button" key={cat} onClick={() => setPickerCategory(pickerCategory === cat ? null : cat)}
                    className={`px-2 py-0.5 text-xs rounded ${pickerCategory === cat ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground hover:bg-accent'}`}
                  >{cat}</button>
                ))}
              </div>
            </div>
            {/* Scrollable block grid */}
            <div className="flex-1 overflow-y-auto px-3 pb-3">
              <div className="grid grid-cols-2 gap-1">
                {allBlockTypes
                  .filter((b) => !pickerCategory || b.category === pickerCategory)
                  .filter((b) => !pickerSearch || b.label.toLowerCase().includes(pickerSearch.toLowerCase()) || b.type.toLowerCase().includes(pickerSearch.toLowerCase()) || b.description.toLowerCase().includes(pickerSearch.toLowerCase()))
                  .map((bt) => (
                  <button type="button" key={bt.type} onClick={() => { onAddBlock(bt.type); setPickerOpen(false); setPickerSearch(''); }}
                    className="flex flex-col items-center gap-0.5 rounded border border-border bg-card p-1.5 text-center hover:border-primary/30 hover:bg-primary/5"
                  >
                    <span className="material-icons text-base text-muted-foreground">{bt.icon}</span>
                    <span className="text-[10px] text-foreground leading-tight">{bt.label}</span>
                  </button>
                ))}
              </div>
              {allBlockTypes
                .filter((b) => !pickerCategory || b.category === pickerCategory)
                .filter((b) => !pickerSearch || b.label.toLowerCase().includes(pickerSearch.toLowerCase()) || b.type.toLowerCase().includes(pickerSearch.toLowerCase()) || b.description.toLowerCase().includes(pickerSearch.toLowerCase()))
                .length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">No blocks found</p>
              )}
            </div>
          </div>
        )}

        {/* Layers — DnD sortable tree */}
        <div className="flex-1 overflow-y-auto border-t border-border">
          <div className="px-3 py-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-1">Layers</h3>
          </div>
          <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={handleDragStart} onDragOver={handleLayerDragOver} onDragEnd={handleDragEnd}>
            <SortableContext items={allBlockIds} strategy={noMovementStrategy}>
              <div className="px-1 pb-2">
                {blocks.map((block) => (
                  <LayerItem
                    key={block.id}
                    block={block}
                    depth={0}
                    selectedBlockId={selectedBlockId}
                    onSelect={selectBlock}
                    onDelete={onDeleteBlock}
                    showDropIndicator={!!draggedBlockId && layerOverId === block.id && draggedBlockId !== block.id}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      </div>
      )}

      {/* ── Center — iframe ── */}
      <div className="flex-1 flex flex-col bg-muted">
        <div className={`flex-1 flex items-start justify-center overflow-auto ${previewMode ? 'p-0' : 'p-4'}`}>
          <div className={`bg-card overflow-hidden transition-all ${previewMode ? '' : 'shadow-lg rounded-lg'}`} style={{ width: viewportWidth, maxWidth: '100%', height: '100%' }}>
            <iframe ref={iframeRef} src={iframeSrc} onLoad={handleIframeLoad} className="w-full h-full border-0" title="Visual Editor" />
          </div>
        </div>
      </div>

      {/* ── Right Panel — Property Editor ── */}
      {!previewMode && (
      <div className="w-80 flex-shrink-0 border-l border-border bg-card flex flex-col overflow-hidden">
        {selectedBlock ? (
          <>
            {/* Block header */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
              <div className="flex items-center gap-2">
                <span className="material-icons text-base text-muted-foreground">{BLOCK_ICON_MAP[selectedBlock.type] || 'widgets'}</span>
                <span className="text-sm font-semibold text-foreground capitalize">{selectedBlock.type.replace('-', ' ')}</span>
              </div>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => onDeleteBlock(selectedBlock.id)} className="p-1 text-muted-foreground hover:text-destructive" title="Delete">
                  <span className="material-icons text-base">delete</span>
                </button>
              </div>
            </div>

            {/* Content / Style tabs */}
            <div className="flex border-b border-border shrink-0">
              <button type="button" onClick={() => setRightPanelTab('content')}
                className={`flex-1 py-2 text-xs font-medium ${rightPanelTab === 'content' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'}`}
              >Content</button>
              <button type="button" onClick={() => setRightPanelTab('style')}
                className={`flex-1 py-2 text-xs font-medium ${rightPanelTab === 'style' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'}`}
              >Style</button>
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto p-4">
              {rightPanelTab === 'content' ? (
                selectedCustomManifest ? (
                  <DynamicPropertyPanel
                    inputs={selectedCustomManifest.inputs}
                    values={selectedBlock as unknown as Record<string, unknown>}
                    onChange={(name, value) => handleUpdateBlock(selectedBlock.id, { [name]: value } as Partial<Block>)}
                  />
                ) : (
                  <BlockContentEditor block={selectedBlock} onUpdate={(updates) => handleUpdateBlock(selectedBlock.id, updates)} />
                )
              ) : (
                <StyleSettings
                  block={selectedBlock}
                  onChange={(updates) => handleUpdateBlock(selectedBlock.id, updates)}
                  currentViewport={currentViewport}
                />
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center p-6 text-muted-foreground">
            <span className="material-icons text-3xl mb-2">touch_app</span>
            <p className="text-sm">Click a block to edit</p>
          </div>
        )}
      </div>
      )}
    </div>
  );
}

// ─── Sortable Layer Item (recursive for nested blocks) ───────────────────────

function LayerItem({
  block,
  depth,
  selectedBlockId,
  onSelect,
  onDelete,
  showDropIndicator = false,
}: {
  block: Block;
  depth: number;
  selectedBlockId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  showDropIndicator?: boolean;
}) {
  const sortable = useSortable({ id: block.id, transition: null });
  const style = { opacity: sortable.isDragging ? 0.3 : 1, transition: 'opacity 200ms' } as React.CSSProperties;
  const isSelected = selectedBlockId === block.id;
  const icon = BLOCK_ICON_MAP[block.type] || 'widgets';
  const [expanded, setExpanded] = useState(true);

  // Get nested children
  const children: { label: string; blocks: Block[] }[] = [];
  if (block.type === 'columns') {
    block.columns.forEach((col, i) => children.push({ label: `Col ${i + 1}`, blocks: col.blocks }));
  }
  if (block.type === 'tabs') {
    block.tabs.forEach((tab) => children.push({ label: tab.label, blocks: tab.blocks }));
  }
  if (block.type === 'section') {
    children.push({ label: 'Content', blocks: block.blocks });
  }
  if (block.type === 'accordion') {
    block.items.forEach((item) => children.push({ label: item.title, blocks: [] }));
  }

  const isContainer = children.length > 0;
  const hasChildren = children.some(c => c.blocks.length > 0);
  const previewText = 'content' in block && typeof block.content === 'string'
    ? block.content.replace(/<[^>]+>/g, '').substring(0, 20)
    : 'title' in block && typeof block.title === 'string'
      ? block.title.substring(0, 20)
      : '';

  return (
    <div ref={sortable.setNodeRef} style={style}>
      {showDropIndicator && (
        <div className="relative z-20 mx-1" style={{ height: 0 }}>
          <div className="absolute inset-x-0 top-0 -translate-y-1/2 h-0.5 bg-primary rounded-full" />
        </div>
      )}
      <div
        className={`group/layer flex items-center gap-1 rounded px-1 py-1 text-left text-xs cursor-pointer ${
          isSelected ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'
        }`}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
        onClick={() => onSelect(block.id)}
      >
        {/* Drag handle */}
        <span {...sortable.attributes} {...sortable.listeners} className="material-icons text-xs shrink-0 text-muted-foreground/50 cursor-grab">drag_indicator</span>

        {/* Expand toggle for containers */}
        {isContainer ? (
          <button type="button" onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            className="material-icons text-xs text-muted-foreground shrink-0"
          >{expanded ? 'expand_more' : 'chevron_right'}</button>
        ) : (
          <span className="w-3 shrink-0" />
        )}

        <span className="material-icons text-xs shrink-0">{icon}</span>
        <span className="truncate flex-1">{previewText || block.type}</span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(block.id); }}
          className="material-icons text-xs text-muted-foreground/50 hover:text-destructive opacity-0 group-hover/layer:opacity-100 transition-opacity shrink-0"
          title="Delete"
        >close</button>
      </div>

      {/* Nested children with drop zones */}
      {expanded && children.map((child, ci) => (
        <div key={ci}>
          <div className="text-[9px] text-muted-foreground uppercase tracking-wider" style={{ paddingLeft: `${(depth + 1) * 12 + 20}px` }}>
            {child.label}
          </div>
          {child.blocks.map((nested) => (
            <LayerItem key={nested.id} block={nested} depth={depth + 1} selectedBlockId={selectedBlockId} onSelect={onSelect} onDelete={onDelete} />
          ))}
          <ContainerDropZone containerId={block.id} slotIndex={ci} depth={depth + 1} />
        </div>
      ))}
    </div>
  );
}

// ─── Container Drop Zone ─────────────────────────────────────────────────────

function ContainerDropZone({ containerId, slotIndex, depth }: { containerId: string; slotIndex: number; depth: number }) {
  const dropId = `dropzone:${containerId}:${slotIndex}`;
  const { setNodeRef, isOver } = useDroppable({ id: dropId });

  return (
    <div
      ref={setNodeRef}
      className={`mx-1 my-1 rounded-md text-center text-[10px] transition-all ${
        isOver
          ? 'border-2 border-primary bg-primary/10 text-primary py-3 font-medium'
          : 'border border-dashed border-border text-muted-foreground py-1.5'
      }`}
      style={{ marginLeft: `${(depth) * 12 + 20}px` }}
    >
      {isOver ? '+ Drop block here' : '+ Add to slot'}
    </div>
  );
}

// ─── Block Content Editor ────────────────────────────────────────────────────

function BlockContentEditor({ block, onUpdate }: { block: Block; onUpdate: (updates: Partial<Block>) => void }) {
  const b = block as unknown as Record<string, unknown>;

  return (
    <div className="space-y-3">
      {/* Content fields by block type */}
      {block.type === 'heading' && (
        <>
          <Field label="Content" value={b.content as string} onChange={(v) => onUpdate({ content: v } as Partial<Block>)} />
          <SelectField label="Level" value={String(b.level || 2)} options={['1','2','3','4','5','6']} onChange={(v) => onUpdate({ level: Number(v) } as Partial<Block>)} />
          <SelectField label="Alignment" value={(b.alignment as string) || 'left'} options={['left','center','right']} onChange={(v) => onUpdate({ alignment: v } as Partial<Block>)} />
        </>
      )}
      {block.type === 'text' && (
        <>
          <TextareaField label="Content" value={b.content as string} onChange={(v) => onUpdate({ content: v } as Partial<Block>)} />
          <SelectField label="Size" value={(b.size as string) || 'base'} options={['sm','base','lg','xl']} onChange={(v) => onUpdate({ size: v } as Partial<Block>)} />
          <SelectField label="Alignment" value={(b.alignment as string) || 'left'} options={['left','center','right']} onChange={(v) => onUpdate({ alignment: v } as Partial<Block>)} />
        </>
      )}
      {block.type === 'image' && (
        <>
          <Field label="Image URL" value={b.url as string} onChange={(v) => onUpdate({ url: v } as Partial<Block>)} />
          <Field label="Alt Text" value={b.alt as string} onChange={(v) => onUpdate({ alt: v } as Partial<Block>)} />
          <Field label="Caption" value={b.caption as string} onChange={(v) => onUpdate({ caption: v } as Partial<Block>)} />
          <SelectField label="Width" value={(b.width as string) || 'full'} options={['small','medium','large','full']} onChange={(v) => onUpdate({ width: v } as Partial<Block>)} />
        </>
      )}
      {block.type === 'button' && (
        <>
          <Field label="Text" value={b.text as string} onChange={(v) => onUpdate({ text: v } as Partial<Block>)} />
          <Field label="URL" value={b.url as string} onChange={(v) => onUpdate({ url: v } as Partial<Block>)} />
          <SelectField label="Variant" value={(b.variant as string) || 'primary'} options={['primary','secondary','outline']} onChange={(v) => onUpdate({ variant: v } as Partial<Block>)} />
          <SelectField label="Size" value={(b.size as string) || 'md'} options={['sm','md','lg']} onChange={(v) => onUpdate({ size: v } as Partial<Block>)} />
        </>
      )}
      {block.type === 'quote' && (
        <>
          <TextareaField label="Quote" value={b.content as string} onChange={(v) => onUpdate({ content: v } as Partial<Block>)} />
          <Field label="Author" value={b.author as string} onChange={(v) => onUpdate({ author: v } as Partial<Block>)} />
          <Field label="Citation" value={b.citation as string} onChange={(v) => onUpdate({ citation: v } as Partial<Block>)} />
        </>
      )}
      {block.type === 'code' && (
        <>
          <TextareaField label="Code" value={b.code as string} onChange={(v) => onUpdate({ code: v } as Partial<Block>)} rows={6} />
          <Field label="Language" value={b.language as string} onChange={(v) => onUpdate({ language: v } as Partial<Block>)} />
        </>
      )}
      {block.type === 'spacer' && (
        <SelectField label="Height" value={(b.height as string) || 'md'} options={['sm','md','lg','xl']} onChange={(v) => onUpdate({ height: v } as Partial<Block>)} />
      )}
      {block.type === 'divider' && (
        <SelectField label="Line Style" value={(b.lineStyle as string) || 'solid'} options={['solid','dashed','dotted']} onChange={(v) => onUpdate({ lineStyle: v } as Partial<Block>)} />
      )}
      {(block.type === 'youtube' || block.type === 'video') && (
        <>
          <Field label="URL" value={b.url as string} onChange={(v) => onUpdate({ url: v } as Partial<Block>)} />
          <Field label="Caption" value={b.caption as string} onChange={(v) => onUpdate({ caption: v } as Partial<Block>)} />
        </>
      )}
      {block.type === 'hero' && (
        <>
          <Field label="Title" value={b.title as string} onChange={(v) => onUpdate({ title: v } as Partial<Block>)} />
          <Field label="Subtitle" value={b.subtitle as string} onChange={(v) => onUpdate({ subtitle: v } as Partial<Block>)} />
          <TextareaField label="Description" value={b.description as string} onChange={(v) => onUpdate({ description: v } as Partial<Block>)} />
          <Field label="CTA Text" value={b.ctaText as string} onChange={(v) => onUpdate({ ctaText: v } as Partial<Block>)} />
          <Field label="CTA Link" value={b.ctaLink as string} onChange={(v) => onUpdate({ ctaLink: v } as Partial<Block>)} />
          <Field label="Background Image" value={b.backgroundImage as string} onChange={(v) => onUpdate({ backgroundImage: v } as Partial<Block>)} />
        </>
      )}
      {block.type === 'cta' && (
        <>
          <Field label="Title" value={b.title as string} onChange={(v) => onUpdate({ title: v } as Partial<Block>)} />
          <TextareaField label="Description" value={b.description as string} onChange={(v) => onUpdate({ description: v } as Partial<Block>)} />
          <Field label="Button Text" value={b.primaryButtonText as string} onChange={(v) => onUpdate({ primaryButtonText: v } as Partial<Block>)} />
          <Field label="Button URL" value={b.primaryButtonUrl as string} onChange={(v) => onUpdate({ primaryButtonUrl: v } as Partial<Block>)} />
          <SelectField label="Background" value={(b.backgroundStyle as string) || 'none'} options={['none','solid','gradient']} onChange={(v) => onUpdate({ backgroundStyle: v } as Partial<Block>)} />
        </>
      )}
      {block.type === 'testimonial' && (
        <>
          <TextareaField label="Quote" value={b.quote as string} onChange={(v) => onUpdate({ quote: v } as Partial<Block>)} />
          <Field label="Author" value={b.author as string} onChange={(v) => onUpdate({ author: v } as Partial<Block>)} />
          <Field label="Role" value={b.role as string} onChange={(v) => onUpdate({ role: v } as Partial<Block>)} />
          <Field label="Company" value={b.company as string} onChange={(v) => onUpdate({ company: v } as Partial<Block>)} />
        </>
      )}
      {block.type === 'columns' && (
        <ColumnsEditor block={block} onUpdate={onUpdate} />
      )}
      {block.type === 'section' && (
        <>
          <Field label="Background Color" value={b.backgroundColor as string} onChange={(v) => onUpdate({ backgroundColor: v } as Partial<Block>)} />
          <Field label="Max Width" value={b.maxWidth as string} onChange={(v) => onUpdate({ maxWidth: v } as Partial<Block>)} />
          <p className="text-xs text-muted-foreground">Nested blocks: {block.blocks.length}. Edit via layers panel.</p>
        </>
      )}
      {block.type === 'stats' && (
        <>
          <Field label="Title" value={b.title as string} onChange={(v) => onUpdate({ title: v } as Partial<Block>)} />
          <SelectField label="Columns" value={String(b.columns || 3)} options={['2','3','4']} onChange={(v) => onUpdate({ columns: Number(v) } as Partial<Block>)} />
        </>
      )}
      {block.type === 'card-grid' && (
        <>
          <Field label="Title" value={b.title as string} onChange={(v) => onUpdate({ title: v } as Partial<Block>)} />
          <SelectField label="Columns" value={String(b.columns || 3)} options={['2','3','4']} onChange={(v) => onUpdate({ columns: Number(v) } as Partial<Block>)} />
        </>
      )}
      {block.type === 'gallery' && (
        <>
          <SelectField label="Layout" value={(b.layout as string) || 'grid'} options={['grid','masonry']} onChange={(v) => onUpdate({ layout: v } as Partial<Block>)} />
          <SelectField label="Columns" value={String(b.columns || 3)} options={['2','3','4']} onChange={(v) => onUpdate({ columns: Number(v) } as Partial<Block>)} />
          <CheckboxField label="Enable Lightbox" checked={b.lightbox as boolean} onChange={(v) => onUpdate({ lightbox: v } as Partial<Block>)} />
        </>
      )}
      {block.type === 'accordion' && (
        <p className="text-xs text-muted-foreground">Items: {block.items.length}. Use the style tab for visual customization.</p>
      )}
      {block.type === 'featured-content' && (
        <>
          <Field label="Title" value={b.title as string} onChange={(v) => onUpdate({ title: v } as Partial<Block>)} />
          <TextareaField label="Description" value={b.description as string} onChange={(v) => onUpdate({ description: v } as Partial<Block>)} />
          <Field label="Image URL" value={b.imageUrl as string} onChange={(v) => onUpdate({ imageUrl: v } as Partial<Block>)} />
          <SelectField label="Image Position" value={(b.imagePosition as string) || 'right'} options={['left','right']} onChange={(v) => onUpdate({ imagePosition: v } as Partial<Block>)} />
          <Field label="Button Text" value={b.buttonText as string} onChange={(v) => onUpdate({ buttonText: v } as Partial<Block>)} />
          <Field label="Button URL" value={b.buttonUrl as string} onChange={(v) => onUpdate({ buttonUrl: v } as Partial<Block>)} />
        </>
      )}
      {block.type === 'services-grid' && (
        <>
          <Field label="Title" value={b.title as string} onChange={(v) => onUpdate({ title: v } as Partial<Block>)} />
          <TextareaField label="Description" value={b.description as string} onChange={(v) => onUpdate({ description: v } as Partial<Block>)} />
          <SelectField label="Columns" value={String(b.columns || 3)} options={['2','3','4']} onChange={(v) => onUpdate({ columns: Number(v) } as Partial<Block>)} />
        </>
      )}
    </div>
  );
}

// ─── Columns Editor ──────────────────────────────────────────────────────────

function ColumnsEditor({ block, onUpdate }: { block: Block & { type: 'columns' }; onUpdate: (updates: Partial<Block>) => void }) {
  const cols = block.columns;
  const totalWidth = cols.reduce((sum, c) => sum + c.width, 0);

  const updateColumnWidth = (index: number, width: number) => {
    const updated = cols.map((col, i) => i === index ? { ...col, width } : col);
    onUpdate({ columns: updated } as Partial<Block>);
  };

  const addColumn = () => {
    const newCol = { id: `col-${Date.now()}`, width: Math.round(100 / (cols.length + 1)), blocks: [] };
    // Redistribute widths evenly
    const evenWidth = Math.round(100 / (cols.length + 1));
    const updated = cols.map(col => ({ ...col, width: evenWidth }));
    updated.push(newCol);
    onUpdate({ columns: updated } as Partial<Block>);
  };

  const removeColumn = (index: number) => {
    if (cols.length <= 1) return;
    const removed = cols.filter((_, i) => i !== index);
    const evenWidth = Math.round(100 / removed.length);
    const updated = removed.map(col => ({ ...col, width: evenWidth }));
    onUpdate({ columns: updated } as Partial<Block>);
  };

  return (
    <div className="space-y-4">
      <SelectField label="Gap" value={block.gap || 'md'} options={['sm', 'md', 'lg']} onChange={(v) => onUpdate({ gap: v } as Partial<Block>)} />

      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground">Columns ({cols.length})</span>
          <button type="button" onClick={addColumn} className="text-xs text-primary hover:text-primary/80 font-medium">+ Add Column</button>
        </div>

        {/* Visual width bar */}
        <div className="flex gap-0.5 mb-3 h-8 rounded overflow-hidden border border-border">
          {cols.map((col, i) => (
            <div
              key={col.id}
              className="bg-primary/10 text-primary text-[10px] font-medium flex items-center justify-center relative group"
              style={{ width: `${(col.width / totalWidth) * 100}%` }}
            >
              {Math.round(col.width)}%
              {cols.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeColumn(i)}
                  className="absolute top-0 right-0 text-[8px] text-destructive/70 hover:text-destructive opacity-0 group-hover:opacity-100 p-0.5"
                  title="Remove column"
                >x</button>
              )}
            </div>
          ))}
        </div>

        {/* Per-column width sliders */}
        <div className="space-y-2">
          {cols.map((col, i) => (
            <div key={col.id} className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground w-8 shrink-0">Col {i + 1}</span>
              <input
                type="range"
                min={10}
                max={90}
                value={col.width}
                onChange={(e) => updateColumnWidth(i, Number(e.target.value))}
                className="flex-1 h-1.5 accent-primary"
              />
              <span className="text-[10px] text-muted-foreground w-8 text-right">{Math.round(col.width)}%</span>
            </div>
          ))}
        </div>
      </div>

      <CheckboxField label="Stack on mobile" checked={block.stackOnMobile !== false} onChange={(v) => onUpdate({ stackOnMobile: v } as Partial<Block>)} />
      <CheckboxField label="Reverse when stacked" checked={block.reverseOnStack === true} onChange={(v) => onUpdate({ reverseOnStack: v } as Partial<Block>)} />

      <p className="text-xs text-muted-foreground">{cols.reduce((sum, c) => sum + c.blocks.length, 0)} nested blocks total</p>
    </div>
  );
}

// ─── Reusable field components ───────────────────────────────────────────────

function Field({ label, value, onChange }: { label: string; value: string | undefined; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <input type="text" value={value || ''} onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full rounded border border-border px-2.5 py-1.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary" />
    </label>
  );
}

function TextareaField({ label, value, onChange, rows = 3 }: { label: string; value: string | undefined; onChange: (v: string) => void; rows?: number }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <textarea value={value || ''} onChange={(e) => onChange(e.target.value)} rows={rows}
        className="mt-1 block w-full rounded border border-border px-2.5 py-1.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary" />
    </label>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full rounded border border-border px-2.5 py-1.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary">
        {options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
      </select>
    </label>
  );
}

function CheckboxField({ label, checked, onChange }: { label: string; checked: boolean | undefined; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2">
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-border text-primary" />
      <span className="text-xs text-foreground">{label}</span>
    </label>
  );
}
