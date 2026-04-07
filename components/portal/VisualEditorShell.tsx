'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  closestCenter,
  pointerWithin,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  PointerSensor,
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
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// No-op sorting strategy: items stay in place during drag, only reorder on drop
const noMovementStrategy = () => null;
import { useVisualEditorParent } from '@/lib/visual-editor/useVisualEditorParent';
import { DynamicPropertyPanel } from './DynamicPropertyPanel';
import { StyleSettings } from '@/components/blocks/visual/StyleSettings';
import { findBlockById, findBlockPath, updateBlockById, removeBlockById, insertBlockInContainer, insertBlockAfter, getAllBlocks } from '@/lib/utils/blockHelpers';
import { IconPicker } from './IconPicker';
import MediaPicker from '@/components/admin/MediaPicker';
import type { Block, BlockType, BlockStyle, ColumnsBlock } from '@/types/blocks';
import type { Breakpoint } from '@/types/responsive';
import type { ComponentManifestEntry } from '@/types/visual-editor';
import BrandingProfileSelector from '@/components/portal/BrandingProfileSelector';
import { RichTextEditable } from '@/components/blocks/visual/RichTextEditable';

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
  { type: 'hero-slideshow', label: 'Hero Slideshow', icon: 'slideshow', category: 'Components', description: 'Slideshow hero with multiple slides' },
  { type: 'marquee', label: 'Marquee', icon: 'text_rotation_none', category: 'Components', description: 'Scrolling text, images, or logos' },
  { type: 'cta', label: 'Call to Action', icon: 'campaign', category: 'Components', description: 'CTA section' },
  { type: 'card-grid', label: 'Card Grid', icon: 'grid_view', category: 'Components', description: 'Grid of cards' },
  { type: 'stats', label: 'Statistics', icon: 'bar_chart', category: 'Components', description: 'Stats display' },
  { type: 'testimonial', label: 'Testimonial', icon: 'rate_review', category: 'Components', description: 'Customer quote' },
  { type: 'featured-content', label: 'Featured', icon: 'star', category: 'Components', description: 'Featured content' },
  { type: 'services-grid', label: 'Services', icon: 'apps', category: 'Components', description: 'Services grid' },
  { type: 'product-grid', label: 'Product Grid', icon: 'storefront', category: 'eCommerce', description: 'Product listing grid' },
  { type: 'featured-products', label: 'Featured Products', icon: 'loyalty', category: 'eCommerce', description: 'Featured product showcase' },
  { type: 'product-categories', label: 'Categories', icon: 'category', category: 'eCommerce', description: 'Product category listing' },
  { type: 'shopping-cart', label: 'Shopping Cart', icon: 'shopping_cart', category: 'eCommerce', description: 'Cart widget' },
  { type: 'store-banner', label: 'Store Banner', icon: 'sell', category: 'eCommerce', description: 'Promotional banner' },
  { type: 'product-detail', label: 'Product Detail', icon: 'inventory_2', category: 'eCommerce', description: 'Single product page' },
  { type: 'booking', label: 'Booking', icon: 'calendar_month', category: 'Interactive', description: 'Embed a booking page' },
  { type: 'survey', label: 'Survey', icon: 'assignment', category: 'Interactive', description: 'Embed a survey form' },
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
  siteId?: number;
  initialZoom?: number;
  leftCollapsed?: boolean;
  rightCollapsed?: boolean;
  onLeftCollapsedChange?: (collapsed: boolean) => void;
  onRightCollapsedChange?: (collapsed: boolean) => void;
  brandingProfileId?: number | null;
  onBrandingProfileChange?: (profileId: number | null) => void;
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
  siteId,
  initialZoom,
  leftCollapsed: leftCollapsedProp,
  rightCollapsed: rightCollapsedProp,
  onLeftCollapsedChange,
  onRightCollapsedChange,
  brandingProfileId,
  onBrandingProfileChange,
}: VisualEditorShellProps) {
  const [internalSelectedBlockId, setInternalSelectedBlockId] = useState<string | null>(null);
  const [selectedBlockIds, setSelectedBlockIds] = useState<string[]>([]);
  const selectedBlockId = selectedBlockIdProp ?? internalSelectedBlockId;
  const [leftTab, setLeftTab] = useState<'layers' | 'add'>('layers');
  const [pickerCategory, setPickerCategory] = useState<string | null>(null);
  const [pickerSearch, setPickerSearch] = useState('');
  const [rightPanelTab, setRightPanelTab] = useState<'content' | 'style'>('content');
  const [leftCollapsedInternal, setLeftCollapsedInternal] = useState(leftCollapsedProp ?? false);
  const [rightCollapsedInternal, setRightCollapsedInternal] = useState(rightCollapsedProp ?? false);
  const leftCollapsed = leftCollapsedProp ?? leftCollapsedInternal;
  const rightCollapsed = rightCollapsedProp ?? rightCollapsedInternal;
  const setLeftCollapsed = useCallback((v: boolean | ((prev: boolean) => boolean)) => {
    const next = typeof v === 'function' ? v(leftCollapsed) : v;
    setLeftCollapsedInternal(next);
    onLeftCollapsedChange?.(next);
  }, [leftCollapsed, onLeftCollapsedChange]);
  const setRightCollapsed = useCallback((v: boolean | ((prev: boolean) => boolean)) => {
    const next = typeof v === 'function' ? v(rightCollapsed) : v;
    setRightCollapsedInternal(next);
    onRightCollapsedChange?.(next);
  }, [rightCollapsed, onRightCollapsedChange]);
  const [zoomLevel, setZoomLevel] = useState(initialZoom ?? 100);
  const canvasRef = useRef<HTMLDivElement>(null);

  const zoomIn = useCallback(() => setZoomLevel(z => Math.min(z + 10, 200)), []);
  const zoomOut = useCallback(() => setZoomLevel(z => Math.max(z - 10, 30)), []);
  const zoomReset = useCallback(() => setZoomLevel(100), []);

  // Scroll/trackpad: Ctrl+scroll = zoom, plain scroll = pan
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        // Zoom
        e.preventDefault();
        setZoomLevel(z => {
          const delta = e.deltaY > 0 ? -5 : 5;
          return Math.min(200, Math.max(30, z + delta));
        });
      } else {
        // Pan
        e.preventDefault();
        setPanOffset(p => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
      }
    };
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, []);

  // Pan offset for moving around the canvas
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0, startPanX: 0, startPanY: 0 });
  const spaceDownRef = useRef(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement)) {
        spaceDownRef.current = true;
        if (canvasRef.current) canvasRef.current.style.cursor = 'grab';
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceDownRef.current = false;
        if (canvasRef.current && !isPanning) canvasRef.current.style.cursor = '';
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isPanning]);

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (spaceDownRef.current || e.button === 1) {
      e.preventDefault();
      setIsPanning(true);
      panStartRef.current = { x: e.clientX, y: e.clientY, startPanX: panOffset.x, startPanY: panOffset.y };
      if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing';
    }
  }, [panOffset]);

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning) return;
    const dx = e.clientX - panStartRef.current.x;
    const dy = e.clientY - panStartRef.current.y;
    setPanOffset({ x: panStartRef.current.startPanX + dx, y: panStartRef.current.startPanY + dy });
  }, [isPanning]);

  const handleCanvasMouseUp = useCallback(() => {
    if (!isPanning) return;
    setIsPanning(false);
    if (canvasRef.current) canvasRef.current.style.cursor = spaceDownRef.current ? 'grab' : '';
  }, [isPanning]);

  // Track when a blocks change originated from the iframe to avoid echoing it back
  const iframeOriginatedRef = useRef(false);

  const selectBlock = useCallback((blockId: string, modifiers?: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean }) => {
    const multi = modifiers?.metaKey || modifiers?.ctrlKey || modifiers?.shiftKey;

    if (multi) {
      // Cmd/Ctrl+click or Shift+click: toggle block in/out of selection
      setSelectedBlockIds(prev => {
        const newIds = prev.includes(blockId) ? prev.filter(id => id !== blockId) : [...prev, blockId];
        setInternalSelectedBlockId(newIds.length > 0 ? newIds[newIds.length - 1] : null);
        return newIds;
      });
    } else {
      setInternalSelectedBlockId(blockId);
      setSelectedBlockIds(blockId ? [blockId] : []);
    }
    onSelectBlock(blockId);
  }, [onSelectBlock, blocks]);

  const handleBlockHovered = useCallback(() => {}, []);

  const [externalDragType, setExternalDragType] = useState<string | null>(null);

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
    sendExternalDragStart,
    sendExternalDragMove,
    sendExternalDragEnd,
    sendExternalDragCancel,
  } = useVisualEditorParent({
    blocks,
    selectedBlockId,
    onBlockClicked: selectBlock,
    onBlockHovered: handleBlockHovered,
    onBlocksReordered: (newBlocks: Block[]) => {
      iframeOriginatedRef.current = true;
      onBlocksChange(newBlocks);
    },
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
      iframeOriginatedRef.current = true;
      onBlocksChange(updated);
      selectBlock(newBlock.id);
    },
    onBlockResized: (blockId: string, width: string | undefined, height: string | undefined) => {
      const style: Record<string, string> = {};
      if (width) style.width = width;
      if (height) style.height = height;
      iframeOriginatedRef.current = true;
      handleUpdateBlock(blockId, { style: { ...(findBlockById(blocks, blockId)?.style || {}), ...style } } as Partial<Block>);
    },
    onBlockStyleUpdated: (blockId: string, style: Record<string, string>) => {
      iframeOriginatedRef.current = true;
      handleUpdateBlock(blockId, { style: { ...(findBlockById(blocks, blockId)?.style || {}), ...style } } as Partial<Block>);
    },
    onColumnResized: (blockId: string, columnWidths: number[]) => {
      const block = findBlockById(blocks, blockId) as ColumnsBlock | undefined;
      if (!block || block.type !== 'columns') return;
      const updatedColumns = block.columns.map((col, i) => ({
        ...col,
        width: columnWidths[i] ?? col.width,
      }));
      iframeOriginatedRef.current = true;
      handleUpdateBlock(blockId, { columns: updatedColumns } as Partial<Block>);
    },
    onGapChanged: (blockId: string, gap: 'sm' | 'md' | 'lg') => {
      iframeOriginatedRef.current = true;
      handleUpdateBlock(blockId, { gap } as Partial<Block>);
    },
    onBlockContentUpdated: (blockId: string, field: string, value: string) => {
      iframeOriginatedRef.current = true;
      if (field === '__add_array_item') {
        // Add a new item to an array field (cards, stats, images, services, items, tabs)
        const block = findBlockById(blocks, blockId);
        if (!block) return;
        const arrayField = value as string;
        const existing = (block as unknown as Record<string, unknown[]>)[arrayField] as unknown[] || [];
        const uid = `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const defaults: Record<string, unknown> = {
          cards: { id: uid, title: 'New card', description: '' },
          stats: { id: uid, value: '0', label: 'New stat' },
          images: { id: uid, url: '', alt: '' },
          services: { id: uid, title: 'New service', description: '' },
          items: { id: uid, title: 'New item', content: '' },
          tabs: { id: uid, label: 'New Tab', blocks: [] },
        };
        handleUpdateBlock(blockId, { [arrayField]: [...existing, defaults[arrayField] || { id: uid }] } as Partial<Block>);
      } else {
        handleUpdateBlock(blockId, { [field]: value } as Partial<Block>);
      }
    },
  });

  useEffect(() => {
    if (iframeOriginatedRef.current) {
      iframeOriginatedRef.current = false;
      return;
    }
    sendBlocksUpdate(blocks);
  }, [blocks, sendBlocksUpdate]);
  useEffect(() => { sendSelectBlock(selectedBlockId, selectedBlockIds); }, [selectedBlockId, selectedBlockIds, sendSelectBlock]);

  // Notify parent of undo/redo availability
  useEffect(() => {
    onUndoRedoChange?.({ sendUndo, sendRedo, canUndo: undoRedoState.canUndo, canRedo: undoRedoState.canRedo });
  }, [undoRedoState, sendUndo, sendRedo, onUndoRedoChange]);

  // Bulk actions for multi-select
  const isMultiSelect = selectedBlockIds.length > 1;

  const bulkDelete = useCallback(() => {
    let updated = [...blocks];
    for (const id of selectedBlockIds) {
      updated = updated.filter(b => b.id !== id);
      // Also remove from nested containers
      updated = updated.map(b => {
        if (b.type === 'columns') return { ...b, columns: (b as ColumnsBlock).columns.map(c => ({ ...c, blocks: c.blocks.filter(nb => !selectedBlockIds.includes(nb.id)) })) };
        if (b.type === 'section' && 'blocks' in b) return { ...b, blocks: (b as Block & { blocks: Block[] }).blocks.filter(nb => !selectedBlockIds.includes(nb.id)) };
        return b;
      }) as Block[];
    }
    iframeOriginatedRef.current = true;
    onBlocksChange(updated);
    setSelectedBlockIds([]);
    setInternalSelectedBlockId(null);
  }, [blocks, selectedBlockIds, onBlocksChange]);

  const bulkDuplicate = useCallback(() => {
    let updated = [...blocks];
    const newIds: string[] = [];
    for (const id of selectedBlockIds) {
      const block = findBlockById(blocks, id);
      if (block) {
        const dupId = `block-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const dup = { ...JSON.parse(JSON.stringify(block)), id: dupId } as Block;
        const idx = updated.findIndex(b => b.id === id);
        if (idx !== -1) {
          updated.splice(idx + 1, 0, dup);
          newIds.push(dupId);
        }
      }
    }
    iframeOriginatedRef.current = true;
    onBlocksChange(updated);
    setSelectedBlockIds(newIds);
  }, [blocks, selectedBlockIds, onBlocksChange]);

  const bulkGroup = useCallback(() => {
    const selectedBlocks = selectedBlockIds.map(id => findBlockById(blocks, id)).filter(Boolean) as Block[];
    if (selectedBlocks.length < 2) return;
    let updated = blocks.filter(b => !selectedBlockIds.includes(b.id));
    const section: Block = {
      id: `block-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: 'section',
      order: 0,
      blocks: selectedBlocks,
    } as Block;
    const firstIdx = blocks.findIndex(b => selectedBlockIds.includes(b.id));
    updated.splice(Math.min(firstIdx, updated.length), 0, section);
    iframeOriginatedRef.current = true;
    onBlocksChange(updated);
    setSelectedBlockIds([section.id]);
    setInternalSelectedBlockId(section.id);
  }, [blocks, selectedBlockIds, onBlocksChange]);

  const bulkUpdateStyle = useCallback((style: Partial<BlockStyle>) => {
    const updated = blocks.map(b => {
      if (selectedBlockIds.includes(b.id)) {
        return { ...b, style: { ...(b.style || {}), ...style } } as Block;
      }
      return b;
    });
    iframeOriginatedRef.current = true;
    onBlocksChange(updated);
  }, [blocks, selectedBlockIds, onBlocksChange]);

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

  const viewportWidth = { desktop: '1440px', tablet: '768px', mobile: '375px' }[viewport];
  const viewportHeight = { desktop: '810px', tablet: '900px', mobile: '900px' }[viewport];
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
      if (block.type === 'columns' && block.columns) block.columns.forEach((_, i) => ids.push(`dropzone:${block.id}:${i}`));
      if (block.type === 'tabs' && block.tabs) block.tabs.forEach((_, i) => ids.push(`dropzone:${block.id}:${i}`));
      if (block.type === 'section') ids.push(`dropzone:${block.id}:0`);
    }
    return ids;
  }, [blocks]);

  return (
    <div className="flex h-[calc(100vh-3rem)] overflow-hidden">
      {/* ── Left Panel ── */}
      {!previewMode && (
      <div className={`${leftCollapsed ? 'w-0' : 'w-60'} flex-shrink-0 transition-all duration-200 relative`}>
        {/* Collapse/expand toggle – vertically centered on panel edge */}
        <button
          onClick={() => setLeftCollapsed((v) => !v)}
          className="absolute top-1/2 -translate-y-1/2 -right-3.5 z-30 w-7 h-10 flex items-center justify-center rounded-r-md bg-muted border border-l-0 border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shadow-sm"
          title={leftCollapsed ? 'Expand panel' : 'Collapse panel'}
        >
          <span className="material-icons text-sm">{leftCollapsed ? 'chevron_right' : 'chevron_left'}</span>
        </button>
        <div className="h-full border-r border-border bg-muted flex flex-col overflow-hidden">
        {!leftCollapsed && (
        <>
        {/* Tab bar */}
        <div className="flex border-b border-border shrink-0">
          <button
            type="button"
            onClick={() => setLeftTab('layers')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${
              leftTab === 'layers' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="material-icons text-sm">layers</span>
            Layers
          </button>
          <button
            type="button"
            onClick={() => setLeftTab('add')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${
              leftTab === 'add' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="material-icons text-sm">add_circle_outline</span>
            Add Block
          </button>
        </div>

        {/* Branding profile selector */}
        {onBrandingProfileChange && (
          <div className="px-3 py-2 border-b border-border shrink-0">
            <BrandingProfileSelector
              value={brandingProfileId ?? null}
              onChange={onBrandingProfileChange}
              label="Brand Profile"
            />
          </div>
        )}

        {/* Add Block tab */}
        {leftTab === 'add' && (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="px-3 pt-3 pb-2 shrink-0">
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
              <div className="flex flex-wrap gap-1">
                {categories.map((cat) => (
                  <button type="button" key={cat} onClick={() => setPickerCategory(pickerCategory === cat ? null : cat)}
                    className={`px-2 py-0.5 text-xs rounded ${pickerCategory === cat ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground hover:bg-accent'}`}
                  >{cat}</button>
                ))}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-3">
              <div className="grid grid-cols-2 gap-1">
                {allBlockTypes
                  .filter((b) => !pickerCategory || b.category === pickerCategory)
                  .filter((b) => !pickerSearch || b.label.toLowerCase().includes(pickerSearch.toLowerCase()) || b.type.toLowerCase().includes(pickerSearch.toLowerCase()) || b.description.toLowerCase().includes(pickerSearch.toLowerCase()))
                  .map((bt) => (
                  <button type="button" key={bt.type}
                    onClick={() => {
                      // For custom components, create block with defaultProps from manifest
                      const manifest = customComponents.find(c => c.type === bt.type);
                      if (manifest?.defaultProps) {
                        const newBlock = {
                          id: `block-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                          type: bt.type,
                          order: blocks.length,
                          ...manifest.defaultProps,
                        } as Block;
                        iframeOriginatedRef.current = true;
                        onBlocksChange([...blocks, newBlock]);
                      } else {
                        onAddBlock(bt.type);
                      }
                      setLeftTab('layers'); setPickerSearch('');
                    }}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', bt.type);
                      e.dataTransfer.effectAllowed = 'copy';
                      setExternalDragType(bt.type);
                      sendExternalDragStart(bt.type);
                    }}
                    onDragEnd={() => {
                      setExternalDragType(null);
                      sendExternalDragCancel();
                    }}
                    className="flex flex-col items-center gap-0.5 rounded border border-border bg-card p-1.5 text-center hover:border-primary/30 hover:bg-primary/5 cursor-grab active:cursor-grabbing"
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

        {/* Layers tab */}
        {leftTab === 'layers' && (
          <div className="flex-1 overflow-y-auto">
            <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={handleDragStart} onDragOver={handleLayerDragOver} onDragEnd={handleDragEnd}>
              <SortableContext items={allBlockIds} strategy={noMovementStrategy}>
                <div className="px-1 py-2">
                  {blocks.map((block) => (
                    <LayerItem
                      key={block.id}
                      block={block}
                      depth={0}
                      selectedBlockId={selectedBlockId}
                      selectedBlockIds={selectedBlockIds}
                      onSelect={selectBlock}
                      onDelete={onDeleteBlock}
                      onUpdate={handleUpdateBlock}
                      showDropIndicator={!!draggedBlockId && layerOverId === block.id && draggedBlockId !== block.id}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
            {blocks.length === 0 && (
              <div className="px-3 py-8 text-center">
                <span className="material-icons text-2xl text-muted-foreground/50 mb-2 block">layers_clear</span>
                <p className="text-xs text-muted-foreground">No blocks yet</p>
                <button type="button" onClick={() => setLeftTab('add')} className="text-xs text-primary hover:text-primary/80 mt-1">
                  Add your first block
                </button>
              </div>
            )}
          </div>
        )}
        </>
        )}
        </div>
      </div>
      )}

      {/* ── Center — iframe ── */}
      <div className="flex-1 flex flex-col bg-muted relative">
        <div
          ref={canvasRef}
          className="flex-1 overflow-hidden relative"
          style={{ background: 'radial-gradient(circle, hsl(var(--muted-foreground) / 0.15) 1px, transparent 1px)', backgroundSize: '20px 20px' }}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={handleCanvasMouseUp}
        >
          <div
            style={{
              position: 'absolute',
              left: `${panOffset.x}px`,
              top: `${panOffset.y}px`,
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'center',
              padding: '24px',
              width: '100%',
            }}
          >
            <div
              className="overflow-hidden relative shadow-xl rounded-lg border border-border/50"
              style={{
                width: viewportWidth,
                height: viewportHeight,
                flexShrink: 0,
                transform: `scale(${zoomLevel / 100})`,
                transformOrigin: 'top center',
              }}
            >
            <iframe ref={iframeRef} src={iframeSrc} onLoad={handleIframeLoad} className="w-full h-full border-0" title="Visual Editor" />
            {/* Empty state overlay when all blocks have been deleted */}
            {blocks.length === 0 && !previewMode && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-card z-10">
                <span className="material-icons text-4xl text-muted-foreground/40 mb-3">layers_clear</span>
                <p className="text-sm font-medium text-muted-foreground mb-1">No blocks on this page</p>
                <p className="text-xs text-muted-foreground/70">Add blocks from the panel on the left</p>
              </div>
            )}
            {/* Overlay to capture drag events over iframe */}
            {externalDragType && (
              <div
                className="absolute inset-0 z-10"
                style={{ cursor: 'copy' }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'copy';
                  const iframe = iframeRef.current;
                  if (!iframe) return;
                  const rect = iframe.getBoundingClientRect();
                  const scale = zoomLevel / 100;
                  const x = (e.clientX - rect.left) / scale;
                  const y = (e.clientY - rect.top) / scale;
                  sendExternalDragMove(x, y);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const iframe = iframeRef.current;
                  if (!iframe) return;
                  const rect = iframe.getBoundingClientRect();
                  const scale = zoomLevel / 100;
                  const x = (e.clientX - rect.left) / scale;
                  const y = (e.clientY - rect.top) / scale;
                  sendExternalDragEnd(x, y);
                  setExternalDragType(null);
                  setLeftTab('layers');
                  setPickerSearch('');
                }}
                onDragLeave={(e) => {
                  // Only cancel if leaving the overlay entirely
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    sendExternalDragCancel();
                  }
                }}
              />
            )}
          </div>
          </div>
        </div>

        {/* Zoom controls — shown in both preview and edit modes */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-card/90 backdrop-blur border border-border rounded-lg px-2 py-1 shadow-lg z-10">
            <button type="button" onClick={zoomOut} className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={zoomLevel <= 30} title="Zoom out">
              <span className="material-icons text-sm">remove</span>
            </button>
            <button type="button" onClick={zoomReset} className="px-2 py-0.5 text-xs font-medium text-muted-foreground hover:text-foreground min-w-[3rem] text-center" title="Reset zoom">
              {zoomLevel}%
            </button>
            <button type="button" onClick={zoomIn} className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={zoomLevel >= 200} title="Zoom in">
              <span className="material-icons text-sm">add</span>
            </button>
          </div>
      </div>

      {/* ── Right Panel — Property Editor ── */}
      {!previewMode && (
      <div className={`${rightCollapsed ? 'w-0' : 'w-80'} flex-shrink-0 transition-all duration-200 relative`}>
        {/* Collapse/expand toggle – vertically centered on panel edge */}
        <button
          onClick={() => setRightCollapsed((v) => !v)}
          className="absolute top-1/2 -translate-y-1/2 -left-3.5 z-30 w-7 h-10 flex items-center justify-center rounded-l-md bg-card border border-r-0 border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shadow-sm"
          title={rightCollapsed ? 'Expand panel' : 'Collapse panel'}
        >
          <span className="material-icons text-sm">{rightCollapsed ? 'chevron_left' : 'chevron_right'}</span>
        </button>
        <div className="h-full border-l border-border bg-card flex flex-col overflow-hidden">
        {!rightCollapsed && (
        <>
        {isMultiSelect ? (
          /* ── Multi-select: bulk actions + full style editor ── */
          <div className="flex flex-col h-full">
            <div className="px-4 py-3 border-b border-border shrink-0">
              <div className="flex items-center gap-2">
                <span className="material-icons text-base text-primary">select_all</span>
                <span className="text-sm font-semibold text-foreground">{selectedBlockIds.length} blocks selected</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Shift+click to extend, {'\u2318'}+click to toggle
              </p>
            </div>

            {/* Bulk action buttons */}
            <div className="px-4 py-3 border-b border-border shrink-0">
              <div className="flex gap-2">
                <button type="button" onClick={bulkDuplicate} className="flex items-center gap-1.5 flex-1 justify-center rounded border border-border px-2 py-1.5 text-xs hover:bg-accent transition-colors">
                  <span className="material-icons text-sm text-muted-foreground">content_copy</span>
                  Duplicate
                </button>
                <button type="button" onClick={bulkGroup} className="flex items-center gap-1.5 flex-1 justify-center rounded border border-border px-2 py-1.5 text-xs hover:bg-accent transition-colors">
                  <span className="material-icons text-sm text-muted-foreground">crop_free</span>
                  Group
                </button>
                <button type="button" onClick={bulkDelete} className="flex items-center gap-1.5 justify-center rounded border border-border px-2 py-1.5 text-xs hover:bg-destructive/10 transition-colors">
                  <span className="material-icons text-sm text-destructive">delete</span>
                </button>
              </div>
            </div>

            {/* Full style editor — changes apply to all selected blocks */}
            <div className="flex-1 overflow-y-auto p-4">
              {selectedBlock && (
                <ElementStyleEditor
                  block={selectedBlock}
                  onChange={(updates) => {
                    // Merge updates into a single block, handling style, elementStyles, and responsive
                    const mergeUpdates = (block: Block, upd: Partial<Block>): Block => {
                      const merged = { ...block } as Record<string, unknown>;
                      // Merge style (shallow merge into existing)
                      if (upd.style) {
                        merged.style = { ...((block.style || {}) as Record<string, unknown>), ...upd.style };
                      }
                      // Merge elementStyles (per-element shallow merge)
                      if ((upd as Record<string, unknown>).elementStyles) {
                        const existing = (block as unknown as Record<string, unknown>).elementStyles as Record<string, Record<string, unknown>> || {};
                        const incoming = (upd as unknown as Record<string, unknown>).elementStyles as Record<string, Record<string, unknown>>;
                        const result = { ...existing };
                        for (const key of Object.keys(incoming)) {
                          result[key] = { ...(existing[key] || {}), ...incoming[key] };
                        }
                        merged.elementStyles = result;
                      }
                      // Merge responsive (per-property shallow merge)
                      if ((upd as Record<string, unknown>).responsive) {
                        const existing = (block as unknown as Record<string, unknown>).responsive as Record<string, unknown> || {};
                        const incoming = (upd as unknown as Record<string, unknown>).responsive as Record<string, unknown>;
                        const result = { ...existing };
                        for (const key of Object.keys(incoming)) {
                          result[key] = { ...((existing[key] as Record<string, unknown>) || {}), ...(incoming[key] as Record<string, unknown>) };
                        }
                        merged.responsive = result;
                      }
                      // Copy any other flat props (but not style/elementStyles/responsive which we already handled)
                      for (const key of Object.keys(upd)) {
                        if (key !== 'style' && key !== 'elementStyles' && key !== 'responsive') {
                          merged[key] = (upd as Record<string, unknown>)[key];
                        }
                      }
                      return merged as unknown as Block;
                    };

                    // Recursively apply merged updates to ALL selected blocks at any depth
                    const applyToTree = (blockList: Block[]): Block[] => {
                      return blockList.map(b => {
                        if (selectedBlockIds.includes(b.id)) {
                          return mergeUpdates(b, updates);
                        }
                        if (b.type === 'columns') {
                          const col = b as ColumnsBlock;
                          return { ...col, columns: col.columns.map(c => ({ ...c, blocks: applyToTree(c.blocks) })) } as Block;
                        }
                        if (b.type === 'section' && 'blocks' in b) {
                          const sec = b as Block & { blocks: Block[] };
                          return { ...sec, blocks: applyToTree(sec.blocks) } as Block;
                        }
                        if (b.type === 'tabs' && 'tabs' in b) {
                          const tabs = b as Block & { tabs: { id: string; label: string; blocks: Block[] }[] };
                          return { ...tabs, tabs: tabs.tabs.map(t => ({ ...t, blocks: applyToTree(t.blocks) })) } as Block;
                        }
                        return b;
                      });
                    };
                    const updatedBlocks = applyToTree(blocks);
                    onBlocksChange(updatedBlocks);
                  }}
                  currentViewport={currentViewport}
                />
              )}
            </div>
          </div>
        ) : selectedBlock ? (
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
                    values={{ ...selectedCustomManifest.defaultProps, ...(selectedBlock as unknown as Record<string, unknown>) }}
                    onChange={(name, value) => handleUpdateBlock(selectedBlock.id, { [name]: value } as Partial<Block>)}
                    siteId={siteId}
                  />
                ) : (
                  <BlockContentEditor block={selectedBlock} onUpdate={(updates) => handleUpdateBlock(selectedBlock.id, updates)} siteId={siteId} />
                )
              ) : (
                <ElementStyleEditor
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
        </>
        )}
        </div>
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
  selectedBlockIds = [],
  onSelect,
  onDelete,
  onUpdate,
  showDropIndicator = false,
}: {
  block: Block;
  depth: number;
  selectedBlockId: string | null;
  selectedBlockIds?: string[];
  onSelect: (id: string, modifiers?: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean }) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, updates: Partial<Block>) => void;
  showDropIndicator?: boolean;
}) {
  const sortable = useSortable({ id: block.id, transition: null });
  const style = { opacity: sortable.isDragging ? 0.3 : 1, transition: 'opacity 200ms' } as React.CSSProperties;
  const isSelected = selectedBlockIds.length > 1 ? selectedBlockIds.includes(block.id) : selectedBlockId === block.id;
  const icon = BLOCK_ICON_MAP[block.type] || 'widgets';
  const [expanded, setExpanded] = useState(true);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');

  // Get nested children
  const children: { label: string; blocks: Block[] }[] = [];
  if (block.type === 'columns' && block.columns) {
    block.columns.forEach((col, i) => children.push({ label: `Col ${i + 1}`, blocks: col.blocks || [] }));
  }
  if (block.type === 'tabs' && block.tabs) {
    block.tabs.forEach((tab) => children.push({ label: tab.label, blocks: tab.blocks || [] }));
  }
  if (block.type === 'section' && block.blocks) {
    children.push({ label: 'Content', blocks: block.blocks });
  }
  if (block.type === 'accordion' && block.items) {
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
        onClick={(e) => onSelect(block.id, { shiftKey: e.shiftKey, metaKey: e.metaKey, ctrlKey: e.ctrlKey })}
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
        {renaming ? (
          <input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={() => {
              if (renameValue.trim()) onUpdate(block.id, { label: renameValue.trim() } as Partial<Block>);
              setRenaming(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { if (renameValue.trim()) onUpdate(block.id, { label: renameValue.trim() } as Partial<Block>); setRenaming(false); }
              if (e.key === 'Escape') setRenaming(false);
              e.stopPropagation();
            }}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 min-w-0 bg-background border border-primary rounded px-1 py-0 text-xs text-foreground outline-none"
          />
        ) : (
          <span
            className="truncate flex-1"
            onDoubleClick={(e) => { e.stopPropagation(); setRenameValue(block.label || previewText || block.type); setRenaming(true); }}
            title="Double-click to rename"
          >
            {block.label || previewText || block.type}
          </span>
        )}
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
            <LayerItem key={nested.id} block={nested} depth={depth + 1} selectedBlockId={selectedBlockId} selectedBlockIds={selectedBlockIds} onSelect={onSelect} onDelete={onDelete} onUpdate={onUpdate} />
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

// ─── Element Style Editor (sub-tabs for multi-element blocks) ────────────────

const BLOCK_ELEMENTS: Record<string, { key: string; label: string }[]> = {
  hero: [
    { key: '_block', label: 'Block' },
    { key: 'title', label: 'Title' },
    { key: 'subtitle', label: 'Subtitle' },
    { key: 'description', label: 'Description' },
    { key: 'cta', label: 'CTA Button' },
  ],
  'hero-slideshow': [
    { key: '_block', label: 'Block' },
    { key: 'title', label: 'Slide Title' },
    { key: 'subtitle', label: 'Slide Subtitle' },
    { key: 'description', label: 'Slide Description' },
    { key: 'cta', label: 'Primary Button' },
    { key: 'secondaryCta', label: 'Secondary Button' },
  ],
  marquee: [
    { key: '_block', label: 'Block' },
    { key: 'text', label: 'Text Items' },
    { key: 'image', label: 'Image Items' },
    { key: 'icon', label: 'Icon Items' },
  ],
  cta: [
    { key: '_block', label: 'Block' },
    { key: 'title', label: 'Title' },
    { key: 'description', label: 'Description' },
    { key: 'primaryButton', label: 'Primary Button' },
    { key: 'secondaryButton', label: '2nd Button' },
  ],
  'card-grid': [
    { key: '_block', label: 'Block' },
    { key: 'title', label: 'Title' },
    { key: 'description', label: 'Description' },
    { key: 'card', label: 'Cards' },
    { key: 'cardTitle', label: 'Card Title' },
    { key: 'cardDescription', label: 'Card Text' },
  ],
  stats: [
    { key: '_block', label: 'Block' },
    { key: 'title', label: 'Title' },
    { key: 'statValue', label: 'Values' },
    { key: 'statLabel', label: 'Labels' },
  ],
  testimonial: [
    { key: '_block', label: 'Block' },
    { key: 'quote', label: 'Quote' },
    { key: 'author', label: 'Author' },
    { key: 'role', label: 'Role' },
  ],
  'services-grid': [
    { key: '_block', label: 'Block' },
    { key: 'title', label: 'Title' },
    { key: 'description', label: 'Description' },
    { key: 'card', label: 'Cards' },
  ],
  'featured-content': [
    { key: '_block', label: 'Block' },
    { key: 'title', label: 'Title' },
    { key: 'description', label: 'Description' },
    { key: 'button', label: 'Button' },
    { key: 'image', label: 'Image' },
  ],
  accordion: [
    { key: '_block', label: 'Block' },
    { key: 'itemTitle', label: 'Item Titles' },
    { key: 'itemContent', label: 'Item Content' },
  ],
  quote: [
    { key: '_block', label: 'Block' },
    { key: 'quoteText', label: 'Quote' },
    { key: 'author', label: 'Author' },
  ],
  'product-detail': [
    { key: '_block', label: 'Block' },
    { key: 'productName', label: 'Product Name' },
    { key: 'price', label: 'Price' },
    { key: 'comparePrice', label: 'Compare Price' },
    { key: 'shortDescription', label: 'Description' },
    { key: 'badge', label: 'Sale Badge' },
    { key: 'optionLabel', label: 'Option Label' },
    { key: 'optionButton', label: 'Option Button' },
    { key: 'addToCartButton', label: 'Add to Cart' },
    { key: 'breadcrumb', label: 'Breadcrumb' },
    { key: 'sku', label: 'SKU / Tags' },
    { key: 'sectionTitle', label: 'Section Titles' },
    { key: 'gallery', label: 'Gallery' },
  ],
  'booking': [
    { key: 'title', label: 'Title' },
    { key: 'description', label: 'Description' },
  ],
  'survey': [
    { key: 'title', label: 'Title' },
    { key: 'description', label: 'Description' },
  ],
};

function ElementStyleEditor({
  block,
  onChange,
  currentViewport,
}: {
  block: Block;
  onChange: (updates: Partial<Block>) => void;
  currentViewport: Breakpoint;
}) {
  const elements = BLOCK_ELEMENTS[block.type];
  const [activeElement, setActiveElement] = useState('_block');

  // Single-element blocks — just show StyleSettings directly
  if (!elements) {
    return (
      <StyleSettings
        block={block}
        onChange={onChange}
        currentViewport={currentViewport}
      />
    );
  }

  const isBlockLevel = activeElement === '_block';

  // Create a virtual block for element-level styling
  const elementStyle = !isBlockLevel ? (block.elementStyles?.[activeElement] || {}) : undefined;

  return (
    <div className="space-y-3">
      {/* Element sub-tabs */}
      <div className="flex flex-wrap gap-1">
        {elements.map((el) => (
          <button
            key={el.key}
            type="button"
            onClick={() => setActiveElement(el.key)}
            className={`px-2 py-1 text-[10px] font-medium rounded transition-colors ${
              activeElement === el.key
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80'
            }`}
          >
            {el.label}
          </button>
        ))}
      </div>

      {isBlockLevel ? (
        <StyleSettings
          block={block}
          onChange={onChange}
          currentViewport={currentViewport}
        />
      ) : (
        <StyleSettings
          block={{ ...block, style: (elementStyle || {}) as BlockStyle } as Block}
          onChange={(updates) => {
            // StyleSettings calls onChange with { style: { ...props } }
            // Map that to elementStyles[activeElement]
            if (updates.style) {
              const newElementStyles = { ...(block.elementStyles || {}) };
              newElementStyles[activeElement] = {
                ...(newElementStyles[activeElement] || {}),
                ...updates.style,
              };
              onChange({ elementStyles: newElementStyles } as Partial<Block>);
            }
          }}
          currentViewport={currentViewport}
        />
      )}
    </div>
  );
}

// ─── Block Content Editor ────────────────────────────────────────────────────

function BlockContentEditor({ block, onUpdate, siteId }: { block: Block; onUpdate: (updates: Partial<Block>) => void; siteId?: number }) {
  const b = block as unknown as Record<string, unknown>;
  const uid = () => `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const mediaApi = siteId ? `/api/portal/cms/websites/${siteId}/media` : '/api/media';

  return (
    <div className="space-y-3">
      {block.type === 'heading' && (
        <>
          <RichTextField label="Content" value={b.content as string} onChange={(v) => onUpdate({ content: v } as Partial<Block>)} singleLine />
          <SelectField label="Level" value={String(b.level || 2)} options={['1','2','3','4','5','6']} onChange={(v) => onUpdate({ level: Number(v) } as Partial<Block>)} />
          <SelectField label="Alignment" value={(b.alignment as string) || 'left'} options={['left','center','right']} onChange={(v) => onUpdate({ alignment: v } as Partial<Block>)} />
        </>
      )}
      {block.type === 'text' && (
        <>
          <RichTextField label="Content" value={b.content as string} onChange={(v) => onUpdate({ content: v } as Partial<Block>)} />
          <SelectField label="Size" value={(b.size as string) || 'base'} options={['sm','base','lg','xl']} onChange={(v) => onUpdate({ size: v } as Partial<Block>)} />
          <SelectField label="Alignment" value={(b.alignment as string) || 'left'} options={['left','center','right']} onChange={(v) => onUpdate({ alignment: v } as Partial<Block>)} />
        </>
      )}
      {block.type === 'image' && (
        <>
          <div><span className="text-xs font-medium text-muted-foreground">Image</span><MediaPicker value={b.url as string} onChange={(v) => onUpdate({ url: v } as Partial<Block>)} mimeTypeFilter="image" label="" apiEndpoint={mediaApi} /></div>
          <Field label="Alt Text" value={b.alt as string} onChange={(v) => onUpdate({ alt: v } as Partial<Block>)} />
          <Field label="Caption" value={b.caption as string} onChange={(v) => onUpdate({ caption: v } as Partial<Block>)} />
          <SelectField label="Width" value={(b.width as string) || 'full'} options={['small','medium','large','full']} onChange={(v) => onUpdate({ width: v } as Partial<Block>)} />
          <SelectField label="Alignment" value={(b.alignment as string) || 'center'} options={['left','center','right']} onChange={(v) => onUpdate({ alignment: v } as Partial<Block>)} />
        </>
      )}
      {block.type === 'button' && (
        <>
          <Field label="Text" value={b.text as string} onChange={(v) => onUpdate({ text: v } as Partial<Block>)} />
          <Field label="URL" value={b.url as string} onChange={(v) => onUpdate({ url: v } as Partial<Block>)} />
          <SelectField label="Variant" value={(b.variant as string) || 'primary'} options={['primary','secondary','outline']} onChange={(v) => onUpdate({ variant: v } as Partial<Block>)} />
          <SelectField label="Size" value={(b.size as string) || 'md'} options={['sm','md','lg']} onChange={(v) => onUpdate({ size: v } as Partial<Block>)} />
          <SelectField label="Alignment" value={(b.alignment as string) || 'left'} options={['left','center','right']} onChange={(v) => onUpdate({ alignment: v } as Partial<Block>)} />
          <CheckboxField label="Open in new tab" checked={b.openInNewTab as boolean} onChange={(v) => onUpdate({ openInNewTab: v } as Partial<Block>)} />
        </>
      )}
      {block.type === 'quote' && (
        <>
          <RichTextField label="Quote" value={b.content as string} onChange={(v) => onUpdate({ content: v } as Partial<Block>)} />
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
      {block.type === 'youtube' && (
        <>
          <Field label="URL" value={b.url as string} onChange={(v) => onUpdate({ url: v } as Partial<Block>)} />
          <Field label="Caption" value={b.caption as string} onChange={(v) => onUpdate({ caption: v } as Partial<Block>)} />
        </>
      )}
      {block.type === 'video' && (
        <>
          <div><span className="text-xs font-medium text-muted-foreground">Video</span><MediaPicker value={b.url as string} onChange={(v) => onUpdate({ url: v } as Partial<Block>)} mimeTypeFilter="video" label="" apiEndpoint={mediaApi} /></div>
          <Field label="Caption" value={b.caption as string} onChange={(v) => onUpdate({ caption: v } as Partial<Block>)} />
          <CheckboxField label="Autoplay" checked={b.autoplay as boolean} onChange={(v) => onUpdate({ autoplay: v } as Partial<Block>)} />
          <CheckboxField label="Show Controls" checked={b.controls as boolean ?? true} onChange={(v) => onUpdate({ controls: v } as Partial<Block>)} />
        </>
      )}
      {block.type === 'hero' && (
        <>
          <RichTextField label="Title" value={b.title as string} onChange={(v) => onUpdate({ title: v } as Partial<Block>)} singleLine />
          <RichTextField label="Subtitle" value={b.subtitle as string} onChange={(v) => onUpdate({ subtitle: v } as Partial<Block>)} singleLine />
          <RichTextField label="Description" value={b.description as string} onChange={(v) => onUpdate({ description: v } as Partial<Block>)} />
          <Field label="CTA Text" value={b.ctaText as string} onChange={(v) => onUpdate({ ctaText: v } as Partial<Block>)} />
          <Field label="CTA Link" value={b.ctaLink as string} onChange={(v) => onUpdate({ ctaLink: v } as Partial<Block>)} />
          <Field label="2nd CTA Text" value={b.secondaryCtaText as string} onChange={(v) => onUpdate({ secondaryCtaText: v } as Partial<Block>)} />
          <Field label="2nd CTA Link" value={b.secondaryCtaLink as string} onChange={(v) => onUpdate({ secondaryCtaLink: v } as Partial<Block>)} />
          <div><span className="text-xs font-medium text-muted-foreground">Background Image</span><MediaPicker value={b.backgroundImage as string} onChange={(v) => onUpdate({ backgroundImage: v } as Partial<Block>)} mimeTypeFilter="image" label="" apiEndpoint={mediaApi} /></div>
          <div><span className="text-xs font-medium text-muted-foreground">Background Video</span><MediaPicker value={b.backgroundVideo as string} onChange={(v) => onUpdate({ backgroundVideo: v } as Partial<Block>)} mimeTypeFilter="video" label="" apiEndpoint={mediaApi} /></div>
        </>
      )}
      {block.type === 'marquee' && (
        <MarqueeEditor block={block} onUpdate={onUpdate} siteId={siteId} />
      )}
      {block.type === 'hero-slideshow' && (
        <HeroSlideshowEditor block={block} onUpdate={onUpdate} siteId={siteId} />
      )}
      {block.type === 'cta' && (
        <>
          <RichTextField label="Title" value={b.title as string} onChange={(v) => onUpdate({ title: v } as Partial<Block>)} singleLine />
          <RichTextField label="Description" value={b.description as string} onChange={(v) => onUpdate({ description: v } as Partial<Block>)} />
          <Field label="Button Text" value={b.primaryButtonText as string} onChange={(v) => onUpdate({ primaryButtonText: v } as Partial<Block>)} />
          <Field label="Button URL" value={b.primaryButtonUrl as string} onChange={(v) => onUpdate({ primaryButtonUrl: v } as Partial<Block>)} />
          <Field label="2nd Button Text" value={b.secondaryButtonText as string} onChange={(v) => onUpdate({ secondaryButtonText: v } as Partial<Block>)} />
          <Field label="2nd Button URL" value={b.secondaryButtonUrl as string} onChange={(v) => onUpdate({ secondaryButtonUrl: v } as Partial<Block>)} />
          <SelectField label="Background" value={(b.backgroundStyle as string) || 'none'} options={['none','solid','gradient']} onChange={(v) => onUpdate({ backgroundStyle: v } as Partial<Block>)} />
        </>
      )}
      {block.type === 'testimonial' && (
        <>
          <RichTextField label="Quote" value={b.quote as string} onChange={(v) => onUpdate({ quote: v } as Partial<Block>)} />
          <Field label="Author" value={b.author as string} onChange={(v) => onUpdate({ author: v } as Partial<Block>)} />
          <Field label="Role" value={b.role as string} onChange={(v) => onUpdate({ role: v } as Partial<Block>)} />
          <Field label="Company" value={b.company as string} onChange={(v) => onUpdate({ company: v } as Partial<Block>)} />
          <div><span className="text-xs font-medium text-muted-foreground">Avatar</span><MediaPicker value={b.avatar as string} onChange={(v) => onUpdate({ avatar: v } as Partial<Block>)} mimeTypeFilter="image" label="" apiEndpoint={mediaApi} /></div>
        </>
      )}
      {block.type === 'columns' && (
        <ColumnsEditor block={block} onUpdate={onUpdate} />
      )}
      {block.type === 'section' && (
        <>
          <Field label="Background Color" value={b.backgroundColor as string} onChange={(v) => onUpdate({ backgroundColor: v } as Partial<Block>)} />
          <div><span className="text-xs font-medium text-muted-foreground">Background Image</span><MediaPicker value={b.backgroundImage as string} onChange={(v) => onUpdate({ backgroundImage: v } as Partial<Block>)} mimeTypeFilter="image" label="" apiEndpoint={mediaApi} /></div>
          <Field label="Max Width" value={b.maxWidth as string} onChange={(v) => onUpdate({ maxWidth: v } as Partial<Block>)} />
          <Field label="Text Color" value={b.color as string} onChange={(v) => onUpdate({ color: v } as Partial<Block>)} />
          <Field label="Font Family" value={b.fontFamily as string} onChange={(v) => onUpdate({ fontFamily: v } as Partial<Block>)} />
          <SelectField label="HTML Tag" value={(b.htmlTag as string) || 'section'} options={['section','div','article','aside','header','footer']} onChange={(v) => onUpdate({ htmlTag: v } as Partial<Block>)} />
          <p className="text-xs text-muted-foreground mt-2">Nested blocks: {block.blocks.length}. Edit via layers panel.</p>
        </>
      )}

      {/* ── Stats Block — with item editor ── */}
      {block.type === 'stats' && (
        <>
          <RichTextField label="Title" value={b.title as string} onChange={(v) => onUpdate({ title: v } as Partial<Block>)} singleLine />
          <SelectField label="Columns" value={String(b.columns || 3)} options={['2','3','4']} onChange={(v) => onUpdate({ columns: Number(v) } as Partial<Block>)} />
          <ListEditor
            label="Stats"
            items={(block.stats || []).map(s => ({ id: s.id, fields: { value: s.value, label: s.label } }))}
            fieldDefs={[{ name: 'value', label: 'Value', placeholder: '100+' }, { name: 'label', label: 'Label', placeholder: 'Clients' }]}
            onAdd={() => onUpdate({ stats: [...(block.stats || []), { id: uid(), value: '0', label: 'New stat' }] } as Partial<Block>)}
            onRemove={(id) => onUpdate({ stats: block.stats.filter(s => s.id !== id) } as Partial<Block>)}
            onItemChange={(id, field, value) => onUpdate({ stats: block.stats.map(s => s.id === id ? { ...s, [field]: value } : s) } as Partial<Block>)}
            onReorder={(ids) => onUpdate({ stats: ids.map(id => block.stats.find(s => s.id === id)!).filter(Boolean) } as Partial<Block>)}
          />
        </>
      )}

      {/* ── Card Grid Block — with card editor ── */}
      {block.type === 'card-grid' && (
        <>
          <RichTextField label="Title" value={b.title as string} onChange={(v) => onUpdate({ title: v } as Partial<Block>)} singleLine />
          <RichTextField label="Description" value={b.description as string} onChange={(v) => onUpdate({ description: v } as Partial<Block>)} />
          <SelectField label="Columns" value={String(b.columns || 3)} options={['2','3','4']} onChange={(v) => onUpdate({ columns: Number(v) } as Partial<Block>)} />
          <NumberField label="Icon Size (px)" value={Number(b.iconSize) || 24} onChange={(v) => onUpdate({ iconSize: String(v) } as Partial<Block>)} min={12} max={128} />
          <ListEditor
            label="Cards"
            items={(block.cards || []).map(c => ({ id: c.id, fields: { title: c.title, description: c.description, icon: c.icon || '', image: c.image || '', link: c.link || '' } }))}
            fieldDefs={[
              { name: 'title', label: 'Title', placeholder: 'Card title' },
              { name: 'description', label: 'Description', placeholder: 'Card description', multiline: true },
              { name: 'icon', label: 'Icon', type: 'icon' as const },
              { name: 'image', label: 'Image', type: 'image' as const },
              { name: 'link', label: 'Link', placeholder: 'https://...' },
            ]}
            onAdd={() => onUpdate({ cards: [...(block.cards || []), { id: uid(), title: 'New card', description: '' }] } as Partial<Block>)}
            onRemove={(id) => onUpdate({ cards: block.cards.filter(c => c.id !== id) } as Partial<Block>)}
            onItemChange={(id, field, value) => onUpdate({ cards: block.cards.map(c => c.id === id ? { ...c, [field]: value } : c) } as Partial<Block>)}
            onReorder={(ids) => onUpdate({ cards: ids.map(id => block.cards.find(c => c.id === id)!).filter(Boolean) } as Partial<Block>)}
          />
        </>
      )}

      {/* ── Gallery Block — with image editor ── */}
      {block.type === 'gallery' && (
        <>
          <SelectField label="Layout" value={(b.layout as string) || 'grid'} options={['grid','masonry']} onChange={(v) => onUpdate({ layout: v } as Partial<Block>)} />
          <SelectField label="Columns" value={String(b.columns || 3)} options={['2','3','4']} onChange={(v) => onUpdate({ columns: Number(v) } as Partial<Block>)} />
          <CheckboxField label="Enable Lightbox" checked={b.lightbox as boolean} onChange={(v) => onUpdate({ lightbox: v } as Partial<Block>)} />
          <ListEditor
            label="Images"
            items={(block.images || []).map(img => ({ id: img.id, fields: { url: img.url, alt: img.alt, caption: img.caption || '' } }))}
            fieldDefs={[
              { name: 'url', label: 'Image', type: 'image' as const },
              { name: 'alt', label: 'Alt', placeholder: 'Image description' },
              { name: 'caption', label: 'Caption', placeholder: 'Optional caption' },
            ]}
            onAdd={() => onUpdate({ images: [...(block.images || []), { id: uid(), url: '', alt: '' }] } as Partial<Block>)}
            onRemove={(id) => onUpdate({ images: block.images.filter(i => i.id !== id) } as Partial<Block>)}
            onItemChange={(id, field, value) => onUpdate({ images: block.images.map(i => i.id === id ? { ...i, [field]: value } : i) } as Partial<Block>)}
            onReorder={(ids) => onUpdate({ images: ids.map(id => block.images.find(i => i.id === id)!).filter(Boolean) } as Partial<Block>)}
          />
        </>
      )}

      {/* ── Services Grid Block — with service editor ── */}
      {block.type === 'services-grid' && (
        <>
          <RichTextField label="Title" value={b.title as string} onChange={(v) => onUpdate({ title: v } as Partial<Block>)} singleLine />
          <RichTextField label="Description" value={b.description as string} onChange={(v) => onUpdate({ description: v } as Partial<Block>)} />
          <SelectField label="Columns" value={String(b.columns || 3)} options={['2','3','4']} onChange={(v) => onUpdate({ columns: Number(v) } as Partial<Block>)} />
          <ListEditor
            label="Services"
            items={(block.services || []).map(s => ({ id: s.id, fields: { title: s.title, description: s.description, icon: s.icon || '', link: s.link || '' } }))}
            fieldDefs={[
              { name: 'title', label: 'Title', placeholder: 'Service name' },
              { name: 'description', label: 'Description', placeholder: 'Service description', multiline: true },
              { name: 'icon', label: 'Icon', type: 'icon' as const },
              { name: 'link', label: 'Link', placeholder: 'https://...' },
            ]}
            onAdd={() => onUpdate({ services: [...(block.services || []), { id: uid(), title: 'New service', description: '' }] } as Partial<Block>)}
            onRemove={(id) => onUpdate({ services: block.services.filter(s => s.id !== id) } as Partial<Block>)}
            onItemChange={(id, field, value) => onUpdate({ services: block.services.map(s => s.id === id ? { ...s, [field]: value } : s) } as Partial<Block>)}
            onReorder={(ids) => onUpdate({ services: ids.map(id => block.services.find(s => s.id === id)!).filter(Boolean) } as Partial<Block>)}
          />
        </>
      )}

      {/* ── Accordion Block — with item editor ── */}
      {block.type === 'accordion' && (
        <>
          <RichTextField label="Title" value={b.title as string} onChange={(v) => onUpdate({ title: v } as Partial<Block>)} singleLine />
          <ListEditor
            label="Items"
            items={(block.items || []).map(item => ({ id: item.id, fields: { title: item.title, content: item.content } }))}
            fieldDefs={[
              { name: 'title', label: 'Title', placeholder: 'Section title' },
              { name: 'content', label: 'Content', placeholder: 'Section content', multiline: true },
            ]}
            onAdd={() => onUpdate({ items: [...(block.items || []), { id: uid(), title: 'New section', content: '' }] } as Partial<Block>)}
            onRemove={(id) => onUpdate({ items: block.items.filter(i => i.id !== id) } as Partial<Block>)}
            onItemChange={(id, field, value) => onUpdate({ items: block.items.map(i => i.id === id ? { ...i, [field]: value } : i) } as Partial<Block>)}
            onReorder={(ids) => onUpdate({ items: ids.map(id => block.items.find(i => i.id === id)!).filter(Boolean) } as Partial<Block>)}
          />
        </>
      )}

      {/* ── Tabs Block — with tab editor ── */}
      {block.type === 'tabs' && (
        <>
          <ListEditor
            label="Tabs"
            items={(block.tabs || []).map(tab => ({ id: tab.id, fields: { label: tab.label } }))}
            fieldDefs={[{ name: 'label', label: 'Tab Label', placeholder: 'Tab name' }]}
            onAdd={() => onUpdate({ tabs: [...(block.tabs || []), { id: uid(), label: 'New Tab', blocks: [] }] } as Partial<Block>)}
            onRemove={(id) => onUpdate({ tabs: block.tabs.filter(t => t.id !== id) } as Partial<Block>)}
            onItemChange={(id, field, value) => onUpdate({ tabs: block.tabs.map(t => t.id === id ? { ...t, [field]: value } : t) } as Partial<Block>)}
            onReorder={(ids) => onUpdate({ tabs: ids.map(id => block.tabs.find(t => t.id === id)!).filter(Boolean) } as Partial<Block>)}
          />
          <p className="text-xs text-muted-foreground">Edit tab content via the layers panel.</p>
        </>
      )}

      {/* ── Featured Content Block ── */}
      {block.type === 'featured-content' && (
        <>
          <RichTextField label="Title" value={b.title as string} onChange={(v) => onUpdate({ title: v } as Partial<Block>)} singleLine />
          <RichTextField label="Description" value={b.description as string} onChange={(v) => onUpdate({ description: v } as Partial<Block>)} />
          <div><span className="text-xs font-medium text-muted-foreground">Image</span><MediaPicker value={b.imageUrl as string} onChange={(v) => onUpdate({ imageUrl: v } as Partial<Block>)} mimeTypeFilter="image" label="" apiEndpoint={mediaApi} /></div>
          <SelectField label="Image Position" value={(b.imagePosition as string) || 'right'} options={['left','right']} onChange={(v) => onUpdate({ imagePosition: v } as Partial<Block>)} />
          <Field label="Button Text" value={b.buttonText as string} onChange={(v) => onUpdate({ buttonText: v } as Partial<Block>)} />
          <Field label="Button URL" value={b.buttonUrl as string} onChange={(v) => onUpdate({ buttonUrl: v } as Partial<Block>)} />
        </>
      )}

      {/* ── Blog Posts Block ── */}
      {block.type === 'blog-posts' && (
        <>
          <RichTextField label="Title" value={b.title as string} onChange={(v) => onUpdate({ title: v } as Partial<Block>)} singleLine />
          <RichTextField label="Description" value={b.description as string} onChange={(v) => onUpdate({ description: v } as Partial<Block>)} />
          <Field label="Post Type" value={b.postType as string} onChange={(v) => onUpdate({ postType: v } as Partial<Block>)} />
          <Field label="Category Slug" value={b.categorySlug as string} onChange={(v) => onUpdate({ categorySlug: v } as Partial<Block>)} />
          <SelectField label="Limit" value={String(b.limit || 6)} options={['3','6','9','12']} onChange={(v) => onUpdate({ limit: Number(v) } as Partial<Block>)} />
          <SelectField label="Columns" value={String(b.columns || 3)} options={['2','3']} onChange={(v) => onUpdate({ columns: Number(v) } as Partial<Block>)} />
          <CheckboxField label="Show Excerpt" checked={b.showExcerpt as boolean ?? true} onChange={(v) => onUpdate({ showExcerpt: v } as Partial<Block>)} />
        </>
      )}

      {/* ── Product Grid Block ── */}
      {block.type === 'product-grid' && (
        <>
          <RichTextField label="Title" value={b.title as string} onChange={(v) => onUpdate({ title: v } as Partial<Block>)} singleLine />
          <RichTextField label="Description" value={b.description as string} onChange={(v) => onUpdate({ description: v } as Partial<Block>)} />
          <Field label="Category Slug" value={b.categorySlug as string} onChange={(v) => onUpdate({ categorySlug: v } as Partial<Block>)} />
          <SelectField label="Sort" value={(b.sort as string) || 'newest'} options={['newest','price_asc','price_desc','featured']} onChange={(v) => onUpdate({ sort: v } as Partial<Block>)} />
          <SelectField label="Limit" value={String(b.limit || 6)} options={['3','6','9','12']} onChange={(v) => onUpdate({ limit: Number(v) } as Partial<Block>)} />
          <SelectField label="Columns" value={String(b.columns || 3)} options={['2','3','4']} onChange={(v) => onUpdate({ columns: Number(v) } as Partial<Block>)} />
          <CheckboxField label="Show Price" checked={b.showPrice as boolean ?? true} onChange={(v) => onUpdate({ showPrice: v } as Partial<Block>)} />
          <CheckboxField label="Show Description" checked={b.showDescription as boolean} onChange={(v) => onUpdate({ showDescription: v } as Partial<Block>)} />
          <CheckboxField label="Show Category" checked={b.showCategory as boolean} onChange={(v) => onUpdate({ showCategory: v } as Partial<Block>)} />
          <Field label="Button Text" value={b.buttonText as string} onChange={(v) => onUpdate({ buttonText: v } as Partial<Block>)} />
        </>
      )}

      {/* ── Featured Products Block ── */}
      {block.type === 'featured-products' && (
        <>
          <RichTextField label="Title" value={b.title as string} onChange={(v) => onUpdate({ title: v } as Partial<Block>)} singleLine />
          <RichTextField label="Description" value={b.description as string} onChange={(v) => onUpdate({ description: v } as Partial<Block>)} />
          <SelectField label="Limit" value={String(b.limit || 4)} options={['2','3','4','6','8']} onChange={(v) => onUpdate({ limit: Number(v) } as Partial<Block>)} />
          <SelectField label="Columns" value={String(b.columns || 4)} options={['2','3','4']} onChange={(v) => onUpdate({ columns: Number(v) } as Partial<Block>)} />
          <SelectField label="Layout" value={(b.layout as string) || 'grid'} options={['grid','carousel']} onChange={(v) => onUpdate({ layout: v } as Partial<Block>)} />
          <CheckboxField label="Show Price" checked={b.showPrice as boolean ?? true} onChange={(v) => onUpdate({ showPrice: v } as Partial<Block>)} />
          <CheckboxField label="Show Badge" checked={b.showBadge as boolean} onChange={(v) => onUpdate({ showBadge: v } as Partial<Block>)} />
          <Field label="Badge Text" value={b.badgeText as string} onChange={(v) => onUpdate({ badgeText: v } as Partial<Block>)} />
          <Field label="Button Text" value={b.buttonText as string} onChange={(v) => onUpdate({ buttonText: v } as Partial<Block>)} />
        </>
      )}

      {/* ── Product Categories Block ── */}
      {block.type === 'product-categories' && (
        <>
          <RichTextField label="Title" value={b.title as string} onChange={(v) => onUpdate({ title: v } as Partial<Block>)} singleLine />
          <RichTextField label="Description" value={b.description as string} onChange={(v) => onUpdate({ description: v } as Partial<Block>)} />
          <SelectField label="Columns" value={String(b.columns || 3)} options={['2','3','4']} onChange={(v) => onUpdate({ columns: Number(v) } as Partial<Block>)} />
          <SelectField label="Layout" value={(b.layout as string) || 'grid'} options={['grid','list']} onChange={(v) => onUpdate({ layout: v } as Partial<Block>)} />
          <CheckboxField label="Show Product Count" checked={b.showProductCount as boolean ?? true} onChange={(v) => onUpdate({ showProductCount: v } as Partial<Block>)} />
          <CheckboxField label="Show Image" checked={b.showImage as boolean ?? true} onChange={(v) => onUpdate({ showImage: v } as Partial<Block>)} />
        </>
      )}

      {/* ── Shopping Cart Block ── */}
      {block.type === 'shopping-cart' && (
        <>
          <SelectField label="Variant" value={(b.variant as string) || 'full'} options={['full','mini','icon-only']} onChange={(v) => onUpdate({ variant: v } as Partial<Block>)} />
          <CheckboxField label="Show Subtotal" checked={b.showSubtotal as boolean ?? true} onChange={(v) => onUpdate({ showSubtotal: v } as Partial<Block>)} />
          <Field label="Checkout Button Text" value={b.checkoutButtonText as string} onChange={(v) => onUpdate({ checkoutButtonText: v } as Partial<Block>)} />
          <Field label="Empty Cart Message" value={b.emptyCartMessage as string} onChange={(v) => onUpdate({ emptyCartMessage: v } as Partial<Block>)} />
        </>
      )}

      {/* ── Store Banner Block ── */}
      {block.type === 'store-banner' && (
        <>
          <RichTextField label="Title" value={b.title as string} onChange={(v) => onUpdate({ title: v } as Partial<Block>)} singleLine />
          <RichTextField label="Subtitle" value={b.subtitle as string} onChange={(v) => onUpdate({ subtitle: v } as Partial<Block>)} singleLine />
          <Field label="Discount Code" value={b.discountCode as string} onChange={(v) => onUpdate({ discountCode: v } as Partial<Block>)} />
          <Field label="Button Text" value={b.buttonText as string} onChange={(v) => onUpdate({ buttonText: v } as Partial<Block>)} />
          <Field label="Button URL" value={b.buttonUrl as string} onChange={(v) => onUpdate({ buttonUrl: v } as Partial<Block>)} />
          <div><span className="text-xs font-medium text-muted-foreground">Background Image</span><MediaPicker value={b.backgroundImage as string} onChange={(v) => onUpdate({ backgroundImage: v } as Partial<Block>)} mimeTypeFilter="image" label="" apiEndpoint={mediaApi} /></div>
          <SelectField label="Background Style" value={(b.backgroundStyle as string) || 'gradient'} options={['gradient','solid','image']} onChange={(v) => onUpdate({ backgroundStyle: v } as Partial<Block>)} />
          <Field label="Accent Color" value={b.accentColor as string} onChange={(v) => onUpdate({ accentColor: v } as Partial<Block>)} />
          <Field label="Countdown Date" value={b.countdownDate as string} onChange={(v) => onUpdate({ countdownDate: v } as Partial<Block>)} />
        </>
      )}

      {/* ── Product Detail Block ── */}
      {block.type === 'product-detail' && (
        <>
          <ProductSlugPicker siteId={siteId} value={b.productSlug as string} onChange={(v) => onUpdate({ productSlug: v } as Partial<Block>)} />
          <SelectField label="Layout" value={(b.layout as string) || 'standard'} options={['standard','compact','wide']} onChange={(v) => onUpdate({ layout: v } as Partial<Block>)} />
          <CheckboxField label="Show Image Gallery" checked={b.showGallery !== false} onChange={(v) => onUpdate({ showGallery: v } as Partial<Block>)} />
          <CheckboxField label="Show Full Description" checked={b.showDescription !== false} onChange={(v) => onUpdate({ showDescription: v } as Partial<Block>)} />
          <CheckboxField label="Show Variant Options" checked={b.showVariants !== false} onChange={(v) => onUpdate({ showVariants: v } as Partial<Block>)} />
          <CheckboxField label="Show Add to Cart" checked={b.showAddToCart !== false} onChange={(v) => onUpdate({ showAddToCart: v } as Partial<Block>)} />
          <CheckboxField label="Show Bulk Pricing" checked={b.showBulkPricing !== false} onChange={(v) => onUpdate({ showBulkPricing: v } as Partial<Block>)} />
          <CheckboxField label="Show Breadcrumb" checked={b.showBreadcrumb !== false} onChange={(v) => onUpdate({ showBreadcrumb: v } as Partial<Block>)} />
          <CheckboxField label="Show Tags & SKU" checked={b.showTags !== false} onChange={(v) => onUpdate({ showTags: v } as Partial<Block>)} />
        </>
      )}

      {block.type === 'booking' && (
        <>
          <BookingPagePicker value={b.slug as string} onChange={(v) => onUpdate({ slug: v } as Partial<Block>)} />
          <RichTextField label="Title" value={b.title as string} onChange={(v) => onUpdate({ title: v } as Partial<Block>)} singleLine />
          <RichTextField label="Description" value={b.description as string} onChange={(v) => onUpdate({ description: v } as Partial<Block>)} />
          <Field label="Embed Height" value={(b.height as string) || '700px'} onChange={(v) => onUpdate({ height: v } as Partial<Block>)} />
          <CheckboxField label="Show Booking Page Title" checked={b.showPageTitle !== false} onChange={(v) => onUpdate({ showPageTitle: v } as Partial<Block>)} />
          <CheckboxField label="Show Description" checked={b.showDescription !== false} onChange={(v) => onUpdate({ showDescription: v } as Partial<Block>)} />
          <CheckboxField label="Show Step Indicator" checked={b.showSteps !== false} onChange={(v) => onUpdate({ showSteps: v } as Partial<Block>)} />
        </>
      )}

      {block.type === 'survey' && (
        <>
          <SurveyPicker value={b.slug as string} onChange={(v) => onUpdate({ slug: v } as Partial<Block>)} />
          <RichTextField label="Title" value={b.title as string} onChange={(v) => onUpdate({ title: v } as Partial<Block>)} singleLine />
          <RichTextField label="Description" value={b.description as string} onChange={(v) => onUpdate({ description: v } as Partial<Block>)} />
          <Field label="Embed Height" value={(b.height as string) || '700px'} onChange={(v) => onUpdate({ height: v } as Partial<Block>)} />
          <CheckboxField label="Show Survey Title" checked={b.showPageTitle !== false} onChange={(v) => onUpdate({ showPageTitle: v } as Partial<Block>)} />
        </>
      )}
    </div>
  );
}

// ─── List Editor (reusable for cards, stats, services, items, etc.) ──────────

interface ListFieldDef {
  name: string;
  label: string;
  placeholder?: string;
  multiline?: boolean;
  type?: 'text' | 'icon' | 'image' | 'video';
}

function ListEditor({
  label,
  items,
  fieldDefs,
  onAdd,
  onRemove,
  onItemChange,
  onReorder,
}: {
  label: string;
  items: { id: string; fields: Record<string, string> }[];
  fieldDefs: ListFieldDef[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  onItemChange: (id: string, field: string, value: string) => void;
  onReorder: (ids: string[]) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const listSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = items.findIndex(i => i.id === active.id);
    const newIdx = items.findIndex(i => i.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(items, oldIdx, newIdx);
    onReorder(reordered.map(i => i.id));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label} ({items.length})</span>
        <button type="button" onClick={onAdd} className="text-xs text-primary hover:text-primary/80 font-medium">+ Add</button>
      </div>
      <DndContext sensors={listSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-1">
            {items.map((item, i) => (
              <SortableListItem
                key={item.id}
                item={item}
                index={i}
                label={label}
                fieldDefs={fieldDefs}
                expandedId={expandedId}
                onToggleExpand={(id) => setExpandedId(expandedId === id ? null : id)}
                onRemove={onRemove}
                onItemChange={onItemChange}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function SortableListItem({
  item,
  index,
  label,
  fieldDefs,
  expandedId,
  onToggleExpand,
  onRemove,
  onItemChange,
}: {
  item: { id: string; fields: Record<string, string> };
  index: number;
  label: string;
  fieldDefs: ListFieldDef[];
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
  onRemove: (id: string) => void;
  onItemChange: (id: string, field: string, value: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };
  const isExpanded = expandedId === item.id;

  return (
    <div ref={setNodeRef} style={style} className="border border-border rounded-md overflow-hidden">
      <div
        className="flex items-center gap-1.5 px-1.5 py-1.5 bg-muted/50 cursor-pointer hover:bg-muted"
        onClick={() => onToggleExpand(item.id)}
      >
        <span
          {...attributes}
          {...listeners}
          className="material-icons text-xs text-muted-foreground/50 cursor-grab active:cursor-grabbing shrink-0"
          onClick={(e) => e.stopPropagation()}
        >drag_indicator</span>
        <span className="material-icons text-xs text-muted-foreground shrink-0">{isExpanded ? 'expand_more' : 'chevron_right'}</span>
        <span className="text-xs font-medium text-foreground flex-1 truncate">
          {item.fields[fieldDefs[0].name] || `${label.slice(0, -1)} ${index + 1}`}
        </span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(item.id); }}
          className="text-muted-foreground hover:text-red-500 transition-colors shrink-0"
          title="Remove"
        >
          <span className="material-icons text-sm">close</span>
        </button>
      </div>
      {isExpanded && (
        <div className="px-2.5 py-2 space-y-2 border-t border-border">
          {fieldDefs.map((fd) => (
            fd.type === 'icon' ? (
              <IconPicker
                key={fd.name}
                label={fd.label}
                value={item.fields[fd.name]}
                onChange={(v) => onItemChange(item.id, fd.name, v)}
              />
            ) : fd.type === 'image' ? (
              <div key={fd.name}>
                <span className="text-xs font-medium text-muted-foreground">{fd.label}</span>
                <MediaPicker
                  value={item.fields[fd.name]}
                  onChange={(v) => onItemChange(item.id, fd.name, v)}
                  mimeTypeFilter="image"
                  label=""
                />
              </div>
            ) : fd.type === 'video' ? (
              <div key={fd.name}>
                <span className="text-xs font-medium text-muted-foreground">{fd.label}</span>
                <MediaPicker
                  value={item.fields[fd.name]}
                  onChange={(v) => onItemChange(item.id, fd.name, v)}
                  mimeTypeFilter="video"
                  label=""
                />
              </div>
            ) : fd.multiline ? (
              <TextareaField
                key={fd.name}
                label={fd.label}
                value={item.fields[fd.name]}
                onChange={(v) => onItemChange(item.id, fd.name, v)}
                rows={2}
              />
            ) : (
              <Field
                key={fd.name}
                label={fd.label}
                value={item.fields[fd.name]}
                onChange={(v) => onItemChange(item.id, fd.name, v)}
              />
            )
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Columns Editor ──────────────────────────────────────────────────────────

function ColumnsEditor({ block, onUpdate }: { block: Block & { type: 'columns' }; onUpdate: (updates: Partial<Block>) => void }) {
  const cols = block.columns;
  const parseW = (w: number | string) => typeof w === 'string' ? parseFloat(w) : w;
  const totalWidth = cols.reduce((sum, c) => sum + parseW(c.width), 0);

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
              style={{ width: `${(parseW(col.width) / totalWidth) * 100}%` }}
            >
              {Math.round(parseW(col.width))}%
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
                value={parseW(col.width)}
                onChange={(e) => updateColumnWidth(i, Number(e.target.value))}
                className="flex-1 h-1.5 accent-primary"
              />
              <span className="text-[10px] text-muted-foreground w-8 text-right">{Math.round(parseW(col.width))}%</span>
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

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  // Extract a hex-ish value for the color picker from rgba/hex strings
  const toHex = (c: string) => {
    const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (m) return '#' + [m[1], m[2], m[3]].map(v => parseInt(v).toString(16).padStart(2, '0')).join('');
    return c.startsWith('#') ? c.slice(0, 7) : '#ffffff';
  };
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2 mt-1">
        <input type="color" value={toHex(value)} onChange={(e) => onChange(e.target.value)}
          className="w-7 h-7 rounded border border-border cursor-pointer shrink-0 p-0" />
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
          className="flex-1 rounded border border-border px-2 py-1 text-xs font-mono focus:border-primary focus:ring-1 focus:ring-primary" />
      </div>
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

function RichTextField({ label, value, onChange, singleLine = false }: { label: string; value: string | undefined; onChange: (v: string) => void; singleLine?: boolean }) {
  return (
    <div className="block">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="mt-1 rounded border border-border px-2.5 py-1.5 text-sm focus-within:border-primary focus-within:ring-1 focus-within:ring-primary min-h-[2rem]">
        <RichTextEditable
          html={value || ''}
          onChange={onChange}
          placeholder={label}
          singleLine={singleLine}
          className="outline-none min-h-[1.2em]"
        />
      </div>
    </div>
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

function NumberField({ label, value, onChange, min, max, step = 1 }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} min={min} max={max} step={step}
        className="mt-1 block w-full rounded border border-border px-2.5 py-1.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary" />
    </label>
  );
}

function BookingPagePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [pages, setPages] = useState<Array<{ id: number; slug: string; title: string; duration: number; active: boolean }>>([]);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    fetch('/api/portal/tools/booking')
      .then(r => r.json())
      .then(json => { if (json.success) setPages(json.data || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = search
    ? pages.filter(p => p.title.toLowerCase().includes(search.toLowerCase()) || p.slug.toLowerCase().includes(search.toLowerCase()))
    : pages;

  const selected = pages.find(p => p.slug === value);

  return (
    <div ref={ref} className="relative">
      <span className="text-xs font-medium text-muted-foreground">Booking Page</span>
      {selected && !open && (
        <button type="button" onClick={() => setOpen(true)}
          className="mt-1 w-full flex items-center gap-2 rounded border border-border px-2.5 py-1.5 text-sm text-left hover:border-primary transition-colors">
          <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center flex-shrink-0">
            <span className="material-icons text-sm text-primary">calendar_month</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="truncate font-medium">{selected.title}</div>
            <div className="text-xs text-muted-foreground">{selected.slug} &middot; {selected.duration}min</div>
          </div>
          <span className="material-icons text-sm text-muted-foreground">unfold_more</span>
        </button>
      )}
      {(!selected || open) && (
        <input type="text" value={open ? search : value || ''}
          onChange={(e) => { setSearch(e.target.value); if (!open) onChange(e.target.value); }}
          onFocus={() => setOpen(true)}
          placeholder={loading ? 'Loading...' : 'Search booking pages...'}
          className="mt-1 block w-full rounded border border-border px-2.5 py-1.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary" />
      )}
      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
          {!selected && (
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search booking pages..." autoFocus
              className="sticky top-0 w-full border-b border-border px-3 py-2 text-sm bg-card focus:outline-none" />
          )}
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-xs text-muted-foreground text-center">
              {loading ? 'Loading...' : pages.length === 0 ? 'No booking pages found' : 'No matches'}
            </div>
          ) : (
            filtered.map(p => (
              <button key={p.slug} type="button"
                onClick={() => { onChange(p.slug); setOpen(false); setSearch(''); }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-primary/5 transition-colors ${p.slug === value ? 'bg-primary/10' : ''}`}>
                <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="material-icons text-sm text-primary">calendar_month</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="truncate">{p.title}</div>
                  <div className="text-xs text-muted-foreground">{p.slug} &middot; {p.duration}min {!p.active && <span className="text-amber-500">(inactive)</span>}</div>
                </div>
                {p.slug === value && <span className="material-icons text-primary text-sm">check</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function SurveyPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [surveys, setSurveys] = useState<Array<{ id: number; slug: string; title: string; status: string; responseCount: number }>>([]);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    fetch('/api/portal/surveys')
      .then(r => r.json())
      .then(json => { if (json.success) setSurveys(json.data || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = search
    ? surveys.filter(s => s.title.toLowerCase().includes(search.toLowerCase()) || s.slug.toLowerCase().includes(search.toLowerCase()))
    : surveys;

  const selected = surveys.find(s => s.slug === value);

  return (
    <div ref={ref} className="relative">
      <span className="text-xs font-medium text-muted-foreground">Survey</span>
      {selected && !open && (
        <button type="button" onClick={() => setOpen(true)}
          className="mt-1 w-full flex items-center gap-2 rounded border border-border px-2.5 py-1.5 text-sm text-left hover:border-primary transition-colors">
          <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center flex-shrink-0">
            <span className="material-icons text-sm text-primary">assignment</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="truncate font-medium">{selected.title}</div>
            <div className="text-xs text-muted-foreground">{selected.slug} &middot; {selected.responseCount} responses</div>
          </div>
          <span className="material-icons text-sm text-muted-foreground">unfold_more</span>
        </button>
      )}
      {(!selected || open) && (
        <input type="text" value={open ? search : value || ''}
          onChange={(e) => { setSearch(e.target.value); if (!open) onChange(e.target.value); }}
          onFocus={() => setOpen(true)}
          placeholder={loading ? 'Loading...' : 'Search surveys...'}
          className="mt-1 block w-full rounded border border-border px-2.5 py-1.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary" />
      )}
      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
          {!selected && (
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search surveys..." autoFocus
              className="sticky top-0 w-full border-b border-border px-3 py-2 text-sm bg-card focus:outline-none" />
          )}
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-xs text-muted-foreground text-center">
              {loading ? 'Loading...' : surveys.length === 0 ? 'No surveys found' : 'No matches'}
            </div>
          ) : (
            filtered.map(s => (
              <button key={s.slug} type="button"
                onClick={() => { onChange(s.slug); setOpen(false); setSearch(''); }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-primary/5 transition-colors ${s.slug === value ? 'bg-primary/10' : ''}`}>
                <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="material-icons text-sm text-primary">assignment</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="truncate">{s.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {s.slug}
                    {s.status !== 'active' && <span className="text-amber-500 ml-1">({s.status})</span>}
                  </div>
                </div>
                {s.slug === value && <span className="material-icons text-primary text-sm">check</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function ProductSlugPicker({ siteId, value, onChange }: { siteId?: number; value: string; onChange: (v: string) => void }) {
  const [products, setProducts] = useState<Array<{ slug: string; name: string; image: string | null; price: number }>>([]);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!siteId) return;
    setLoading(true);
    fetch(`/api/portal/websites/${siteId}/store/products?limit=100`)
      .then(r => r.json())
      .then(json => { if (json.success) setProducts(json.data || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [siteId]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = search
    ? products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.slug.toLowerCase().includes(search.toLowerCase()))
    : products;

  const selected = products.find(p => p.slug === value);

  return (
    <div ref={ref} className="relative">
      <span className="text-xs font-medium text-muted-foreground">Product</span>
      {/* Selected product display */}
      {selected && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-1 w-full flex items-center gap-2 rounded border border-border px-2.5 py-1.5 text-sm text-left hover:border-primary transition-colors"
        >
          {selected.image && (
            <img src={selected.image} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <div className="truncate font-medium">{selected.name}</div>
            <div className="text-xs text-muted-foreground">{selected.slug}</div>
          </div>
          <span className="material-icons text-sm text-muted-foreground">unfold_more</span>
        </button>
      )}
      {/* Search input */}
      {(!selected || open) && (
        <input
          type="text"
          value={open ? search : value || ''}
          onChange={(e) => { setSearch(e.target.value); if (!open) { onChange(e.target.value); } }}
          onFocus={() => setOpen(true)}
          placeholder={loading ? 'Loading products...' : 'Search products...'}
          className="mt-1 block w-full rounded border border-border px-2.5 py-1.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
        />
      )}
      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
          {open && !selected && (
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products..."
              autoFocus
              className="sticky top-0 w-full border-b border-border px-3 py-2 text-sm bg-card focus:outline-none"
            />
          )}
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-xs text-muted-foreground text-center">
              {loading ? 'Loading...' : products.length === 0 ? 'No products in store' : 'No matches'}
            </div>
          ) : (
            filtered.map(p => (
              <button
                key={p.slug}
                type="button"
                onClick={() => { onChange(p.slug); setOpen(false); setSearch(''); }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-primary/5 transition-colors ${p.slug === value ? 'bg-primary/10' : ''}`}
              >
                {p.image ? (
                  <img src={p.image} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                ) : (
                  <div className="w-8 h-8 rounded bg-muted/20 flex items-center justify-center flex-shrink-0">
                    <span className="material-icons text-xs text-muted-foreground">inventory_2</span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="truncate">{p.name}</div>
                  <div className="text-xs text-muted-foreground">{p.slug}</div>
                </div>
                {p.slug === value && <span className="material-icons text-primary text-sm">check</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Marquee Editor ─────────────────────────────────────────────────────────

function MarqueeEditor({ block, onUpdate, siteId }: { block: Block; onUpdate: (updates: Partial<Block>) => void; siteId?: number }) {
  const b = block as unknown as Record<string, unknown>;
  const items = (b.items as Array<Record<string, unknown>>) || [];
  const mediaApi = siteId ? `/api/portal/cms/websites/${siteId}/media` : '/api/media';

  function updateItem(index: number, updates: Record<string, unknown>) {
    const newItems = items.map((it, i) => i === index ? { ...it, ...updates } : it);
    onUpdate({ items: newItems } as Partial<Block>);
  }

  function addItem(type: 'text' | 'image' | 'icon') {
    const newItem: Record<string, unknown> = {
      id: `mi-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type,
      content: type === 'text' ? 'New item' : type === 'icon' ? 'star' : '',
      imageUrl: '',
    };
    onUpdate({ items: [...items, newItem] } as Partial<Block>);
  }

  function removeItem(index: number) {
    onUpdate({ items: items.filter((_, i) => i !== index) } as Partial<Block>);
  }

  function moveItem(from: number, dir: -1 | 1) {
    const to = from + dir;
    if (to < 0 || to >= items.length) return;
    const arr = [...items];
    [arr[from], arr[to]] = [arr[to], arr[from]];
    onUpdate({ items: arr } as Partial<Block>);
  }

  return (
    <div className="space-y-3">
      {/* Items list */}
      <div>
        <span className="text-xs font-medium text-muted-foreground">Items ({items.length})</span>
        <div className="space-y-2 mt-1">
          {items.map((item, i) => (
            <div key={(item.id as string) || i} className="border border-border rounded p-2 space-y-2 bg-muted/20">
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-muted-foreground font-medium flex-1">{String(item.type).toUpperCase()} {i + 1}</span>
                <button type="button" onClick={() => moveItem(i, -1)} disabled={i === 0} className="p-0.5 text-xs rounded hover:bg-muted disabled:opacity-30"><span className="material-icons text-xs">arrow_upward</span></button>
                <button type="button" onClick={() => moveItem(i, 1)} disabled={i === items.length - 1} className="p-0.5 text-xs rounded hover:bg-muted disabled:opacity-30"><span className="material-icons text-xs">arrow_downward</span></button>
                <button type="button" onClick={() => removeItem(i)} className="p-0.5 text-xs rounded text-destructive hover:bg-destructive/10"><span className="material-icons text-xs">close</span></button>
              </div>
              {item.type === 'text' && (
                <Field label="Text" value={(item.content as string) || ''} onChange={(v) => updateItem(i, { content: v })} />
              )}
              {item.type === 'icon' && (
                <Field label="Icon Name" value={(item.content as string) || ''} onChange={(v) => updateItem(i, { content: v })} />
              )}
              {item.type === 'image' && (
                <div><span className="text-xs text-muted-foreground">Image</span><MediaPicker value={(item.imageUrl as string) || ''} onChange={(v) => updateItem(i, { imageUrl: v })} mimeTypeFilter="image" label="" apiEndpoint={mediaApi} /></div>
              )}
              {item.type === 'image' && (
                <Field label="Alt Text" value={(item.imageAlt as string) || ''} onChange={(v) => updateItem(i, { imageAlt: v })} />
              )}
              <Field label="Link (optional)" value={(item.link as string) || ''} onChange={(v) => updateItem(i, { link: v })} />
            </div>
          ))}
        </div>
        <div className="flex gap-1 mt-2">
          <button type="button" onClick={() => addItem('text')} className="flex-1 px-2 py-1.5 text-xs rounded bg-muted text-muted-foreground hover:text-foreground">+ Text</button>
          <button type="button" onClick={() => addItem('image')} className="flex-1 px-2 py-1.5 text-xs rounded bg-muted text-muted-foreground hover:text-foreground">+ Image</button>
          <button type="button" onClick={() => addItem('icon')} className="flex-1 px-2 py-1.5 text-xs rounded bg-muted text-muted-foreground hover:text-foreground">+ Icon</button>
        </div>
      </div>

      {/* Marquee settings */}
      <div className="border-t border-border pt-3 space-y-2">
        <span className="text-xs font-medium text-muted-foreground">Marquee Settings</span>
        <SelectField label="Direction" value={(b.direction as string) || 'left'} options={['left','right','up','down']} onChange={(v) => onUpdate({ direction: v } as Partial<Block>)} />
        <Field label="Speed (px/s)" value={String((b.speed as number) || 50)} onChange={(v) => onUpdate({ speed: Number(v) || 50 } as Partial<Block>)} />
        <Field label="Gap" value={(b.gap as string) || '40px'} onChange={(v) => onUpdate({ gap: v } as Partial<Block>)} />
        <Field label="Height (vertical)" value={(b.height as string) || ''} onChange={(v) => onUpdate({ height: v } as Partial<Block>)} />
        <CheckboxField label="Auto Fill" checked={(b.autoFill as boolean) ?? true} onChange={(v) => onUpdate({ autoFill: v } as Partial<Block>)} />
        <CheckboxField label="Pause on Hover" checked={(b.pauseOnHover as boolean) ?? false} onChange={(v) => onUpdate({ pauseOnHover: v } as Partial<Block>)} />
        <CheckboxField label="Pause on Click" checked={(b.pauseOnClick as boolean) ?? false} onChange={(v) => onUpdate({ pauseOnClick: v } as Partial<Block>)} />
        <CheckboxField label="Gradient Edges" checked={(b.gradient as boolean) ?? false} onChange={(v) => onUpdate({ gradient: v } as Partial<Block>)} />
        {(b.gradient as boolean) && (
          <>
            <Field label="Gradient Color" value={(b.gradientColor as string) || 'white'} onChange={(v) => onUpdate({ gradientColor: v } as Partial<Block>)} />
            <Field label="Gradient Width" value={String((b.gradientWidth as number) || 200)} onChange={(v) => onUpdate({ gradientWidth: Number(v) || 200 } as Partial<Block>)} />
          </>
        )}
        <Field label="Loop Count (0=infinite)" value={String((b.loop as number) || 0)} onChange={(v) => onUpdate({ loop: Number(v) || 0 } as Partial<Block>)} />
      </div>
    </div>
  );
}

// ─── Hero Slideshow Editor ──────────────────────────────────────────────────

function HeroSlideshowEditor({ block, onUpdate, siteId }: { block: Block; onUpdate: (updates: Partial<Block>) => void; siteId?: number }) {
  const b = block as unknown as Record<string, unknown>;
  const slides = (b.slides as Array<Record<string, unknown>>) || [];
  const [activeSlide, setActiveSlide] = useState(0);
  const slide = slides[activeSlide] as Record<string, unknown> | undefined;
  const mediaApi = siteId ? `/api/portal/cms/websites/${siteId}/media` : '/api/media';

  function updateSlide(index: number, updates: Record<string, unknown>) {
    const newSlides = slides.map((s, i) => i === index ? { ...s, ...updates } : s);
    onUpdate({ slides: newSlides } as Partial<Block>);
  }

  function addSlide() {
    const newSlide = { id: `slide-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, title: 'New Slide', textAlignment: 'center' };
    onUpdate({ slides: [...slides, newSlide] } as Partial<Block>);
    setActiveSlide(slides.length);
  }

  function removeSlide(index: number) {
    if (slides.length <= 1) return;
    const newSlides = slides.filter((_, i) => i !== index);
    onUpdate({ slides: newSlides } as Partial<Block>);
    if (activeSlide >= newSlides.length) setActiveSlide(newSlides.length - 1);
  }

  return (
    <div className="space-y-3">
      <div>
        <span className="text-xs font-medium text-muted-foreground">Slides</span>
        <div className="flex flex-wrap gap-1 mt-1">
          {slides.map((_, i) => (
            <button key={i} type="button" onClick={() => setActiveSlide(i)}
              className={`px-2.5 py-1 text-xs font-medium rounded ${i === activeSlide ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
            >{i + 1}</button>
          ))}
          <button type="button" onClick={addSlide} className="px-2.5 py-1 text-xs rounded bg-muted text-muted-foreground hover:text-foreground">+</button>
        </div>
        {slides.length > 1 && (
          <button type="button" onClick={() => removeSlide(activeSlide)} className="text-xs text-destructive hover:underline mt-1">Remove slide {activeSlide + 1}</button>
        )}
      </div>

      {slide && (
        <>
          <RichTextField label="Title" value={(slide.title as string) || ''} onChange={(v) => updateSlide(activeSlide, { title: v })} singleLine />
          <Field label="Subtitle" value={(slide.subtitle as string) || ''} onChange={(v) => updateSlide(activeSlide, { subtitle: v })} />
          <TextareaField label="Description" value={(slide.description as string) || ''} onChange={(v) => updateSlide(activeSlide, { description: v })} rows={3} />
          <Field label="CTA Text" value={(slide.ctaText as string) || ''} onChange={(v) => updateSlide(activeSlide, { ctaText: v })} />
          <Field label="CTA Link" value={(slide.ctaLink as string) || ''} onChange={(v) => updateSlide(activeSlide, { ctaLink: v })} />
          <Field label="2nd CTA Text" value={(slide.secondaryCtaText as string) || ''} onChange={(v) => updateSlide(activeSlide, { secondaryCtaText: v })} />
          <Field label="2nd CTA Link" value={(slide.secondaryCtaLink as string) || ''} onChange={(v) => updateSlide(activeSlide, { secondaryCtaLink: v })} />
          <div><span className="text-xs font-medium text-muted-foreground">Background Image</span><MediaPicker value={(slide.backgroundImage as string) || ''} onChange={(v) => updateSlide(activeSlide, { backgroundImage: v })} mimeTypeFilter="image" label="" apiEndpoint={mediaApi} /></div>
          <SelectField label="Background Size" value={(slide.backgroundSize as string) || 'cover'} options={['cover','contain','auto','50%','100%','150%','200%']} onChange={(v) => updateSlide(activeSlide, { backgroundSize: v })} />
          <Field label="Background Position" value={(slide.backgroundPosition as string) || 'center'} onChange={(v) => updateSlide(activeSlide, { backgroundPosition: v })} />
          <SelectField label="Background Repeat" value={(slide.backgroundRepeat as string) || 'no-repeat'} options={['no-repeat','repeat','repeat-x','repeat-y','space','round']} onChange={(v) => updateSlide(activeSlide, { backgroundRepeat: v })} />
          <Field label="Video URL" value={(slide.backgroundVideo as string) || ''} onChange={(v) => updateSlide(activeSlide, { backgroundVideo: v })} />
          <div>
            <span className="text-xs font-medium text-muted-foreground mb-1 block">Overlay</span>
            <div className="flex gap-2 items-start">
              <div className="flex-1 space-y-1.5">
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={(() => {
                      const c = (slide.overlayColor as string) || 'rgba(0,0,0,0.45)';
                      const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
                      if (m) return '#' + [m[1],m[2],m[3]].map(v => parseInt(v).toString(16).padStart(2,'0')).join('');
                      return c.startsWith('#') ? c : '#000000';
                    })()}
                    onChange={(e) => {
                      const hex = e.target.value;
                      const r = parseInt(hex.slice(1,3),16);
                      const g = parseInt(hex.slice(3,5),16);
                      const b = parseInt(hex.slice(5,7),16);
                      const opacity = (slide.overlayOpacity as number) ?? 0.45;
                      updateSlide(activeSlide, { overlayColor: `rgba(${r},${g},${b},${opacity})` });
                    }}
                    className="w-8 h-8 rounded border border-border cursor-pointer shrink-0"
                  />
                  <input
                    type="text"
                    value={(slide.overlayColor as string) || 'rgba(0,0,0,0.45)'}
                    onChange={(v) => updateSlide(activeSlide, { overlayColor: v.target.value })}
                    className="flex-1 text-sm rounded border border-border bg-background px-2 py-1.5 text-foreground font-mono text-xs"
                    placeholder="rgba(0,0,0,0.45)"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[10px] text-muted-foreground">Opacity</span>
                    <span className="text-[10px] text-muted-foreground font-mono">{Math.round(((slide.overlayOpacity as number) ?? 1) * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={(slide.overlayOpacity as number) ?? 1}
                    onChange={(e) => updateSlide(activeSlide, { overlayOpacity: parseFloat(e.target.value) })}
                    className="w-full h-1.5 rounded-full appearance-none bg-border cursor-pointer accent-primary"
                  />
                </div>
              </div>
            </div>
          </div>
          <SelectField label="Text Alignment" value={(slide.textAlignment as string) || 'center'} options={['left','center','right']} onChange={(v) => updateSlide(activeSlide, { textAlignment: v })} />
        </>
      )}

      <div className="border-t border-border pt-3 space-y-2">
        <span className="text-xs font-medium text-muted-foreground">Slideshow Settings</span>
        <SelectField label="Transition" value={(b.transition as string) || 'fade'} options={['fade','slide','zoom']} onChange={(v) => onUpdate({ transition: v } as Partial<Block>)} />
        <Field label="Height" value={(b.height as string) || '90vh'} onChange={(v) => onUpdate({ height: v } as Partial<Block>)} />
        <Field label="Interval (ms)" value={String((b.interval as number) || 6000)} onChange={(v) => onUpdate({ interval: Number(v) || 6000 } as Partial<Block>)} />
        <CheckboxField label="Autoplay" checked={(b.autoplay as boolean) ?? true} onChange={(v) => onUpdate({ autoplay: v } as Partial<Block>)} />
        <CheckboxField label="Show Dots" checked={(b.showDots as boolean) ?? true} onChange={(v) => onUpdate({ showDots: v } as Partial<Block>)} />
        <CheckboxField label="Show Arrows" checked={(b.showArrows as boolean) ?? true} onChange={(v) => onUpdate({ showArrows: v } as Partial<Block>)} />
        <CheckboxField label="Ken Burns Effect" checked={(b.kenBurns as boolean) ?? true} onChange={(v) => onUpdate({ kenBurns: v } as Partial<Block>)} />
        <CheckboxField label="Pause on Hover" checked={(b.pauseOnHover as boolean) ?? true} onChange={(v) => onUpdate({ pauseOnHover: v } as Partial<Block>)} />
      </div>

      {/* Navigation Colors */}
      <div className="border-t border-border pt-3 space-y-2">
        <span className="text-xs font-medium text-muted-foreground">Navigation Colors</span>
        <ColorField label="Arrow Color" value={(b.arrowColor as string) || '#fff'} onChange={(v) => onUpdate({ arrowColor: v } as Partial<Block>)} />
        <ColorField label="Arrow Background" value={(b.arrowBackground as string) || 'rgba(255,255,255,0.12)'} onChange={(v) => onUpdate({ arrowBackground: v } as Partial<Block>)} />
        <ColorField label="Arrow Border" value={(b.arrowBorderColor as string) || 'rgba(255,255,255,0.2)'} onChange={(v) => onUpdate({ arrowBorderColor: v } as Partial<Block>)} />
        <ColorField label="Dot Color" value={(b.dotColor as string) || 'rgba(255,255,255,0.4)'} onChange={(v) => onUpdate({ dotColor: v } as Partial<Block>)} />
        <ColorField label="Active Dot" value={(b.dotActiveColor as string) || '#fff'} onChange={(v) => onUpdate({ dotActiveColor: v } as Partial<Block>)} />
        <ColorField label="Progress Bar" value={(b.progressBarColor as string) || 'rgba(255,255,255,0.5)'} onChange={(v) => onUpdate({ progressBarColor: v } as Partial<Block>)} />
      </div>
    </div>
  );
}
