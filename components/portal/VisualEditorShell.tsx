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
import { findBlockById, findBlockPath, updateBlockById, removeBlockById, insertBlockInContainer, insertBlockAfter, getAllBlocks, deepCloneBlock } from '@/lib/utils/blockHelpers';
import type { Block, BlockType, BlockStyle, ColumnsBlock } from '@/types/blocks';
import type { Breakpoint } from '@/types/responsive';
import BrandingProfileSelector from '@/components/portal/BrandingProfileSelector';
import { ImagePickerModal } from './visual-editor/HtmlRenderEditor';
import { SaveAsTemplateModal } from '@/components/blocks/SaveAsTemplateModal';
import { TemplateLibrary } from '@/components/blocks/TemplateLibrary';
import { LayerItem } from './visual-editor/LayersPanel';
import { ElementStyleEditor } from './visual-editor/ElementStyleEditor';
import { BlockContentEditor } from './visual-editor/BlockContentEditor';
import { BLOCK_ICON_MAP } from './visual-editor/_lib/block-icon-map';

// ─── Block type definitions for picker ───────────────────────────────────────
// Sourced from lib/blocks/registry.ts so NestedBlockInserter and other pickers
// can reference the same list without importing from a UI component.
import { BUILT_IN_BLOCK_TYPES } from '@/lib/blocks/registry';
import { StyleVariantsButton } from '@/components/blocks/visual/StyleVariantsButton';

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
  /** Post-type template JSON ({ blocks, version }) for the post being edited.
   *  Forwarded to the iframe so it renders the type's wrapper chrome with the
   *  post body substituted into the `post-content` slot. */
  typeTemplate?: string | null;
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
  typeTemplate = null,
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

  // Track whether a pointer is currently down anywhere in the parent window
  // (sliders, color pickers, range thumbs, swatches in the right panel). When
  // true, sendBlocksUpdate marks BLOCKS_UPDATE messages with coalesce: true
  // so the iframe collapses the burst of slider-drag updates into a single
  // undo entry. Discrete clicks fire onClick after pointerup, so the flag is
  // already false by the time their state change arrives — they get their
  // own history entry. Window-level listener; iframe-internal pointer events
  // do not bubble into the parent and have their own batching path.
  const pointerDownRef = useRef(false);
  useEffect(() => {
    const onDown = () => { pointerDownRef.current = true; };
    const onUpOrCancel = () => { pointerDownRef.current = false; };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('pointerup', onUpOrCancel, true);
    window.addEventListener('pointercancel', onUpOrCancel, true);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('pointerup', onUpOrCancel, true);
      window.removeEventListener('pointercancel', onUpOrCancel, true);
    };
  }, []);

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

  // Bridge — iframe forwards Cmd+C/Cmd+V before the actual handlers exist in
  // this component (they're defined further down). The ref lets the message
  // dispatcher call into the eventual implementations once they're declared.
  const copyImplRef = useRef<(() => boolean) | null>(null);
  const pasteImplRef = useRef<(() => boolean) | null>(null);
  // Image picker target — set when the iframe asks to swap an image. Renders
  // a MediaPicker modal anchored at the bottom of the shell.
  const [imagePickerTarget, setImagePickerTarget] = useState<{ blockId: string; field: string; currentValue: string } | null>(null);

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
    typeTemplate,
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
        // For html-render blocks the field-edit channel writes into the
        // `values` map (keyed by field name) so the template substitution
        // picks the new content up. Other blocks treat field as a top-level
        // property. A dotted field name like `stats.2.body` is the inline-
        // edit path for an array-item sub-field — parse and write into the
        // nested array entry.
        const target = findBlockById(blocks, blockId);
        if (target?.type === 'html-render') {
          type Vals = Record<string, string | Array<Record<string, string>> | Record<string, string>>;
          const existing: Vals = ((target as unknown as { values?: Vals }).values) || {};
          const parts = field.split('.');
          let nextValues: Vals;
          if (parts.length >= 3) {
            // arrayName.index.subfield  (only one nesting level supported)
            const [arrayName, idxStr, ...rest] = parts;
            const idx = parseInt(idxStr, 10);
            const subKey = rest.join('.');
            const prevArr = existing[arrayName];
            const arr = Array.isArray(prevArr) ? [...prevArr] : [];
            const item = { ...(arr[idx] || {}), [subKey]: value };
            arr[idx] = item;
            nextValues = { ...existing, [arrayName]: arr };
          } else if (parts.length === 2) {
            // groupName.subfield — group / link sub-fields. Without this branch
            // the write would land in `values["groupName.subfield"]` (a literal
            // dotted key) which the renderer never reads.
            const [groupName, subKey] = parts;
            const prev = existing[groupName];
            const obj: Record<string, string> = (prev && typeof prev === 'object' && !Array.isArray(prev))
              ? (prev as Record<string, string>) : {};
            nextValues = { ...existing, [groupName]: { ...obj, [subKey]: value } };
          } else {
            nextValues = { ...existing, [field]: value };
          }
          handleUpdateBlock(blockId, { values: nextValues } as Partial<Block>);
        } else {
          handleUpdateBlock(blockId, { [field]: value } as Partial<Block>);
        }
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
    onCopyBlocks: () => { copyImplRef.current?.(); },
    onPasteBlocks: () => { pasteImplRef.current?.(); },
    onRequestImagePicker: (blockId, field, currentValue) => {
      setImagePickerTarget({ blockId, field, currentValue });
    },
  });

  useEffect(() => {
    if (iframeOriginatedRef.current) {
      iframeOriginatedRef.current = false;
      return;
    }
    // Coalesce mid-drag updates (slider thumb, color picker, range input) into
    // one undo entry; pointer-up flushes the next change as discrete.
    sendBlocksUpdate(blocks, { coalesce: pointerDownRef.current });
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

  // ─── Cross-post clipboard via localStorage ─────────────────────────────────
  // Cmd+C / Cmd+V on selected blocks. Survives navigating between posts so
  // authors can lift a chunk out of one page and drop it on another. Stored
  // alongside the source post id so we can show "pasted from post N" in
  // future toasts, but the block content travels independently of source.

  const CLIPBOARD_KEY = 'sd-block-clipboard';

  const copySelectedBlocks = useCallback(() => {
    if (selectedBlockIds.length === 0) return false;
    const picked = selectedBlockIds.map(id => findBlockById(blocks, id)).filter((b): b is Block => !!b);
    if (picked.length === 0) return false;
    try {
      window.localStorage.setItem(CLIPBOARD_KEY, JSON.stringify({
        version: 1,
        copiedAt: Date.now(),
        sourceSiteId: siteId ?? null,
        blocks: picked,
      }));
    } catch {
      // localStorage may be unavailable (private mode, quota); fail silently
      return false;
    }
    return true;
  }, [blocks, selectedBlockIds, siteId]);

  const pasteFromClipboard = useCallback(() => {
    let payload: { version: number; blocks: Block[] } | null = null;
    try {
      const raw = window.localStorage.getItem(CLIPBOARD_KEY);
      if (!raw) return false;
      payload = JSON.parse(raw);
    } catch {
      return false;
    }
    if (!payload || !Array.isArray(payload.blocks) || payload.blocks.length === 0) return false;

    // Regenerate every id so the pasted blocks don't collide with whatever's
    // already on this page (and so React reconciliation treats them fresh).
    const cloned = payload.blocks.map(deepCloneBlock);

    // Insert position: after the last currently-selected block at top level if
    // there is one; otherwise append to the end.
    let insertAt = blocks.length;
    if (selectedBlockIds.length > 0) {
      const lastIdx = Math.max(...selectedBlockIds.map(id => blocks.findIndex(b => b.id === id)).filter(i => i >= 0));
      if (lastIdx >= 0) insertAt = lastIdx + 1;
    }
    const updated = [...blocks];
    updated.splice(insertAt, 0, ...cloned);
    iframeOriginatedRef.current = true;
    onBlocksChange(updated);
    setSelectedBlockIds(cloned.map(b => b.id));
    setInternalSelectedBlockId(cloned[0]?.id ?? null);
    return true;
  }, [blocks, selectedBlockIds, onBlocksChange]);

  // Publish the latest implementations into the bridge refs so the iframe
  // postMessage forwarders (defined above the impls) can call them.
  useEffect(() => {
    copyImplRef.current = copySelectedBlocks;
    pasteImplRef.current = pasteFromClipboard;
  }, [copySelectedBlocks, pasteFromClipboard]);

  // Bind Cmd+C / Cmd+V at the window level. Skip when focus is in an input,
  // textarea, select, or contentEditable region — otherwise we'd hijack the
  // user's normal text copy/paste inside a field input.
  useEffect(() => {
    const isEditableTarget = (t: EventTarget | null) =>
      t instanceof HTMLInputElement ||
      t instanceof HTMLTextAreaElement ||
      t instanceof HTMLSelectElement ||
      (t instanceof HTMLElement && t.isContentEditable);
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      if (k !== 'c' && k !== 'v') return;
      // Don't interfere with text selection in fields. Also leave it alone
      // when there's a window text selection (user is copying readable text).
      if (isEditableTarget(e.target)) return;
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed && selection.toString().trim().length > 0) return;

      if (k === 'c') {
        if (copySelectedBlocks()) {
          e.preventDefault();
        }
      } else if (k === 'v') {
        if (pasteFromClipboard()) {
          e.preventDefault();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [copySelectedBlocks, pasteFromClipboard]);

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
              <span className="ml-auto text-[10px] text-muted-foreground/70">⌘D</span>
            </button>
            <button
              type="button"
              onClick={() => { copySelectedBlocks(); setContextMenu(null); }}
              className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-accent text-left"
            >
              <span className="material-icons text-base text-muted-foreground">file_copy</span>
              Copy
              <span className="ml-auto text-[10px] text-muted-foreground/70">⌘C</span>
            </button>
            <button
              type="button"
              onClick={() => { pasteFromClipboard(); setContextMenu(null); }}
              className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-accent text-left"
            >
              <span className="material-icons text-base text-muted-foreground">content_paste</span>
              Paste
              <span className="ml-auto text-[10px] text-muted-foreground/70">⌘V</span>
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

      {/* Inline image swap — opens when an iframe img is clicked. Reuses the
          existing image content-update path (the same one panel-side
          MediaPicker writes through), just routed via the iframe channel. */}
      {imagePickerTarget && (
        <ImagePickerModal
          target={imagePickerTarget}
          mediaApi={siteId ? `/api/portal/cms/websites/${siteId}/media` : '/api/portal/media'}
          onSelect={(newUrl) => {
            const target = findBlockById(blocks, imagePickerTarget.blockId);
            if (target?.type === 'html-render') {
              type Vals = Record<string, string | Array<Record<string, string>> | Record<string, string>>;
              const existing: Vals = ((target as unknown as { values?: Vals }).values) || {};
              const parts = imagePickerTarget.field.split('.');
              let next: Vals;
              if (parts.length >= 3) {
                const [arrayName, idxStr, ...rest] = parts;
                const idx = parseInt(idxStr, 10);
                const subKey = rest.join('.');
                const prev = existing[arrayName];
                const arr = Array.isArray(prev) ? [...prev] : [];
                arr[idx] = { ...(arr[idx] || {}), [subKey]: newUrl };
                next = { ...existing, [arrayName]: arr };
              } else if (parts.length === 2) {
                const [groupName, subKey] = parts;
                const prev = existing[groupName];
                const obj: Record<string, string> = (prev && typeof prev === 'object' && !Array.isArray(prev))
                  ? (prev as Record<string, string>) : {};
                next = { ...existing, [groupName]: { ...obj, [subKey]: newUrl } };
              } else {
                next = { ...existing, [imagePickerTarget.field]: newUrl };
              }
              iframeOriginatedRef.current = true;
              handleUpdateBlock(imagePickerTarget.blockId, { values: next } as Partial<Block>);
            }
            setImagePickerTarget(null);
          }}
          onClose={() => setImagePickerTarget(null)}
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
