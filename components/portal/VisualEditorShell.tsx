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
import { TokenColorPicker } from '@/components/blocks/visual/TokenColorPicker';
import { findBlockById, findBlockPath, updateBlockById, removeBlockById, insertBlockInContainer, insertBlockAfter, getAllBlocks } from '@/lib/utils/blockHelpers';
import { IconPicker } from './IconPicker';
import MediaPicker from '@/components/admin/MediaPicker';
import type { Block, BlockType, BlockStyle, ColumnsBlock } from '@/types/blocks';
import type { Breakpoint } from '@/types/responsive';
import type { ComponentManifestEntry } from '@/types/visual-editor';
import BrandingProfileSelector from '@/components/portal/BrandingProfileSelector';
import { RichTextEditable } from '@/components/blocks/visual/RichTextEditable';
import { GoogleFontPicker } from '@/components/blocks/visual/GoogleFontPicker';
import { SaveAsTemplateModal } from '@/components/blocks/SaveAsTemplateModal';
import { TemplateLibrary } from '@/components/blocks/TemplateLibrary';

// ─── Block type definitions for picker ───────────────────────────────────────
// Sourced from lib/blocks/registry.ts so NestedBlockInserter and other pickers
// can reference the same list without importing from a UI component.
import { BUILT_IN_BLOCK_TYPES } from '@/lib/blocks/registry';
import { StyleVariantsButton } from '@/components/blocks/visual/StyleVariantsButton';

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
  /** Additional block types to show in the picker (e.g. pitch-deck-only blocks) */
  extraBlockTypes?: Array<{ type: BlockType; label: string; icon: string; category: string; description: string }>;
  /** Allow scrolling inside the iframe viewport (for pitch deck slides with tall content) */
  allowIframeScroll?: boolean;
  /** Custom content for the right panel when no block is selected */
  noSelectionPanel?: React.ReactNode;
  /** Custom CSS — when this changes the iframe is updated live (no reload). */
  customCss?: string;
  /** Custom JS — passed through but not live-injected (iframe reload required). */
  customJs?: string;
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
  extraBlockTypes = [],
  allowIframeScroll = false,
  noSelectionPanel,
  customCss = '',
  customJs = '',
}: VisualEditorShellProps) {
  const [internalSelectedBlockId, setInternalSelectedBlockId] = useState<string | null>(null);
  const [selectedBlockIds, setSelectedBlockIds] = useState<string[]>([]);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [saveTemplateBlocks, setSaveTemplateBlocks] = useState<Block[] | null>(null);
  const [templateLibraryOpen, setTemplateLibraryOpen] = useState(false);
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
    const isEditableTarget = (t: EventTarget | null) =>
      t instanceof HTMLInputElement ||
      t instanceof HTMLTextAreaElement ||
      t instanceof HTMLSelectElement ||
      (t instanceof HTMLElement && t.isContentEditable);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && !isEditableTarget(e.target)) {
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
    sendCustomCodeUpdate,
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
    onBlockContextMenu: (blockId: string, x: number, y: number) => {
      // Convert iframe-relative coords to parent screen coords (account for zoom + iframe position)
      const iframe = iframeRef.current;
      if (!iframe) return;
      const rect = iframe.getBoundingClientRect();
      const scale = zoomLevel / 100;
      const screenX = rect.left + x * scale;
      const screenY = rect.top + y * scale;
      // If the right-clicked block isn't already in the selection, select just it
      setSelectedBlockIds(prev => prev.includes(blockId) ? prev : [blockId]);
      setInternalSelectedBlockId(blockId);
      setContextMenu({ x: screenX, y: screenY });
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

  // Push custom CSS into the iframe live (no reload) whenever it changes.
  // The iframe's useEditorMode handler injects/updates a <style> tag so
  // modal "Apply" reflects immediately without losing scroll/selection.
  useEffect(() => {
    sendCustomCodeUpdate(customCss, customJs);
  }, [customCss, customJs, sendCustomCodeUpdate]);

  // Notify parent of undo/redo availability
  useEffect(() => {
    onUndoRedoChange?.({ sendUndo, sendRedo, canUndo: undoRedoState.canUndo, canRedo: undoRedoState.canRedo });
  }, [undoRedoState, sendUndo, sendRedo, onUndoRedoChange]);

  // Global Cmd/Ctrl+Z (undo) and Cmd/Ctrl+Shift+Z (redo) — ignored when typing
  useEffect(() => {
    const isEditableTarget = (t: EventTarget | null) =>
      t instanceof HTMLInputElement ||
      t instanceof HTMLTextAreaElement ||
      t instanceof HTMLSelectElement ||
      (t instanceof HTMLElement && t.isContentEditable);
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key.toLowerCase() !== 'z') return;
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
      if (e.shiftKey) sendRedo();
      else sendUndo();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [sendUndo, sendRedo]);

  // Bulk actions for multi-select
  const isMultiSelect = selectedBlockIds.length > 1;

  const bulkDelete = useCallback(() => {
    // Filter out required blocks from deletion
    const deletableIds = selectedBlockIds.filter(id => {
      const block = findBlockById(blocks, id);
      return block && !block.required;
    });
    if (deletableIds.length === 0) return;
    let updated = blocks;
    for (const id of deletableIds) {
      updated = removeBlockById(updated, id);
    }
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
    return [...BUILT_IN_BLOCK_TYPES, ...custom, ...extraBlockTypes];
  }, [customComponents, extraBlockTypes]);

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
              <button
                type="button"
                onClick={() => setTemplateLibraryOpen(true)}
                className="w-full flex items-center justify-center gap-1.5 rounded border border-border bg-primary/5 hover:bg-primary/10 text-primary px-2 py-2 mb-2 text-xs font-medium transition-colors"
                title="Insert a saved template"
              >
                <span className="material-icons text-sm">bookmark</span>
                Browse Templates
              </button>
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
                  {blocks.map((block, i) => (
                    <LayerItem
                      key={block.id ?? `layer-${i}-${block.type}`}
                      block={block}
                      depth={0}
                      selectedBlockId={selectedBlockId}
                      selectedBlockIds={selectedBlockIds}
                      onSelect={selectBlock}
                      onDelete={onDeleteBlock}
                      onUpdate={handleUpdateBlock}
                      onContextMenu={(id, x, y) => {
                        setSelectedBlockIds(prev => prev.includes(id) ? prev : [id]);
                        setInternalSelectedBlockId(id);
                        setContextMenu({ x, y });
                      }}
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
              className={`${allowIframeScroll ? 'overflow-auto' : 'overflow-hidden'} relative shadow-xl rounded-lg border border-border/50`}
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
                {selectedBlock.required ? (
                  <span className="p-1 text-muted-foreground/40" title="Required block">
                    <span className="material-icons text-base">lock</span>
                  </span>
                ) : (
                  <button type="button" onClick={() => onDeleteBlock(selectedBlock.id)} className="p-1 text-muted-foreground hover:text-destructive" title="Delete">
                    <span className="material-icons text-base">delete</span>
                  </button>
                )}
              </div>
            </div>

            {/* Anchor ID field (universal to all blocks) */}
            <div className="px-4 py-2 border-b border-border shrink-0">
              <label className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
                <span className="material-icons text-xs">link</span>
                Anchor ID
              </label>
              <div className="flex items-center gap-1 bg-background border border-border rounded-lg px-2 py-1 focus-within:ring-2 focus-within:ring-primary/40">
                <span className="text-xs text-muted-foreground select-none">#</span>
                <input
                  type="text"
                  value={selectedBlock.anchor || ''}
                  onChange={(e) => handleUpdateBlock(selectedBlock.id, { anchor: e.target.value.replace(/[^a-zA-Z0-9-_]/g, '').toLowerCase() } as Partial<Block>)}
                  placeholder="my-section"
                  className="flex-1 min-w-0 bg-transparent text-xs text-foreground outline-none font-mono"
                />
              </div>
              <p className="text-[10px] text-muted-foreground/70 mt-1">
                Used for #jumplink URLs like /page#{selectedBlock.anchor || 'my-section'}
              </p>
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
                <>
                  {siteId !== undefined && (
                    <StyleVariantsButton
                      block={selectedBlock}
                      siteId={siteId}
                      onApply={(delta) => handleUpdateBlock(selectedBlock.id, delta as Partial<Block>)}
                    />
                  )}
                  <ElementStyleEditor
                    block={selectedBlock}
                    onChange={(updates) => handleUpdateBlock(selectedBlock.id, updates)}
                    currentViewport={currentViewport}
                  />
                </>
              )}
            </div>
          </>
        ) : noSelectionPanel ? (
          <div className="flex-1 overflow-y-auto p-4">{noSelectionPanel}</div>
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

      {/* Block context menu (right-click) */}
      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-50"
            onClick={() => setContextMenu(null)}
            onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }}
          />
          <div
            className="fixed z-50 min-w-[200px] rounded-md border border-border bg-card shadow-xl py-1 text-sm"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <div className="px-3 py-1.5 text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border mb-1">
              {selectedBlockIds.length > 1 ? `${selectedBlockIds.length} blocks` : 'Block'}
            </div>
            <button
              type="button"
              onClick={() => { bulkDuplicate(); setContextMenu(null); }}
              className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-accent text-left"
            >
              <span className="material-icons text-base text-muted-foreground">content_copy</span>
              Duplicate
            </button>
            <button
              type="button"
              onClick={() => { bulkGroup(); setContextMenu(null); }}
              disabled={selectedBlockIds.length < 2}
              className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-accent text-left disabled:opacity-40 disabled:cursor-not-allowed"
              title={selectedBlockIds.length < 2 ? 'Select 2 or more blocks to group' : ''}
            >
              <span className="material-icons text-base text-muted-foreground">crop_free</span>
              Group into Section
            </button>
            <button
              type="button"
              onClick={() => {
                const picked = selectedBlockIds
                  .map(id => findBlockById(blocks, id))
                  .filter((b): b is Block => !!b);
                if (picked.length > 0) setSaveTemplateBlocks(picked);
                setContextMenu(null);
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-accent text-left"
            >
              <span className="material-icons text-base text-muted-foreground">bookmark_add</span>
              Save as Template
            </button>
            <div className="border-t border-border my-1" />
            <button
              type="button"
              onClick={() => { bulkDelete(); setContextMenu(null); }}
              className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-destructive/10 text-destructive text-left"
            >
              <span className="material-icons text-base">delete</span>
              Delete
            </button>
          </div>
        </>
      )}

      {/* Save as Template modal */}
      {saveTemplateBlocks && (
        <SaveAsTemplateModal
          blocks={saveTemplateBlocks}
          onClose={() => setSaveTemplateBlocks(null)}
        />
      )}

      {/* Template library — browse + insert saved templates */}
      {templateLibraryOpen && (
        <TemplateLibrary
          onInsert={(newBlocks) => {
            // Insert after the currently selected top-level block; otherwise append
            const topLevelIndex = selectedBlockId
              ? blocks.findIndex(b => b.id === selectedBlockId)
              : -1;
            let next: Block[];
            if (topLevelIndex >= 0) {
              next = [
                ...blocks.slice(0, topLevelIndex + 1),
                ...newBlocks,
                ...blocks.slice(topLevelIndex + 1),
              ];
            } else {
              next = [...blocks, ...newBlocks];
            }
            // Renumber order to keep the tree tidy
            next = next.map((b, i) => ({ ...b, order: i + 1 }));
            iframeOriginatedRef.current = true;
            onBlocksChange(next);
            // Select the first inserted block for immediate context
            if (newBlocks[0]?.id) {
              setInternalSelectedBlockId(newBlocks[0].id);
              setSelectedBlockIds([newBlocks[0].id]);
            }
          }}
          onClose={() => setTemplateLibraryOpen(false)}
        />
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
  onContextMenu,
  showDropIndicator = false,
}: {
  block: Block;
  depth: number;
  selectedBlockId: string | null;
  selectedBlockIds?: string[];
  onSelect: (id: string, modifiers?: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean }) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, updates: Partial<Block>) => void;
  onContextMenu?: (id: string, x: number, y: number) => void;
  showDropIndicator?: boolean;
}) {
  const sortable = useSortable({ id: block.id, transition: null });
  const style = { opacity: sortable.isDragging ? 0.3 : 1, transition: 'opacity 200ms' } as React.CSSProperties;
  // Require a truthy block.id before matching — otherwise `undefined ===
  // undefined` would cause every id-less block to appear selected together.
  const isSelected = !!block.id && (selectedBlockIds.length > 1 ? selectedBlockIds.includes(block.id) : selectedBlockId === block.id);
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
        onContextMenu={(e) => {
          if (!onContextMenu) return;
          e.preventDefault();
          e.stopPropagation();
          onContextMenu(block.id, e.clientX, e.clientY);
        }}
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
        {block.required ? (
          <span className="material-icons text-xs text-muted-foreground/30 shrink-0" title="Required">lock</span>
        ) : (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onDelete(block.id); }}
            className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground/30 hover:text-destructive opacity-0 group-hover/layer:opacity-100 transition-all shrink-0 relative z-10"
            title="Delete"
          ><span className="material-icons text-xs">close</span></button>
        )}
      </div>

      {/* Nested children with drop zones */}
      {expanded && children.map((child, ci) => (
        <div key={ci}>
          <div className="text-[9px] text-muted-foreground uppercase tracking-wider" style={{ paddingLeft: `${(depth + 1) * 12 + 20}px` }}>
            {child.label}
          </div>
          {child.blocks.map((nested) => (
            <LayerItem key={nested.id} block={nested} depth={depth + 1} selectedBlockId={selectedBlockId} selectedBlockIds={selectedBlockIds} onSelect={onSelect} onDelete={onDelete} onUpdate={onUpdate} onContextMenu={onContextMenu} />
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

// ─── BLOCK_ELEMENTS ──────────────────────────────────────────────────────────
// Source of truth for sub-element tabs in the style panel.
// Every entry's `key` MUST match a `getElementCSS(block.elementStyles, '<key>')`
// call in the block's render component. Missing keys = uneditable parts.
// Audited 2026-04-16 against all render files.
const BLOCK_ELEMENTS: Record<string, { key: string; label: string }[]> = {
  hero: [
    { key: '_block', label: 'Block' },
    { key: 'title', label: 'Title' },
    { key: 'subtitle', label: 'Subtitle' },
    { key: 'description', label: 'Description' },
    { key: 'cta', label: 'CTA Button' },
    { key: 'secondaryCta', label: 'Secondary CTA' },
  ],
  'hero-slideshow': [
    { key: '_block', label: 'Block' },
    { key: 'title', label: 'Slide Title' },
    { key: 'subtitle', label: 'Slide Subtitle' },
    { key: 'description', label: 'Slide Description' },
    { key: 'cta', label: 'Primary Button' },
    { key: 'secondaryCta', label: 'Secondary Button' },
    { key: 'statValue', label: 'Stat Value' },
    { key: 'statLabel', label: 'Stat Label' },
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
    { key: 'cardIcon', label: 'Card Icon' },
    { key: 'cardImage', label: 'Card Image' },
    { key: 'cardLink', label: 'Card Link' },
  ],
  'flip-card-grid': [
    { key: '_block', label: 'Block' },
    { key: 'overline', label: 'Overline' },
    { key: 'title', label: 'Title' },
    { key: 'description', label: 'Description' },
    { key: 'frontCard', label: 'Front Card' },
    { key: 'frontTitle', label: 'Front Title' },
    { key: 'frontSubtitle', label: 'Front Subtitle' },
    { key: 'frontIcon', label: 'Front Icon' },
    { key: 'backCard', label: 'Back Card' },
    { key: 'backText', label: 'Back Text' },
    { key: 'backLink', label: 'Back Link' },
  ],
  'metric-cards': [
    { key: '_block', label: 'Block' },
    { key: 'overline', label: 'Overline' },
    { key: 'title', label: 'Title' },
    { key: 'description', label: 'Description' },
    { key: 'card', label: 'Card' },
    { key: 'value', label: 'Value' },
    { key: 'label', label: 'Label' },
    { key: 'institution', label: 'Institution' },
    { key: 'link', label: 'Link' },
  ],
  'logo-strip': [
    { key: '_block', label: 'Block' },
    { key: 'overline', label: 'Overline' },
    { key: 'logo', label: 'Logo' },
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
    { key: 'quoteIcon', label: 'Quote Icon' },
    { key: 'author', label: 'Author' },
  ],
  'services-grid': [
    { key: '_block', label: 'Block' },
    { key: 'overline', label: 'Overline' },
    { key: 'title', label: 'Title' },
    { key: 'description', label: 'Description' },
    { key: 'card', label: 'Card' },
    { key: 'serviceTitle', label: 'Service Title' },
    { key: 'serviceDescription', label: 'Service Text' },
    { key: 'serviceIcon', label: 'Service Icon' },
    { key: 'serviceImage', label: 'Service Image' },
    { key: 'bullet', label: 'Bullets' },
    { key: 'serviceLink', label: 'Service Link' },
  ],
  'featured-content': [
    { key: '_block', label: 'Block' },
    { key: 'title', label: 'Title' },
    { key: 'description', label: 'Description' },
    { key: 'button', label: 'Button' },
    { key: 'statValue', label: 'Stat Value' },
    { key: 'statLabel', label: 'Stat Label' },
  ],
  accordion: [
    { key: '_block', label: 'Block' },
    { key: 'title', label: 'Title' },
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
    { key: '_block', label: 'Block' },
    { key: 'title', label: 'Title' },
    { key: 'description', label: 'Description' },
  ],
  'survey': [
    { key: '_block', label: 'Block' },
    { key: 'title', label: 'Title' },
    { key: 'description', label: 'Description' },
  ],
  'blog-posts': [
    { key: '_block', label: 'Block' },
    { key: 'title', label: 'Title' },
    { key: 'description', label: 'Description' },
    { key: 'postTitle', label: 'Post Title' },
    { key: 'postExcerpt', label: 'Post Excerpt' },
  ],
  'bento-grid': [
    { key: '_block', label: 'Block' },
    { key: 'overline', label: 'Overline' },
    { key: 'title', label: 'Title' },
    { key: 'subtitle', label: 'Subtitle' },
    { key: 'cardTitle', label: 'Card Title' },
    { key: 'cardLead', label: 'Card Lead' },
  ],
  'booking-menu': [
    { key: '_block', label: 'Block' },
    { key: 'title', label: 'Title' },
    { key: 'description', label: 'Description' },
  ],
  'featured-products': [
    { key: '_block', label: 'Block' },
    { key: 'title', label: 'Title' },
    { key: 'description', label: 'Description' },
  ],
  gallery: [
    { key: '_block', label: 'Block' },
    { key: 'caption', label: 'Caption' },
  ],
  'product-grid': [
    { key: '_block', label: 'Block' },
    { key: 'title', label: 'Title' },
    { key: 'description', label: 'Description' },
  ],
  'store-banner': [
    { key: '_block', label: 'Block' },
    { key: 'title', label: 'Title' },
    { key: 'subtitle', label: 'Subtitle' },
    { key: 'button', label: 'Button' },
    { key: 'discountCode', label: 'Discount Code' },
  ],
  'team-showcase': [
    { key: '_block', label: 'Block' },
    { key: 'overline', label: 'Overline' },
    { key: 'title', label: 'Title' },
    { key: 'subtitle', label: 'Subtitle' },
    { key: 'memberName', label: 'Member Name' },
    { key: 'memberTitle', label: 'Member Title' },
    { key: 'memberBio', label: 'Member Bio' },
    { key: 'memberCredentials', label: 'Credentials' },
    { key: 'specialtyTag', label: 'Specialty Tag' },
  ],
  timeline: [
    { key: '_block', label: 'Block' },
    { key: 'overline', label: 'Overline' },
    { key: 'title', label: 'Title' },
    { key: 'subtitle', label: 'Subtitle' },
    { key: 'stepTitle', label: 'Step Title' },
    { key: 'stepDescription', label: 'Step Text' },
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
      {/* Element sub-tabs — sticky to top of the style panel scroll area.
          Negative margins cancel the parent's p-4 so the sticky bar reaches
          edge-to-edge when pinned; internal padding restores the visual inset. */}
      <div className="sticky top-0 z-10 -mx-4 -mt-4 px-4 pt-0 pb-2 bg-background border-b border-border">
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
          <Field label="Icon (Material Icon name)" value={(b.icon as string) || ''} onChange={(v) => onUpdate({ icon: v || undefined } as Partial<Block>)} />
          <div>
            <span className="text-xs font-medium text-muted-foreground">Icon Position</span>
            <select
              value={(b.iconPosition as string) || 'left'}
              onChange={(e) => onUpdate({ iconPosition: e.target.value } as Partial<Block>)}
              disabled={!(b.icon as string)}
              className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground mt-1"
            >
              <option value="left">Left of text</option>
              <option value="right">Right of text</option>
            </select>
          </div>
          <SelectField label="Hover Effect" value={(b.hoverEffect as string) || 'none'} options={['none','lift','glow','fill','slide','pulse']} onChange={(v) => onUpdate({ hoverEffect: v } as Partial<Block>)} />
          <div>
            <Field label="Brand Preset (optional)" value={(b.presetId as string) || ''} onChange={(v) => onUpdate({ presetId: v || undefined } as Partial<Block>)} />
            <p className="text-xs text-muted-foreground mt-0.5">Preset key from brand presets. Preset styles apply first, block styles override on top.</p>
          </div>
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
          <ColorField label="Background Color" value={(b.backgroundColor as string) || ''} onChange={(v) => onUpdate({ backgroundColor: v } as Partial<Block>)} />
          <div><span className="text-xs font-medium text-muted-foreground">Background Image</span><MediaPicker value={b.backgroundImage as string} onChange={(v) => onUpdate({ backgroundImage: v } as Partial<Block>)} mimeTypeFilter="image" label="" apiEndpoint={mediaApi} /></div>
          <Field label="Max Width" value={b.maxWidth as string} onChange={(v) => onUpdate({ maxWidth: v } as Partial<Block>)} />
          <ColorField label="Text Color" value={(b.color as string) || ''} onChange={(v) => onUpdate({ color: v } as Partial<Block>)} />
          <div>
            <span className="text-xs font-medium text-muted-foreground">Font Family</span>
            <GoogleFontPicker value={(b.fontFamily as string) || ''} onChange={(v) => onUpdate({ fontFamily: v } as Partial<Block>)} />
          </div>
          <SelectField label="HTML Tag" value={(b.htmlTag as string) || 'section'} options={['section','div','article','aside','header','footer']} onChange={(v) => onUpdate({ htmlTag: v } as Partial<Block>)} />
          <details className="pt-2 border-t border-border mt-2">
            <summary className="flex items-center gap-1.5 cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground select-none py-1">
              <span className="material-icons text-sm">call_split</span>
              Diagonal Split (advanced)
            </summary>
            <div className="pt-3 space-y-3">
              <p className="text-xs text-muted-foreground">Optional second-color overlay rendered with a clip-path. Leave blank to disable.</p>
              <ColorField label="Split Color" value={(b.splitColor as string) || ''} onChange={(v) => onUpdate({ splitColor: v || undefined } as Partial<Block>)} />
              <div>
                <span className="text-xs font-medium text-muted-foreground">Clip Path</span>
                <input
                  type="text"
                  value={(b.splitClipPath as string) || ''}
                  onChange={(e) => onUpdate({ splitClipPath: e.target.value || undefined } as Partial<Block>)}
                  placeholder="polygon(55% 0, 100% 0, 100% 100%, 45% 100%)"
                  className="w-full text-xs font-mono rounded border border-border bg-background px-2 py-1.5 text-foreground mt-1"
                />
                <p className="text-xs text-muted-foreground mt-0.5">Defaults to a right-side diagonal when Split Color is set.</p>
              </div>
            </div>
          </details>
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

      {/* ── Flip Card Grid Block ── */}
      {block.type === 'flip-card-grid' && (
        <>
          <RichTextField label="Overline" value={b.overline as string} onChange={(v) => onUpdate({ overline: v } as Partial<Block>)} singleLine />
          <RichTextField label="Title" value={b.title as string} onChange={(v) => onUpdate({ title: v } as Partial<Block>)} singleLine />
          <RichTextField label="Description" value={b.description as string} onChange={(v) => onUpdate({ description: v } as Partial<Block>)} />
          <SelectField label="Columns" value={String(b.columns || 3)} options={['2','3','4']} onChange={(v) => onUpdate({ columns: Number(v) } as Partial<Block>)} />
          <SelectField label="Flip Trigger" value={(b.flipTrigger as string) || 'hover'} options={['hover','click']} onChange={(v) => onUpdate({ flipTrigger: v } as Partial<Block>)} />
          <SelectField label="Flip Axis" value={(b.flipAxis as string) || 'horizontal'} options={['horizontal','vertical']} onChange={(v) => onUpdate({ flipAxis: v } as Partial<Block>)} />
          <Field label="Card Height" value={(b.cardHeight as string) || '280px'} onChange={(v) => onUpdate({ cardHeight: v } as Partial<Block>)} />
          <ColorField label="Accent Color" value={(b.accentColor as string) || ''} onChange={(v) => onUpdate({ accentColor: v } as Partial<Block>)} />
          <ListEditor
            label="Cards"
            items={(block.cards || []).map(c => ({ id: c.id, fields: { frontTitle: c.frontTitle, frontSubtitle: c.frontSubtitle || '', frontIcon: c.frontIcon || '', frontImage: c.frontImage || '', backText: c.backText, backLink: c.backLink || '', backLinkText: c.backLinkText || '' } }))}
            fieldDefs={[
              { name: 'frontTitle', label: 'Front Title', placeholder: 'Card title' },
              { name: 'frontSubtitle', label: 'Front Subtitle', placeholder: 'Optional subtitle' },
              { name: 'frontIcon', label: 'Front Icon', type: 'icon' as const },
              { name: 'frontImage', label: 'Front Image', type: 'image' as const },
              { name: 'backText', label: 'Back Text', placeholder: 'Revealed when flipped', multiline: true },
              { name: 'backLink', label: 'Back Link URL', placeholder: 'https://…' },
              { name: 'backLinkText', label: 'Back Link Text', placeholder: 'Learn More' },
            ]}
            onAdd={() => onUpdate({ cards: [...(block.cards || []), { id: uid(), frontTitle: 'New Card', backText: 'Back side content' }] } as Partial<Block>)}
            onRemove={(id) => onUpdate({ cards: block.cards.filter(c => c.id !== id) } as Partial<Block>)}
            onItemChange={(id, field, value) => onUpdate({ cards: block.cards.map(c => c.id === id ? { ...c, [field]: value } : c) } as Partial<Block>)}
            onReorder={(ids) => onUpdate({ cards: ids.map(id => block.cards.find(c => c.id === id)!).filter(Boolean) } as Partial<Block>)}
          />
        </>
      )}

      {/* ── Metric Cards Block — case-study-style ── */}
      {block.type === 'metric-cards' && (
        <>
          <RichTextField label="Overline" value={b.overline as string} onChange={(v) => onUpdate({ overline: v } as Partial<Block>)} singleLine />
          <RichTextField label="Title" value={b.title as string} onChange={(v) => onUpdate({ title: v } as Partial<Block>)} singleLine />
          <RichTextField label="Description" value={b.description as string} onChange={(v) => onUpdate({ description: v } as Partial<Block>)} />
          <SelectField label="Columns" value={String(b.columns || 4)} options={['2','3','4']} onChange={(v) => onUpdate({ columns: Number(v) } as Partial<Block>)} />
          <ColorField label="Accent Color" value={(b.accentColor as string) || ''} onChange={(v) => onUpdate({ accentColor: v } as Partial<Block>)} />
          <ListEditor
            label="Metrics"
            items={(block.metrics || []).map(m => ({ id: m.id, fields: { value: m.value, label: m.label, institution: m.institution || '', institutionLogo: m.institutionLogo || '', link: m.link || '', linkText: m.linkText || '' } }))}
            fieldDefs={[
              { name: 'value', label: 'Metric Value', placeholder: '83%' },
              { name: 'label', label: 'Label', placeholder: 'Increase in Readmit Completions', multiline: true },
              { name: 'institution', label: 'Institution', placeholder: 'William Peace University' },
              { name: 'institutionLogo', label: 'Institution Logo', type: 'image' as const },
              { name: 'link', label: 'Link URL', placeholder: 'https://…' },
              { name: 'linkText', label: 'Link Text', placeholder: 'Case Study' },
            ]}
            onAdd={() => onUpdate({ metrics: [...(block.metrics || []), { id: uid(), value: '100%', label: 'Metric Label' }] } as Partial<Block>)}
            onRemove={(id) => onUpdate({ metrics: block.metrics.filter(m => m.id !== id) } as Partial<Block>)}
            onItemChange={(id, field, value) => onUpdate({ metrics: block.metrics.map(m => m.id === id ? { ...m, [field]: value } : m) } as Partial<Block>)}
            onReorder={(ids) => onUpdate({ metrics: ids.map(id => block.metrics.find(m => m.id === id)!).filter(Boolean) } as Partial<Block>)}
          />
        </>
      )}

      {/* ── Logo Strip Block ── */}
      {block.type === 'logo-strip' && (
        <>
          <RichTextField label="Overline" value={b.overline as string} onChange={(v) => onUpdate({ overline: v } as Partial<Block>)} singleLine />
          <SelectField label="Columns" value={String(b.columns || 6)} options={['3','4','5','6','7','8']} onChange={(v) => onUpdate({ columns: Number(v) } as Partial<Block>)} />
          <Field label="Logo Height" value={(b.logoHeight as string) || '40px'} onChange={(v) => onUpdate({ logoHeight: v } as Partial<Block>)} />
          <SelectField label="Gap" value={(b.gap as string) || 'lg'} options={['sm','md','lg']} onChange={(v) => onUpdate({ gap: v } as Partial<Block>)} />
          <SelectField label="Alignment" value={(b.alignment as string) || 'center'} options={['left','center','right']} onChange={(v) => onUpdate({ alignment: v } as Partial<Block>)} />
          <CheckboxField label="Grayscale (color on hover)" checked={b.grayscale as boolean ?? true} onChange={(v) => onUpdate({ grayscale: v } as Partial<Block>)} />
          <ListEditor
            label="Logos"
            items={(block.logos || []).map(l => ({ id: l.id, fields: { imageUrl: l.imageUrl, alt: l.alt, link: l.link || '' } }))}
            fieldDefs={[
              { name: 'imageUrl', label: 'Logo Image', type: 'image' as const },
              { name: 'alt', label: 'Alt Text', placeholder: 'Company name' },
              { name: 'link', label: 'Link URL', placeholder: 'https://…' },
            ]}
            onAdd={() => onUpdate({ logos: [...(block.logos || []), { id: uid(), imageUrl: '', alt: '' }] } as Partial<Block>)}
            onRemove={(id) => onUpdate({ logos: block.logos.filter(l => l.id !== id) } as Partial<Block>)}
            onItemChange={(id, field, value) => onUpdate({ logos: block.logos.map(l => l.id === id ? { ...l, [field]: value } : l) } as Partial<Block>)}
            onReorder={(ids) => onUpdate({ logos: ids.map(id => block.logos.find(l => l.id === id)!).filter(Boolean) } as Partial<Block>)}
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
          <RichTextField label="Overline" value={b.overline as string} onChange={(v) => onUpdate({ overline: v } as Partial<Block>)} singleLine />
          <RichTextField label="Title" value={b.title as string} onChange={(v) => onUpdate({ title: v } as Partial<Block>)} singleLine />
          <RichTextField label="Description" value={b.description as string} onChange={(v) => onUpdate({ description: v } as Partial<Block>)} />
          <SelectField label="Columns" value={String(b.columns || 3)} options={['2','3','4']} onChange={(v) => onUpdate({ columns: Number(v) } as Partial<Block>)} />
          <ColorField label="Accent Color" value={(b.accentColor as string) || ''} onChange={(v) => onUpdate({ accentColor: v } as Partial<Block>)} />
          <ListEditor
            label="Services"
            items={(block.services || []).map(s => ({ id: s.id, fields: { title: s.title, description: s.description, icon: s.icon || '', link: s.link || '', linkText: s.linkText || '' } }))}
            fieldDefs={[
              { name: 'title', label: 'Title', placeholder: 'Service name' },
              { name: 'description', label: 'Description', placeholder: 'Service description', multiline: true },
              { name: 'icon', label: 'Icon', type: 'icon' as const },
              { name: 'link', label: 'Link URL', placeholder: 'https://...' },
              { name: 'linkText', label: 'Link Text', placeholder: 'Learn More' },
            ]}
            onAdd={() => onUpdate({ services: [...(block.services || []), { id: uid(), title: 'New service', description: '', bullets: [] }] } as Partial<Block>)}
            onRemove={(id) => onUpdate({ services: block.services.filter(s => s.id !== id) } as Partial<Block>)}
            onItemChange={(id, field, value) => onUpdate({ services: block.services.map(s => s.id === id ? { ...s, [field]: value } : s) } as Partial<Block>)}
            onReorder={(ids) => onUpdate({ services: ids.map(id => block.services.find(s => s.id === id)!).filter(Boolean) } as Partial<Block>)}
          />
          {/* Per-service bullets editor — one ListEditor per service since bullets
              are nested arrays and the generic ListEditor doesn't handle nested lists. */}
          {(block.services || []).length > 0 && (
            <div className="space-y-3 border border-border rounded p-2">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Bullets per service</div>
              {(block.services || []).map((service) => (
                <div key={`bullets-${service.id}`} className="space-y-1.5">
                  <div className="text-[11px] font-medium text-foreground">{service.title || 'Untitled service'}</div>
                  <ListEditor
                    label="Bullets"
                    items={(service.bullets || []).map(bl => ({ id: bl.id, fields: { text: bl.text, icon: bl.icon || '' } }))}
                    fieldDefs={[
                      { name: 'text', label: 'Text', placeholder: 'Benefit or feature' },
                      { name: 'icon', label: 'Icon', type: 'icon' as const },
                    ]}
                    onAdd={() => onUpdate({ services: block.services.map(s => s.id === service.id ? { ...s, bullets: [...(s.bullets || []), { id: uid(), text: 'New bullet', icon: 'check_circle' }] } : s) } as Partial<Block>)}
                    onRemove={(bid) => onUpdate({ services: block.services.map(s => s.id === service.id ? { ...s, bullets: (s.bullets || []).filter(bl => bl.id !== bid) } : s) } as Partial<Block>)}
                    onItemChange={(bid, field, value) => onUpdate({ services: block.services.map(s => s.id === service.id ? { ...s, bullets: (s.bullets || []).map(bl => bl.id === bid ? { ...bl, [field]: value } : bl) } : s) } as Partial<Block>)}
                    onReorder={(bids) => onUpdate({ services: block.services.map(s => s.id === service.id ? { ...s, bullets: bids.map(bid => (s.bullets || []).find(bl => bl.id === bid)!).filter(Boolean) } : s) } as Partial<Block>)}
                  />
                </div>
              ))}
            </div>
          )}
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
          <ColorField label="Accent Color" value={(b.accentColor as string) || ''} onChange={(v) => onUpdate({ accentColor: v } as Partial<Block>)} />
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
          <CheckboxField label="Show Logo" checked={b.showLogo !== false} onChange={(v) => onUpdate({ showLogo: v } as Partial<Block>)} />

          {/* Style Overrides */}
          <details className="pt-2 border-t border-border mt-2">
            <summary className="flex items-center gap-1.5 cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground select-none py-1">
              <span className="material-icons text-sm">palette</span>
              Style Overrides
            </summary>
            <div className="pt-3 space-y-3">
              <ColorField label="Primary Color" value={(b.styleOverrides as Record<string,string>)?.primaryColor || ''} onChange={(v) => onUpdate({ styleOverrides: { ...((b.styleOverrides as Record<string,string>) || {}), primaryColor: v } } as Partial<Block>)} />
              <ColorField label="Background" value={(b.styleOverrides as Record<string,string>)?.backgroundColor || ''} onChange={(v) => onUpdate({ styleOverrides: { ...((b.styleOverrides as Record<string,string>) || {}), backgroundColor: v } } as Partial<Block>)} />
              <ColorField label="Text Color" value={(b.styleOverrides as Record<string,string>)?.textColor || ''} onChange={(v) => onUpdate({ styleOverrides: { ...((b.styleOverrides as Record<string,string>) || {}), textColor: v } } as Partial<Block>)} />
              <ColorField label="Form Background" value={(b.styleOverrides as Record<string,string>)?.formBg || ''} onChange={(v) => onUpdate({ styleOverrides: { ...((b.styleOverrides as Record<string,string>) || {}), formBg: v } } as Partial<Block>)} />
              <ColorField label="Input Background" value={(b.styleOverrides as Record<string,string>)?.inputBg || ''} onChange={(v) => onUpdate({ styleOverrides: { ...((b.styleOverrides as Record<string,string>) || {}), inputBg: v } } as Partial<Block>)} />
              <ColorField label="Button Background" value={(b.styleOverrides as Record<string,string>)?.buttonBg || ''} onChange={(v) => onUpdate({ styleOverrides: { ...((b.styleOverrides as Record<string,string>) || {}), buttonBg: v } } as Partial<Block>)} />
              <ColorField label="Button Text" value={(b.styleOverrides as Record<string,string>)?.buttonText || ''} onChange={(v) => onUpdate({ styleOverrides: { ...((b.styleOverrides as Record<string,string>) || {}), buttonText: v } } as Partial<Block>)} />
              <div>
                <span className="text-xs font-medium text-muted-foreground">Heading Font</span>
                <GoogleFontPicker value={(b.styleOverrides as Record<string,string>)?.headingFont || ''} onChange={(v) => onUpdate({ styleOverrides: { ...((b.styleOverrides as Record<string,string>) || {}), headingFont: v } } as Partial<Block>)} />
              </div>
              <div>
                <span className="text-xs font-medium text-muted-foreground">Body Font</span>
                <GoogleFontPicker value={(b.styleOverrides as Record<string,string>)?.bodyFont || ''} onChange={(v) => onUpdate({ styleOverrides: { ...((b.styleOverrides as Record<string,string>) || {}), bodyFont: v } } as Partial<Block>)} />
              </div>
              <SelectField label="Button Radius" value={(b.styleOverrides as Record<string,string>)?.buttonBorderRadius || ''} options={['', '0px', '4px', '8px', '12px', '9999px']} onChange={(v) => onUpdate({ styleOverrides: { ...((b.styleOverrides as Record<string,string>) || {}), buttonBorderRadius: v } } as Partial<Block>)} />
              <SelectField label="Card Radius" value={(b.styleOverrides as Record<string,string>)?.borderRadius || ''} options={['', '0px', '4px', '8px', '12px', '16px', '24px']} onChange={(v) => onUpdate({ styleOverrides: { ...((b.styleOverrides as Record<string,string>) || {}), borderRadius: v } } as Partial<Block>)} />
            </div>
          </details>
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
      {block.type === 'deck-next-slide' && (
        <>
          <Field label="Button Text" value={(b.text as string) || 'Next Slide'} onChange={(v) => onUpdate({ text: v } as Partial<Block>)} />
          <SelectField label="Variant" value={(b.variant as string) || 'primary'} options={['primary','secondary','outline']} onChange={(v) => onUpdate({ variant: v } as Partial<Block>)} />
          <SelectField label="Size" value={(b.size as string) || 'md'} options={['sm','md','lg']} onChange={(v) => onUpdate({ size: v } as Partial<Block>)} />
          <SelectField label="Alignment" value={(b.alignment as string) || 'center'} options={['left','center','right']} onChange={(v) => onUpdate({ alignment: v } as Partial<Block>)} />
          <Field label="Icon" value={(b.icon as string) || ''} onChange={(v) => onUpdate({ icon: v } as Partial<Block>)} />
          <SelectField label="Icon Position" value={(b.iconPosition as string) || 'left'} options={['left','right']} onChange={(v) => onUpdate({ iconPosition: v } as Partial<Block>)} />
        </>
      )}
      {block.type === 'deck-jump-to' && (
        <>
          <Field label="Button Text" value={(b.text as string) || 'Jump To'} onChange={(v) => onUpdate({ text: v } as Partial<Block>)} />
          <Field label="Target Slide #" value={String((b.targetSlide as number) || 1)} onChange={(v) => onUpdate({ targetSlide: parseInt(v, 10) || 1 } as Partial<Block>)} />
          <SelectField label="Variant" value={(b.variant as string) || 'secondary'} options={['primary','secondary','outline']} onChange={(v) => onUpdate({ variant: v } as Partial<Block>)} />
          <SelectField label="Size" value={(b.size as string) || 'md'} options={['sm','md','lg']} onChange={(v) => onUpdate({ size: v } as Partial<Block>)} />
          <SelectField label="Alignment" value={(b.alignment as string) || 'center'} options={['left','center','right']} onChange={(v) => onUpdate({ alignment: v } as Partial<Block>)} />
          <Field label="Icon" value={(b.icon as string) || ''} onChange={(v) => onUpdate({ icon: v } as Partial<Block>)} />
          <SelectField label="Icon Position" value={(b.iconPosition as string) || 'left'} options={['left','right']} onChange={(v) => onUpdate({ iconPosition: v } as Partial<Block>)} />
        </>
      )}

      {/* ── Booking Menu Block ── */}
      {block.type === 'booking-menu' && (
        <>
          <RichTextField label="Title" value={b.title as string} onChange={(v) => onUpdate({ title: v } as Partial<Block>)} singleLine />
          <RichTextField label="Description" value={b.description as string} onChange={(v) => onUpdate({ description: v } as Partial<Block>)} singleLine />
          <SelectField label="Columns" value={String(b.columns || 3)} options={['2','3','4']} onChange={(v) => onUpdate({ columns: Number(v) } as Partial<Block>)} />
          <p className="text-xs text-muted-foreground">Booking pages are pulled live from this site&apos;s published bookings. Add booking pages from the Bookings admin to populate the grid.</p>
        </>
      )}

      {/* ── Social Links Block ── */}
      {block.type === 'social-links' && (
        <>
          <SelectField label="Alignment" value={(b.alignment as string) || 'center'} options={['left','center','right']} onChange={(v) => onUpdate({ alignment: v } as Partial<Block>)} />
          <SelectField label="Icon Size (px)" value={String((b.iconSize as number) ?? 32)} options={['24','32','40']} onChange={(v) => onUpdate({ iconSize: Number(v) } as Partial<Block>)} />
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Links ({((b.links as Array<{platform: string; url: string}>) || []).length})</span>
            </div>
            {((b.links as Array<{platform: string; url: string}>) || []).map((link, i) => (
              <div key={i} className="flex gap-2 items-center">
                <select
                  value={link.platform}
                  onChange={(e) => {
                    const next = [...((b.links as Array<{platform: string; url: string}>) || [])];
                    next[i] = { ...next[i], platform: e.target.value };
                    onUpdate({ links: next } as Partial<Block>);
                  }}
                  className="text-xs rounded border border-border bg-background px-2 py-2 text-foreground"
                >
                  {(['facebook','twitter','instagram','linkedin','youtube','tiktok'] as const).map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <input
                  type="url"
                  value={link.url}
                  onChange={(e) => {
                    const next = [...((b.links as Array<{platform: string; url: string}>) || [])];
                    next[i] = { ...next[i], url: e.target.value };
                    onUpdate({ links: next } as Partial<Block>);
                  }}
                  className="flex-1 text-xs rounded border border-border bg-background px-2 py-2 text-foreground"
                  placeholder="https://"
                />
                <button
                  type="button"
                  onClick={() => onUpdate({ links: ((b.links as Array<{platform: string; url: string}>) || []).filter((_, j) => j !== i) } as Partial<Block>)}
                  className="px-2 py-2 text-xs rounded border border-border text-destructive hover:bg-destructive/10"
                >
                  <span className="material-icons text-xs">delete</span>
                </button>
              </div>
            ))}
            {((b.links as Array<{platform: string; url: string}>) || []).length < 6 && (
              <button
                type="button"
                onClick={() => onUpdate({ links: [...((b.links as Array<{platform: string; url: string}>) || []), { platform: 'facebook', url: '' }] } as Partial<Block>)}
                className="w-full px-3 py-2 text-xs font-medium rounded border border-dashed border-border text-muted-foreground hover:text-foreground hover:bg-accent/50"
              >
                + Add Link
              </button>
            )}
          </div>
        </>
      )}

      {/* ── Timeline Block ── */}
      {block.type === 'timeline' && (
        <>
          <Field label="Overline" value={(b.overline as string) || ''} onChange={(v) => onUpdate({ overline: v || undefined } as Partial<Block>)} />
          <RichTextField label="Title" value={b.title as string} onChange={(v) => onUpdate({ title: v } as Partial<Block>)} singleLine />
          <RichTextField label="Subtitle" value={b.subtitle as string} onChange={(v) => onUpdate({ subtitle: v } as Partial<Block>)} singleLine />
          <SelectField label="Layout" value={(b.layout as string) || 'alternating'} options={['alternating','left']} onChange={(v) => onUpdate({ layout: v } as Partial<Block>)} />
          <div className="grid grid-cols-3 gap-2">
            <ColorField label="Line Color" value={(b.lineColor as string) || ''} onChange={(v) => onUpdate({ lineColor: v || undefined } as Partial<Block>)} />
            <ColorField label="Number Color" value={(b.numberColor as string) || ''} onChange={(v) => onUpdate({ numberColor: v || undefined } as Partial<Block>)} />
            <ColorField label="Node Color" value={(b.nodeColor as string) || ''} onChange={(v) => onUpdate({ nodeColor: v || undefined } as Partial<Block>)} />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Steps ({((b.steps as Array<{id?: string; number?: string; icon?: string; title: string; description: string}>) || []).length})</span>
              <button type="button" onClick={() => onUpdate({ steps: [...((b.steps as Array<{id?: string; number?: string; icon?: string; title: string; description: string}>) || []), { id: `step-${Date.now()}`, title: '', description: '' }] } as Partial<Block>)} className="text-xs text-primary hover:text-primary/80 font-medium">+ Add</button>
            </div>
            {((b.steps as Array<{id?: string; number?: string; icon?: string; title: string; description: string}>) || []).map((step, i) => (
              <div key={step.id ?? i} className="space-y-1 p-2 rounded border border-border">
                <input type="text" value={step.number || ''} onChange={(e) => { const next = [...((b.steps as Array<{id?: string; number?: string; icon?: string; title: string; description: string}>) || [])]; next[i] = { ...next[i], number: e.target.value || undefined }; onUpdate({ steps: next } as Partial<Block>); }} className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground" placeholder="Number (e.g. 01) — optional" />
                <input type="text" value={step.icon || ''} onChange={(e) => { const next = [...((b.steps as Array<{id?: string; number?: string; icon?: string; title: string; description: string}>) || [])]; next[i] = { ...next[i], icon: e.target.value || undefined }; onUpdate({ steps: next } as Partial<Block>); }} className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground" placeholder="Material Icon name (optional, alt to number)" />
                <input type="text" value={step.title} onChange={(e) => { const next = [...((b.steps as Array<{id?: string; number?: string; icon?: string; title: string; description: string}>) || [])]; next[i] = { ...next[i], title: e.target.value }; onUpdate({ steps: next } as Partial<Block>); }} className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground font-bold" placeholder="Step title" />
                <textarea value={step.description} onChange={(e) => { const next = [...((b.steps as Array<{id?: string; number?: string; icon?: string; title: string; description: string}>) || [])]; next[i] = { ...next[i], description: e.target.value }; onUpdate({ steps: next } as Partial<Block>); }} className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground" placeholder="Step description" rows={2} />
                <button type="button" onClick={() => onUpdate({ steps: ((b.steps as Array<{id?: string; number?: string; icon?: string; title: string; description: string}>) || []).filter((_, j) => j !== i) } as Partial<Block>)} className="text-xs text-destructive hover:underline">Remove</button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Bento Grid Block ── */}
      {block.type === 'bento-grid' && (
        <>
          <Field label="Overline" value={(b.overline as string) || ''} onChange={(v) => onUpdate({ overline: v || undefined } as Partial<Block>)} />
          <RichTextField label="Title" value={b.title as string} onChange={(v) => onUpdate({ title: v } as Partial<Block>)} singleLine />
          <RichTextField label="Subtitle" value={b.subtitle as string} onChange={(v) => onUpdate({ subtitle: v } as Partial<Block>)} singleLine />
          <div className="grid grid-cols-3 gap-2">
            <SelectField label="Columns" value={String(b.columns || 2)} options={['1','2','3']} onChange={(v) => onUpdate({ columns: Number(v) } as Partial<Block>)} />
            <ColorField label="Dark BG" value={(b.darkBg as string) || ''} onChange={(v) => onUpdate({ darkBg: v || undefined } as Partial<Block>)} />
            <ColorField label="Light Border" value={(b.lightBorder as string) || ''} onChange={(v) => onUpdate({ lightBorder: v || undefined } as Partial<Block>)} />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Cards ({((b.cards as Array<{id?: string; title: string; lead?: string; items?: string[]; link?: string; linkText?: string; variant?: string; span?: number}>) || []).length})</span>
              <button type="button" onClick={() => onUpdate({ cards: [...((b.cards as Array<{id?: string; title: string; lead?: string; items?: string[]; link?: string; linkText?: string; variant?: string; span?: number}>) || []), { id: `bento-${Date.now()}`, title: '', items: [], variant: 'dark', span: 6 }] } as Partial<Block>)} className="text-xs text-primary hover:text-primary/80 font-medium">+ Add</button>
            </div>
            {((b.cards as Array<{id?: string; title: string; lead?: string; items?: string[]; link?: string; linkText?: string; variant?: string; span?: number}>) || []).map((card, i) => (
              <div key={card.id ?? i} className="space-y-1 p-2 rounded border border-border">
                <input type="text" value={card.title} onChange={(e) => { const next = [...((b.cards as Array<{id?: string; title: string; lead?: string; items?: string[]; link?: string; linkText?: string; variant?: string; span?: number}>) || [])]; next[i] = { ...next[i], title: e.target.value }; onUpdate({ cards: next } as Partial<Block>); }} className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground font-bold" placeholder="Title" />
                <input type="text" value={card.lead || ''} onChange={(e) => { const next = [...((b.cards as Array<{id?: string; title: string; lead?: string; items?: string[]; link?: string; linkText?: string; variant?: string; span?: number}>) || [])]; next[i] = { ...next[i], lead: e.target.value || undefined }; onUpdate({ cards: next } as Partial<Block>); }} className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground italic" placeholder="Lead/question (optional)" />
                <textarea value={(card.items || []).join('\n')} onChange={(e) => { const next = [...((b.cards as Array<{id?: string; title: string; lead?: string; items?: string[]; link?: string; linkText?: string; variant?: string; span?: number}>) || [])]; next[i] = { ...next[i], items: e.target.value.split('\n').map((s: string) => s.trim()).filter(Boolean) }; onUpdate({ cards: next } as Partial<Block>); }} className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground" placeholder="Bullet items (one per line)" rows={3} />
                <input type="url" value={card.link || ''} onChange={(e) => { const next = [...((b.cards as Array<{id?: string; title: string; lead?: string; items?: string[]; link?: string; linkText?: string; variant?: string; span?: number}>) || [])]; next[i] = { ...next[i], link: e.target.value || undefined }; onUpdate({ cards: next } as Partial<Block>); }} className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground" placeholder="Link URL (optional)" />
                <input type="text" value={card.linkText || ''} onChange={(e) => { const next = [...((b.cards as Array<{id?: string; title: string; lead?: string; items?: string[]; link?: string; linkText?: string; variant?: string; span?: number}>) || [])]; next[i] = { ...next[i], linkText: e.target.value || undefined }; onUpdate({ cards: next } as Partial<Block>); }} className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground" placeholder="Link text (optional)" />
                <div className="flex gap-2">
                  <select value={card.variant || 'dark'} onChange={(e) => { const next = [...((b.cards as Array<{id?: string; title: string; lead?: string; items?: string[]; link?: string; linkText?: string; variant?: string; span?: number}>) || [])]; next[i] = { ...next[i], variant: e.target.value }; onUpdate({ cards: next } as Partial<Block>); }} className="flex-1 text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground">
                    <option value="dark">Dark</option>
                    <option value="light">Light</option>
                  </select>
                  <input type="number" min={1} max={12} value={card.span ?? 6} onChange={(e) => { const next = [...((b.cards as Array<{id?: string; title: string; lead?: string; items?: string[]; link?: string; linkText?: string; variant?: string; span?: number}>) || [])]; next[i] = { ...next[i], span: Number(e.target.value) }; onUpdate({ cards: next } as Partial<Block>); }} className="w-20 text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground" placeholder="Span" />
                </div>
                <button type="button" onClick={() => onUpdate({ cards: ((b.cards as Array<{id?: string; title: string; lead?: string; items?: string[]; link?: string; linkText?: string; variant?: string; span?: number}>) || []).filter((_, j) => j !== i) } as Partial<Block>)} className="text-xs text-destructive hover:underline">Remove</button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Team Showcase Block ── */}
      {block.type === 'team-showcase' && (
        <>
          <Field label="Overline" value={(b.overline as string) || ''} onChange={(v) => onUpdate({ overline: v || undefined } as Partial<Block>)} />
          <RichTextField label="Title" value={b.title as string} onChange={(v) => onUpdate({ title: v } as Partial<Block>)} singleLine />
          <RichTextField label="Subtitle" value={b.subtitle as string} onChange={(v) => onUpdate({ subtitle: v } as Partial<Block>)} singleLine />
          <div className="grid grid-cols-2 gap-2">
            <ColorField label="Bio Panel Color" value={(b.bioPanelColor as string) || ''} onChange={(v) => onUpdate({ bioPanelColor: v || undefined } as Partial<Block>)} />
            <ColorField label="Accent Color" value={(b.accentColor as string) || ''} onChange={(v) => onUpdate({ accentColor: v || undefined } as Partial<Block>)} />
          </div>
          <Field label="Photo Filter (CSS)" value={(b.photoFilter as string) || ''} onChange={(v) => onUpdate({ photoFilter: v || undefined } as Partial<Block>)} />
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Members ({((b.members as Array<{id?: string; name: string; title: string; credentials?: string; photo: string; bio: string; specialties?: string[]}>) || []).length})</span>
              <button type="button" onClick={() => onUpdate({ members: [...((b.members as Array<{id?: string; name: string; title: string; credentials?: string; photo: string; bio: string; specialties?: string[]}>) || []), { id: `member-${Date.now()}`, name: '', title: '', photo: '', bio: '' }] } as Partial<Block>)} className="text-xs text-primary hover:text-primary/80 font-medium">+ Add</button>
            </div>
            {((b.members as Array<{id?: string; name: string; title: string; credentials?: string; photo: string; bio: string; specialties?: string[]}>) || []).map((member, i) => (
              <div key={member.id ?? i} className="space-y-1 p-2 rounded border border-border">
                <input type="text" value={member.name} onChange={(e) => { const next = [...((b.members as Array<{id?: string; name: string; title: string; credentials?: string; photo: string; bio: string; specialties?: string[]}>) || [])]; next[i] = { ...next[i], name: e.target.value }; onUpdate({ members: next } as Partial<Block>); }} className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground font-bold" placeholder="Name" />
                <input type="text" value={member.title} onChange={(e) => { const next = [...((b.members as Array<{id?: string; name: string; title: string; credentials?: string; photo: string; bio: string; specialties?: string[]}>) || [])]; next[i] = { ...next[i], title: e.target.value }; onUpdate({ members: next } as Partial<Block>); }} className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground" placeholder="Title" />
                <input type="text" value={member.credentials || ''} onChange={(e) => { const next = [...((b.members as Array<{id?: string; name: string; title: string; credentials?: string; photo: string; bio: string; specialties?: string[]}>) || [])]; next[i] = { ...next[i], credentials: e.target.value || undefined }; onUpdate({ members: next } as Partial<Block>); }} className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground" placeholder="Credentials (optional)" />
                <input type="url" value={member.photo} onChange={(e) => { const next = [...((b.members as Array<{id?: string; name: string; title: string; credentials?: string; photo: string; bio: string; specialties?: string[]}>) || [])]; next[i] = { ...next[i], photo: e.target.value }; onUpdate({ members: next } as Partial<Block>); }} className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground" placeholder="Photo URL" />
                <textarea value={member.bio} onChange={(e) => { const next = [...((b.members as Array<{id?: string; name: string; title: string; credentials?: string; photo: string; bio: string; specialties?: string[]}>) || [])]; next[i] = { ...next[i], bio: e.target.value }; onUpdate({ members: next } as Partial<Block>); }} className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground" placeholder="Bio" rows={3} />
                <input type="text" value={(member.specialties || []).join(', ')} onChange={(e) => { const next = [...((b.members as Array<{id?: string; name: string; title: string; credentials?: string; photo: string; bio: string; specialties?: string[]}>) || [])]; const list = e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean); next[i] = { ...next[i], specialties: list.length ? list : undefined }; onUpdate({ members: next } as Partial<Block>); }} className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground" placeholder="Specialties (comma-separated, optional)" />
                <button type="button" onClick={() => onUpdate({ members: ((b.members as Array<{id?: string; name: string; title: string; credentials?: string; photo: string; bio: string; specialties?: string[]}>) || []).filter((_, j) => j !== i) } as Partial<Block>)} className="text-xs text-destructive hover:underline">Remove</button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Team Flip Grid Block ── */}
      {block.type === 'team-flip-grid' && (
        <>
          <Field label="Overline" value={(b.overline as string) || ''} onChange={(v) => onUpdate({ overline: v || undefined } as Partial<Block>)} />
          <RichTextField label="Title" value={b.title as string} onChange={(v) => onUpdate({ title: v } as Partial<Block>)} singleLine />
          <RichTextField label="Subtitle" value={b.subtitle as string} onChange={(v) => onUpdate({ subtitle: v } as Partial<Block>)} singleLine />
          <SelectField label="Columns" value={String(b.columns || 4)} options={['2','3','4']} onChange={(v) => onUpdate({ columns: Number(v) } as Partial<Block>)} />
          <div className="grid grid-cols-2 gap-2">
            <ColorField label="Back BG Color" value={(b.backBgColor as string) || ''} onChange={(v) => onUpdate({ backBgColor: v || undefined } as Partial<Block>)} />
            <ColorField label="Back Text Color" value={(b.backTextColor as string) || ''} onChange={(v) => onUpdate({ backTextColor: v || undefined } as Partial<Block>)} />
            <ColorField label="Name Color" value={(b.nameColor as string) || ''} onChange={(v) => onUpdate({ nameColor: v || undefined } as Partial<Block>)} />
            <ColorField label="Title Color" value={(b.titleColor as string) || ''} onChange={(v) => onUpdate({ titleColor: v || undefined } as Partial<Block>)} />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Members ({((b.members as Array<{id?: string; name: string; title: string; photo: string; bio: string; question: string; answer: string}>) || []).length})</span>
              <button type="button" onClick={() => onUpdate({ members: [...((b.members as Array<{id?: string; name: string; title: string; photo: string; bio: string; question: string; answer: string}>) || []), { id: `tmember-${Date.now()}`, name: '', title: '', bio: '', photo: '', question: '', answer: '' }] } as Partial<Block>)} className="text-xs text-primary hover:text-primary/80 font-medium">+ Add</button>
            </div>
            {((b.members as Array<{id?: string; name: string; title: string; photo: string; bio: string; question: string; answer: string}>) || []).map((member, i) => (
              <div key={member.id ?? i} className="space-y-1 p-2 rounded border border-border">
                <input type="text" value={member.name} onChange={(e) => { const next = [...((b.members as Array<{id?: string; name: string; title: string; photo: string; bio: string; question: string; answer: string}>) || [])]; next[i] = { ...next[i], name: e.target.value }; onUpdate({ members: next } as Partial<Block>); }} className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground font-bold" placeholder="Name" />
                <input type="text" value={member.title} onChange={(e) => { const next = [...((b.members as Array<{id?: string; name: string; title: string; photo: string; bio: string; question: string; answer: string}>) || [])]; next[i] = { ...next[i], title: e.target.value }; onUpdate({ members: next } as Partial<Block>); }} className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground" placeholder="Title" />
                <input type="url" value={member.photo} onChange={(e) => { const next = [...((b.members as Array<{id?: string; name: string; title: string; photo: string; bio: string; question: string; answer: string}>) || [])]; next[i] = { ...next[i], photo: e.target.value }; onUpdate({ members: next } as Partial<Block>); }} className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground" placeholder="Photo URL" />
                <textarea value={member.bio} onChange={(e) => { const next = [...((b.members as Array<{id?: string; name: string; title: string; photo: string; bio: string; question: string; answer: string}>) || [])]; next[i] = { ...next[i], bio: e.target.value }; onUpdate({ members: next } as Partial<Block>); }} className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground" placeholder="Bio (front)" rows={2} />
                <input type="text" value={member.question} onChange={(e) => { const next = [...((b.members as Array<{id?: string; name: string; title: string; photo: string; bio: string; question: string; answer: string}>) || [])]; next[i] = { ...next[i], question: e.target.value }; onUpdate({ members: next } as Partial<Block>); }} className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground" placeholder="Question (back)" />
                <textarea value={member.answer} onChange={(e) => { const next = [...((b.members as Array<{id?: string; name: string; title: string; photo: string; bio: string; question: string; answer: string}>) || [])]; next[i] = { ...next[i], answer: e.target.value }; onUpdate({ members: next } as Partial<Block>); }} className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground" placeholder="Answer (back)" rows={2} />
                <button type="button" onClick={() => onUpdate({ members: ((b.members as Array<{id?: string; name: string; title: string; photo: string; bio: string; question: string; answer: string}>) || []).filter((_, j) => j !== i) } as Partial<Block>)} className="text-xs text-destructive hover:underline">Remove</button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Survey Results Block ── */}
      {block.type === 'survey-results' && (
        <SurveyResultsEditor block={block} onUpdate={onUpdate} />
      )}

      {/* ── HTML Embed Block ── */}
      {block.type === 'html-embed' && (
        <HtmlEmbedEditor block={block} onUpdate={onUpdate} siteId={siteId} />
      )}

      {/* ── Site Footer Block ── */}
      {block.type === 'site-footer' && (
        <>
          <Field label="Logo URL" value={(b.logoUrl as string) || ''} onChange={(v) => onUpdate({ logoUrl: v || undefined } as Partial<Block>)} />
          <Field label="Logo Alt" value={(b.logoAlt as string) || ''} onChange={(v) => onUpdate({ logoAlt: v || undefined } as Partial<Block>)} />
          <Field label="Tagline" value={(b.tagline as string) || ''} onChange={(v) => onUpdate({ tagline: v || undefined } as Partial<Block>)} />
          <div className="grid grid-cols-3 gap-2">
            <ColorField label="Background" value={(b.backgroundColor as string) || ''} onChange={(v) => onUpdate({ backgroundColor: v || undefined } as Partial<Block>)} />
            <ColorField label="Text" value={(b.textColor as string) || ''} onChange={(v) => onUpdate({ textColor: v || undefined } as Partial<Block>)} />
            <ColorField label="Accent" value={(b.accentColor as string) || ''} onChange={(v) => onUpdate({ accentColor: v || undefined } as Partial<Block>)} />
          </div>
          <details className="pt-2 border-t border-border mt-2">
            <summary className="flex items-center gap-1.5 cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground select-none py-1">
              <span className="material-icons text-sm">contact_mail</span>
              Contact Info
            </summary>
            <div className="pt-3 space-y-2">
              <Field label="Address" value={(b.contactInfo as Record<string,string>)?.address || ''} onChange={(v) => onUpdate({ contactInfo: { ...((b.contactInfo as Record<string,string>) || {}), address: v || undefined } } as Partial<Block>)} />
              <Field label="Phone" value={(b.contactInfo as Record<string,string>)?.phone || ''} onChange={(v) => onUpdate({ contactInfo: { ...((b.contactInfo as Record<string,string>) || {}), phone: v || undefined } } as Partial<Block>)} />
              <Field label="Email" value={(b.contactInfo as Record<string,string>)?.email || ''} onChange={(v) => onUpdate({ contactInfo: { ...((b.contactInfo as Record<string,string>) || {}), email: v || undefined } } as Partial<Block>)} />
            </div>
          </details>
          <details className="pt-2 border-t border-border mt-2">
            <summary className="flex items-center gap-1.5 cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground select-none py-1">
              <span className="material-icons text-sm">link</span>
              Link Groups ({((b.linkGroups as Array<{label: string; links: Array<{label: string; href: string}>}>) || []).length})
            </summary>
            <div className="pt-3 space-y-2">
              {((b.linkGroups as Array<{label: string; links: Array<{label: string; href: string}>}>) || []).map((group, gi) => (
                <div key={gi} className="space-y-1 p-2 rounded border border-border">
                  <input type="text" value={group.label} onChange={(e) => { const next = [...((b.linkGroups as Array<{label: string; links: Array<{label: string; href: string}>}>) || [])]; next[gi] = { ...next[gi], label: e.target.value }; onUpdate({ linkGroups: next } as Partial<Block>); }} className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground font-bold" placeholder="Group label (e.g. PRODUCT)" />
                  {(group.links || []).map((link, li) => (
                    <div key={li} className="flex gap-1">
                      <input type="text" value={link.label} onChange={(e) => { const groups = [...((b.linkGroups as Array<{label: string; links: Array<{label: string; href: string}>}>) || [])]; const links = [...(groups[gi].links || [])]; links[li] = { ...links[li], label: e.target.value }; groups[gi] = { ...groups[gi], links }; onUpdate({ linkGroups: groups } as Partial<Block>); }} className="flex-1 text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground" placeholder="Link label" />
                      <input type="text" value={link.href} onChange={(e) => { const groups = [...((b.linkGroups as Array<{label: string; links: Array<{label: string; href: string}>}>) || [])]; const links = [...(groups[gi].links || [])]; links[li] = { ...links[li], href: e.target.value }; groups[gi] = { ...groups[gi], links }; onUpdate({ linkGroups: groups } as Partial<Block>); }} className="flex-1 text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground" placeholder="/path" />
                      <button type="button" onClick={() => { const groups = [...((b.linkGroups as Array<{label: string; links: Array<{label: string; href: string}>}>) || [])]; groups[gi] = { ...groups[gi], links: (groups[gi].links || []).filter((_, j) => j !== li) }; onUpdate({ linkGroups: groups } as Partial<Block>); }} className="px-2 text-xs text-destructive hover:underline">x</button>
                    </div>
                  ))}
                  <div className="flex gap-1">
                    <button type="button" onClick={() => { const groups = [...((b.linkGroups as Array<{label: string; links: Array<{label: string; href: string}>}>) || [])]; groups[gi] = { ...groups[gi], links: [...(groups[gi].links || []), { label: '', href: '' }] }; onUpdate({ linkGroups: groups } as Partial<Block>); }} className="flex-1 text-xs text-muted-foreground hover:underline">+ Link</button>
                    <button type="button" onClick={() => onUpdate({ linkGroups: ((b.linkGroups as Array<{label: string; links: Array<{label: string; href: string}>}>) || []).filter((_, j) => j !== gi) } as Partial<Block>)} className="text-xs text-destructive hover:underline">Remove group</button>
                  </div>
                </div>
              ))}
              <button type="button" onClick={() => onUpdate({ linkGroups: [...((b.linkGroups as Array<{label: string; links: Array<{label: string; href: string}>}>) || []), { label: '', links: [] }] } as Partial<Block>)} className="w-full px-3 py-2 text-xs font-medium rounded border border-dashed border-border text-muted-foreground hover:text-foreground hover:bg-accent/50">+ Add Group</button>
            </div>
          </details>
          <details className="pt-2 border-t border-border mt-2">
            <summary className="flex items-center gap-1.5 cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground select-none py-1">
              <span className="material-icons text-sm">share</span>
              Social Links ({((b.socialLinks as Array<{platform: string; url: string}>) || []).length})
            </summary>
            <div className="pt-3 space-y-2">
              {((b.socialLinks as Array<{platform: string; url: string}>) || []).map((link, i) => (
                <div key={i} className="flex gap-1">
                  <input type="text" value={link.platform} onChange={(e) => { const next = [...((b.socialLinks as Array<{platform: string; url: string}>) || [])]; next[i] = { ...next[i], platform: e.target.value }; onUpdate({ socialLinks: next } as Partial<Block>); }} className="w-24 text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground" placeholder="platform" />
                  <input type="url" value={link.url} onChange={(e) => { const next = [...((b.socialLinks as Array<{platform: string; url: string}>) || [])]; next[i] = { ...next[i], url: e.target.value }; onUpdate({ socialLinks: next } as Partial<Block>); }} className="flex-1 text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground" placeholder="https://" />
                  <button type="button" onClick={() => onUpdate({ socialLinks: ((b.socialLinks as Array<{platform: string; url: string}>) || []).filter((_, j) => j !== i) } as Partial<Block>)} className="px-2 text-xs text-destructive hover:underline">x</button>
                </div>
              ))}
              <button type="button" onClick={() => onUpdate({ socialLinks: [...((b.socialLinks as Array<{platform: string; url: string}>) || []), { platform: '', url: '' }] } as Partial<Block>)} className="w-full px-3 py-2 text-xs font-medium rounded border border-dashed border-border text-muted-foreground hover:text-foreground hover:bg-accent/50">+ Add Social Link</button>
            </div>
          </details>
          <details className="pt-2 border-t border-border mt-2">
            <summary className="flex items-center gap-1.5 cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground select-none py-1">
              <span className="material-icons text-sm">copyright</span>
              Copyright &amp; Disclaimer
            </summary>
            <div className="pt-3 space-y-2">
              <Field label="Copyright" value={(b.copyright as string) || ''} onChange={(v) => onUpdate({ copyright: v || undefined } as Partial<Block>)} />
              <TextareaField label="Disclaimer" value={(b.disclaimer as string) || ''} onChange={(v) => onUpdate({ disclaimer: v || undefined } as Partial<Block>)} rows={2} />
            </div>
          </details>
        </>
      )}
    </div>
  );
}

// ─── Survey Results Editor (needs local state for surveys fetch) ─────────────

type SurveyMeta = { id: number; slug: string; title: string; responseCount: number; fields: Array<{ id: string; label: string; type: string }> };

function SurveyResultsEditor({ block, onUpdate }: { block: Block; onUpdate: (updates: Partial<Block>) => void }) {
  const b = block as unknown as Record<string, unknown>;
  const [surveys, setSurveys] = useState<SurveyMeta[]>([]);
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

  const surveySlug = b.surveySlug as string | undefined;
  const filtered = search
    ? surveys.filter(s => s.title.toLowerCase().includes(search.toLowerCase()) || s.slug.toLowerCase().includes(search.toLowerCase()))
    : surveys;
  const selected = surveys.find(s => s.slug === surveySlug);
  const showTextResponses = (b.showTextResponses as boolean) !== false;
  const fieldIds = b.fieldIds as string[] | undefined;

  return (
    <>
      {/* Survey Picker */}
      <div ref={ref} className="relative">
        <span className="text-xs font-medium text-muted-foreground block mb-1">Survey</span>
        {selected && !open ? (
          <button type="button" onClick={() => setOpen(true)}
            className="w-full flex items-center gap-2 rounded border border-border bg-background px-3 py-2 text-sm text-left hover:border-primary transition-colors">
            <span className="material-icons text-primary text-base">poll</span>
            <div className="flex-1 min-w-0">
              <div className="truncate font-medium">{selected.title}</div>
              <div className="text-xs text-muted-foreground">{selected.responseCount} responses</div>
            </div>
            <span className="material-icons text-sm text-muted-foreground">unfold_more</span>
          </button>
        ) : (
          <input type="text" value={open ? search : surveySlug || ''}
            onChange={(e) => { setSearch(e.target.value); if (!open) onUpdate({ surveySlug: e.target.value } as Partial<Block>); }}
            onFocus={() => setOpen(true)}
            placeholder={loading ? 'Loading...' : 'Search surveys...'}
            className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:ring-1 focus:ring-primary" />
        )}
        {open && (
          <div className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                {loading ? 'Loading...' : surveys.length === 0 ? 'No surveys found' : 'No matches'}
              </div>
            ) : filtered.map(s => (
              <button key={s.slug} type="button"
                onClick={() => { onUpdate({ surveySlug: s.slug } as Partial<Block>); setOpen(false); setSearch(''); }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-primary/5 ${s.slug === surveySlug ? 'bg-primary/10' : ''}`}>
                <span className="material-icons text-primary text-base">poll</span>
                <div className="flex-1 min-w-0">
                  <div className="truncate">{s.title}</div>
                  <div className="text-xs text-muted-foreground">{s.responseCount} responses</div>
                </div>
                {s.slug === surveySlug && <span className="material-icons text-primary text-sm">check</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Chart Type */}
      <div>
        <span className="text-xs font-medium text-muted-foreground block mb-1">Chart Type</span>
        <div className="grid grid-cols-3 gap-1.5">
          {([{ value: 'bar', label: 'Bar Chart', icon: 'bar_chart' }, { value: 'donut', label: 'Donut Chart', icon: 'donut_large' }, { value: 'list', label: 'Ranked List', icon: 'format_list_numbered' }] as const).map(opt => (
            <button key={opt.value} type="button"
              onClick={() => onUpdate({ chartType: opt.value } as Partial<Block>)}
              className={`flex flex-col items-center gap-1 px-2 py-2 rounded-md border text-xs transition-colors ${((b.chartType as string) || 'bar') === opt.value ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:border-primary/50'}`}>
              <span className="material-icons text-lg">{opt.icon}</span>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <SelectField label="Layout" value={(b.layout as string) || 'stacked'} options={['stacked','tabbed']} onChange={(v) => onUpdate({ layout: v } as Partial<Block>)} />
      <Field label="Title" value={(b.title as string) || ''} onChange={(v) => onUpdate({ title: v } as Partial<Block>)} />
      <Field label="Description" value={(b.description as string) || ''} onChange={(v) => onUpdate({ description: v } as Partial<Block>)} />

      <div className="space-y-2">
        <CheckboxField label="Show response count" checked={(b.showResponseCount as boolean) !== false} onChange={(v) => onUpdate({ showResponseCount: v } as Partial<Block>)} />
        <CheckboxField label="Show text responses" checked={showTextResponses} onChange={(v) => onUpdate({ showTextResponses: v } as Partial<Block>)} />
      </div>

      {showTextResponses && (
        <div>
          <span className="text-xs font-medium text-muted-foreground block mb-1">Text responses per question</span>
          <input type="number" min={1} max={50} value={(b.textResponseLimit as number) || 5}
            onChange={(e) => onUpdate({ textResponseLimit: parseInt(e.target.value) || 5 } as Partial<Block>)}
            className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground" />
        </div>
      )}

      {/* Question picker — only when a survey with fields is selected */}
      {selected && selected.fields && selected.fields.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-muted-foreground block">Questions to display</span>
            <button type="button" onClick={() => onUpdate({ fieldIds: undefined } as Partial<Block>)} className="text-xs text-primary hover:underline">All</button>
          </div>
          <ul className="space-y-1 rounded border border-border bg-background px-3 py-2 max-h-48 overflow-y-auto">
            {selected.fields.map((field) => {
              const isChecked = !fieldIds || fieldIds.length === 0 || fieldIds.includes(field.id);
              return (
                <li key={field.id} className="flex items-center gap-2">
                  <input type="checkbox" id={`srfield-${field.id}`} checked={isChecked}
                    onChange={(e) => {
                      const allIds = selected.fields.map(f => f.id);
                      const current = fieldIds && fieldIds.length > 0 ? fieldIds : allIds;
                      const next = e.target.checked
                        ? [...current, field.id].filter((v, i, a) => a.indexOf(v) === i)
                        : current.filter(id => id !== field.id);
                      onUpdate({ fieldIds: next.length === allIds.length ? undefined : next } as Partial<Block>);
                    }}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
                  <label htmlFor={`srfield-${field.id}`} className="text-sm text-foreground truncate">{field.label}</label>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <ColorField label="Accent Color" value={(b.accentColor as string) || ''} onChange={(v) => onUpdate({ accentColor: v } as Partial<Block>)} />
    </>
  );
}

// ─── HTML Embed Editor — file upload, replace-versioned, plus iframe knobs ──

function HtmlEmbedEditor({ block, onUpdate, siteId }: { block: Block; onUpdate: (updates: Partial<Block>) => void; siteId?: number }) {
  const b = block as unknown as Record<string, unknown>;
  const url = (b.url as string) || '';
  const filename = (b.filename as string) || '';
  const mediaId = b.mediaId as number | undefined;

  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    setUploading(true);
    try {
      // Existing media: version it via /replace so history is preserved.
      if (mediaId) {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch(`/api/portal/media/${mediaId}/replace`, { method: 'POST', body: fd });
        const json = await res.json();
        if (res.ok && json.success) {
          onUpdate({ url: json.data.url, filename: json.data.filename } as Partial<Block>);
          return;
        }
        // fall through to fresh upload on failure
      }
      const fd = new FormData();
      fd.append('file', file);
      if (siteId) fd.append('websiteId', String(siteId));
      const res = await fetch('/api/portal/html-uploads', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Upload failed');
      onUpdate({ url: json.data.url, filename: json.data.filename, mediaId: json.data.id } as Partial<Block>);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <div>
        <span className="text-xs font-medium text-muted-foreground">HTML File</span>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) handleFile(f);
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`mt-1 cursor-pointer rounded border-2 border-dashed p-4 text-center text-xs transition-colors ${
            dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".html,.htm,.xhtml,text/html"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              if (fileInputRef.current) fileInputRef.current.value = '';
            }}
          />
          {uploading ? (
            <span className="text-muted-foreground">Uploading…</span>
          ) : url ? (
            <div>
              <div className="font-medium text-foreground truncate">{filename || 'uploaded.html'}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {mediaId ? 'Click or drop to upload a new version' : 'Click or drop a new file to replace'}
              </div>
            </div>
          ) : (
            <div className="text-muted-foreground">
              <span className="material-icons text-2xl block mb-1">upload_file</span>
              Drop an .html file or click to browse
            </div>
          )}
        </div>
        {error && <p className="text-xs text-destructive mt-1">{error}</p>}
      </div>

      <Field label="URL" value={url} onChange={(v) => onUpdate({ url: v } as Partial<Block>)} />
      <Field label="Height" value={(b.height as string) || '600px'} onChange={(v) => onUpdate({ height: v } as Partial<Block>)} />
      <SelectField
        label="Width"
        value={(b.width as string) || 'full'}
        options={['full', 'contained']}
        onChange={(v) => onUpdate({ width: v } as Partial<Block>)}
      />
      <SelectField
        label="Sandbox"
        value={(b.sandbox as string) || 'scripts'}
        options={['strict', 'scripts', 'scripts-forms']}
        onChange={(v) => onUpdate({ sandbox: v } as Partial<Block>)}
      />
      <Field label="Iframe Title" value={(b.iframeTitle as string) || ''} onChange={(v) => onUpdate({ iframeTitle: v || undefined } as Partial<Block>)} />
      <Field label="Caption" value={(b.caption as string) || ''} onChange={(v) => onUpdate({ caption: v || undefined } as Partial<Block>)} />
    </>
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
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onRemove(item.id); }}
          className="p-0.5 rounded text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors shrink-0"
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
  return <TokenColorPicker label={label} value={value || ''} onChange={onChange} />;
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
            <ColorField label="Gradient Color" value={(b.gradientColor as string) || 'white'} onChange={(v) => onUpdate({ gradientColor: v } as Partial<Block>)} />
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
          <ColorField label="Overlay Color" value={(slide.overlayColor as string) || 'rgba(0,0,0,0.45)'} onChange={(v) => updateSlide(activeSlide, { overlayColor: v })} />
          <div>
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-xs font-medium text-muted-foreground">Overlay Opacity</span>
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
