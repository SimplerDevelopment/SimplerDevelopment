'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  closestCenter,
  pointerWithin,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  useDroppable,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useVisualEditorParent } from '@/lib/visual-editor/useVisualEditorParent';
import { DynamicPropertyPanel } from './DynamicPropertyPanel';
import { StyleSettings } from '@/components/blocks/visual/StyleSettings';
import { findBlockById, findBlockPath, updateBlockById, removeBlockById, insertBlockInContainer, insertBlockAfter, getAllBlocks } from '@/lib/utils/blockHelpers';
import type { Block, BlockType, BlockStyle } from '@/types/blocks';
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

interface VisualEditorShellProps {
  blocks: Block[];
  selectedBlockId: string | null;
  iframeSrc: string;
  viewport?: 'desktop' | 'tablet' | 'mobile';
  onBlocksChange: (blocks: Block[]) => void;
  onSelectBlock: (blockId: string | null) => void;
  onAddBlock: (type: string, afterBlockId?: string) => void;
  onDeleteBlock: (blockId: string) => void;
  onUpdateBlock: (blockId: string, updates: Partial<Block>) => void;
}

// ─── Main Shell ──────────────────────────────────────────────────────────────

export function VisualEditorShell({
  blocks,
  selectedBlockId: selectedBlockIdProp,
  iframeSrc,
  viewport = 'desktop',
  onBlocksChange,
  onSelectBlock,
  onAddBlock,
  onDeleteBlock,
  onUpdateBlock,
}: VisualEditorShellProps) {
  const [internalSelectedBlockId, setInternalSelectedBlockId] = useState<string | null>(null);
  const selectedBlockId = selectedBlockIdProp ?? internalSelectedBlockId;
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerCategory, setPickerCategory] = useState<string | null>(null);
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
  });

  useEffect(() => { sendBlocksUpdate(blocks); }, [blocks, sendBlocksUpdate]);
  useEffect(() => { sendSelectBlock(selectedBlockId); }, [selectedBlockId, sendSelectBlock]);

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
    useSensor(PointerSensor, { activationConstraint: { distance: 12 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setDraggedBlockId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setDraggedBlockId(null);
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
    const ids = getAllBlocks(blocks).map(b => b.id);
    // Add drop zone IDs for containers
    for (const block of blocks) {
      if (block.type === 'columns') block.columns.forEach((_, i) => ids.push(`dropzone:${block.id}:${i}`));
      if (block.type === 'tabs') block.tabs.forEach((_, i) => ids.push(`dropzone:${block.id}:${i}`));
      if (block.type === 'section') ids.push(`dropzone:${block.id}:0`);
    }
    return ids;
  }, [blocks]);

  return (
    <div className="flex h-[calc(100vh-3rem)] overflow-hidden">
      {/* ── Left Panel ── */}
      <div className="w-60 flex-shrink-0 border-r border-gray-200 bg-gray-50 flex flex-col overflow-hidden">
        <div className="p-3 shrink-0">
          <button
            type="button"
            onClick={() => setPickerOpen(!pickerOpen)}
            className="w-full flex items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <span className="material-icons text-base">add</span>
            Add Block
          </button>
        </div>

        {pickerOpen && (
          <div className="px-3 pb-3 shrink-0">
            <div className="flex flex-wrap gap-1 mb-2">
              {categories.map((cat) => (
                <button type="button" key={cat} onClick={() => setPickerCategory(pickerCategory === cat ? null : cat)}
                  className={`px-2 py-0.5 text-xs rounded ${pickerCategory === cat ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >{cat}</button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-1">
              {allBlockTypes.filter((b) => !pickerCategory || b.category === pickerCategory).map((bt) => (
                <button type="button" key={bt.type} onClick={() => { onAddBlock(bt.type); setPickerOpen(false); }}
                  className="flex flex-col items-center gap-0.5 rounded border border-gray-200 bg-white p-1.5 text-center hover:border-blue-300 hover:bg-blue-50"
                >
                  <span className="material-icons text-base text-gray-600">{bt.icon}</span>
                  <span className="text-[10px] text-gray-700 leading-tight">{bt.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Layers — DnD sortable tree */}
        <div className="flex-1 overflow-y-auto border-t border-gray-200">
          <div className="px-3 py-2">
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-1">Layers</h3>
          </div>
          <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <SortableContext items={allBlockIds} strategy={verticalListSortingStrategy}>
              <div className="px-1 pb-2">
                {blocks.map((block) => (
                  <LayerItem
                    key={block.id}
                    block={block}
                    depth={0}
                    selectedBlockId={selectedBlockId}
                    onSelect={selectBlock}
                    onDelete={onDeleteBlock}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      </div>

      {/* ── Center — iframe ── */}
      <div className="flex-1 flex flex-col bg-gray-100">
        <div className="flex-1 flex items-start justify-center overflow-auto p-4">
          <div className="bg-white shadow-lg rounded-lg overflow-hidden transition-all" style={{ width: viewportWidth, maxWidth: '100%', height: '100%' }}>
            <iframe ref={iframeRef} src={iframeSrc} onLoad={handleIframeLoad} className="w-full h-full border-0" title="Visual Editor" />
          </div>
        </div>
      </div>

      {/* ── Right Panel — Property Editor ── */}
      <div className="w-80 flex-shrink-0 border-l border-gray-200 bg-white flex flex-col overflow-hidden">
        {selectedBlock ? (
          <>
            {/* Block header */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-2">
                <span className="material-icons text-base text-gray-400">{BLOCK_ICON_MAP[selectedBlock.type] || 'widgets'}</span>
                <span className="text-sm font-semibold text-gray-900 capitalize">{selectedBlock.type.replace('-', ' ')}</span>
              </div>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => onDeleteBlock(selectedBlock.id)} className="p-1 text-gray-400 hover:text-red-500" title="Delete">
                  <span className="material-icons text-base">delete</span>
                </button>
              </div>
            </div>

            {/* Content / Style tabs */}
            <div className="flex border-b border-gray-100 shrink-0">
              <button type="button" onClick={() => setRightPanelTab('content')}
                className={`flex-1 py-2 text-xs font-medium ${rightPanelTab === 'content' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
              >Content</button>
              <button type="button" onClick={() => setRightPanelTab('style')}
                className={`flex-1 py-2 text-xs font-medium ${rightPanelTab === 'style' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
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
          <div className="flex flex-col items-center justify-center h-full text-center p-6 text-gray-400">
            <span className="material-icons text-3xl mb-2">touch_app</span>
            <p className="text-sm">Click a block to edit</p>
          </div>
        )}
      </div>
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
}: {
  block: Block;
  depth: number;
  selectedBlockId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  // Only top-level items are sortable — nested items are plain clickable rows
  const sortable = depth === 0 ? useSortable({ id: block.id }) : null;
  const style = sortable
    ? { transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition || 'transform 200ms ease', opacity: sortable.isDragging ? 0.5 : 1 }
    : {};
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
    <div ref={sortable?.setNodeRef} style={style}>
      <div
        className={`group/layer flex items-center gap-1 rounded px-1 py-1 text-left text-xs cursor-pointer ${
          isSelected ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'
        }`}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
        onClick={() => onSelect(block.id)}
      >
        {/* Drag handle — only for sortable (top-level) items */}
        <span {...(sortable?.attributes || {})} {...(sortable?.listeners || {})} className={`material-icons text-xs shrink-0 ${sortable ? 'text-gray-300 cursor-grab' : 'text-gray-200'}`}>drag_indicator</span>

        {/* Expand toggle for containers */}
        {isContainer ? (
          <button type="button" onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            className="material-icons text-xs text-gray-400 shrink-0"
          >{expanded ? 'expand_more' : 'chevron_right'}</button>
        ) : (
          <span className="w-3 shrink-0" />
        )}

        <span className="material-icons text-xs shrink-0">{icon}</span>
        <span className="truncate flex-1">{previewText || block.type}</span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(block.id); }}
          className="material-icons text-xs text-gray-300 hover:text-red-500 opacity-0 group-hover/layer:opacity-100 transition-opacity shrink-0"
          title="Delete"
        >close</button>
      </div>

      {/* Nested children with drop zones */}
      {expanded && children.map((child, ci) => (
        <div key={ci}>
          <div className="text-[9px] text-gray-400 uppercase tracking-wider" style={{ paddingLeft: `${(depth + 1) * 12 + 20}px` }}>
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
          ? 'border-2 border-blue-400 bg-blue-50 text-blue-600 py-3 font-medium'
          : 'border border-dashed border-gray-300 text-gray-400 py-1.5'
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
          <p className="text-xs text-gray-500">Nested blocks: {block.blocks.length}. Edit via layers panel.</p>
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
        <p className="text-xs text-gray-500">Items: {block.items.length}. Use the style tab for visual customization.</p>
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
          <span className="text-xs font-medium text-gray-600">Columns ({cols.length})</span>
          <button type="button" onClick={addColumn} className="text-xs text-blue-600 hover:text-blue-800 font-medium">+ Add Column</button>
        </div>

        {/* Visual width bar */}
        <div className="flex gap-0.5 mb-3 h-8 rounded overflow-hidden border border-gray-200">
          {cols.map((col, i) => (
            <div
              key={col.id}
              className="bg-blue-100 text-blue-700 text-[10px] font-medium flex items-center justify-center relative group"
              style={{ width: `${(col.width / totalWidth) * 100}%` }}
            >
              {Math.round(col.width)}%
              {cols.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeColumn(i)}
                  className="absolute top-0 right-0 text-[8px] text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 p-0.5"
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
              <span className="text-[10px] text-gray-500 w-8 shrink-0">Col {i + 1}</span>
              <input
                type="range"
                min={10}
                max={90}
                value={col.width}
                onChange={(e) => updateColumnWidth(i, Number(e.target.value))}
                className="flex-1 h-1.5 accent-blue-600"
              />
              <span className="text-[10px] text-gray-500 w-8 text-right">{Math.round(col.width)}%</span>
            </div>
          ))}
        </div>
      </div>

      <CheckboxField label="Stack on mobile" checked={block.stackOnMobile !== false} onChange={(v) => onUpdate({ stackOnMobile: v } as Partial<Block>)} />
      <CheckboxField label="Reverse when stacked" checked={block.reverseOnStack === true} onChange={(v) => onUpdate({ reverseOnStack: v } as Partial<Block>)} />

      <p className="text-xs text-gray-400">{cols.reduce((sum, c) => sum + c.blocks.length, 0)} nested blocks total</p>
    </div>
  );
}

// ─── Reusable field components ───────────────────────────────────────────────

function Field({ label, value, onChange }: { label: string; value: string | undefined; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-600">{label}</span>
      <input type="text" value={value || ''} onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full rounded border border-gray-300 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
    </label>
  );
}

function TextareaField({ label, value, onChange, rows = 3 }: { label: string; value: string | undefined; onChange: (v: string) => void; rows?: number }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-600">{label}</span>
      <textarea value={value || ''} onChange={(e) => onChange(e.target.value)} rows={rows}
        className="mt-1 block w-full rounded border border-gray-300 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
    </label>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-600">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full rounded border border-gray-300 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500">
        {options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
      </select>
    </label>
  );
}

function CheckboxField({ label, checked, onChange }: { label: string; checked: boolean | undefined; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2">
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-gray-300 text-blue-600" />
      <span className="text-xs text-gray-700">{label}</span>
    </label>
  );
}
