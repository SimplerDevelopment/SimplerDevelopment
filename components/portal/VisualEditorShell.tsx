'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useVisualEditorParent } from '@/lib/visual-editor/useVisualEditorParent';
import {
  findBlockById,
  insertBlockAfter,
  updateBlockById,
} from '@/lib/utils/blockHelpers';
import type { Block, BlockType, ColumnsBlock } from '@/types/blocks';
import type { Breakpoint } from '@/types/responsive';
// Lazy-load ImagePickerModal — extracted to its own file so it doesn't pull
// the entire HtmlRenderEditor chunk (~1700 LoC + @codemirror) into this shell.
const ImagePickerModal = dynamic(
  () => import('./visual-editor/ImagePickerModal').then((m) => ({ default: m.ImagePickerModal })),
  { ssr: false },
);
import { SaveAsTemplateModal } from '@/components/blocks/SaveAsTemplateModal';
import { TemplateLibrary } from '@/components/blocks/TemplateLibrary';
import { BUILT_IN_BLOCK_TYPES } from '@/lib/blocks/registry';
import { LeftPanel } from './visual-editor/LeftPanel';
import { RightPanel } from './visual-editor/RightPanel';
import { IframePreview } from './visual-editor/IframePreview';
import { BlockContextMenu } from './visual-editor/BlockContextMenu';
import { usePanZoom } from './visual-editor/_hooks/usePanZoom';
import { useBlockClipboard } from './visual-editor/_hooks/useBlockClipboard';
import { useBulkActions } from './visual-editor/_hooks/useBulkActions';
import { useLayersDragDrop } from './visual-editor/_hooks/useLayersDragDrop';

// No-op sorting strategy: items stay in place during drag, only reorder on drop
const noMovementStrategy = () => null;

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
  // onUpdateBlock prop is kept for API compatibility — block updates flow through
  // handleUpdateBlock which already routes through onBlocksChange.
  onUpdateBlock: _onUpdateBlock, // eslint-disable-line @typescript-eslint/no-unused-vars
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
  // Selection state — internal mirror so multi-select works alongside the
  // controlled selectedBlockId prop.
  const [internalSelectedBlockId, setInternalSelectedBlockId] = useState<string | null>(null);
  const [selectedBlockIds, setSelectedBlockIds] = useState<string[]>([]);
  const selectedBlockId = selectedBlockIdProp ?? internalSelectedBlockId;

  // Panel chrome state
  const [leftTab, setLeftTab] = useState<'layers' | 'add'>('layers');
  const [pickerCategory, setPickerCategory] = useState<string | null>(null);
  const [pickerSearch, setPickerSearch] = useState('');
  const [rightPanelTab, setRightPanelTab] = useState<'content' | 'style'>('content');
  // Default both side panels to collapsed on phone — at 375px the 240px
  // LeftPanel + 320px RightPanel would otherwise overlay everything via the
  // mobile fixed-position fallback. Consumers can still override via the prop.
  const phoneDefault = () =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
  const [leftCollapsedInternal, setLeftCollapsedInternal] = useState(
    () => leftCollapsedProp ?? phoneDefault()
  );
  const [rightCollapsedInternal, setRightCollapsedInternal] = useState(
    () => rightCollapsedProp ?? phoneDefault()
  );
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

  // Modal state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [saveTemplateBlocks, setSaveTemplateBlocks] = useState<Block[] | null>(null);
  const [templateLibraryOpen, setTemplateLibraryOpen] = useState(false);
  const [imagePickerTarget, setImagePickerTarget] = useState<{ blockId: string; field: string; currentValue: string } | null>(null);
  const [externalDragType, setExternalDragType] = useState<string | null>(null);

  // ── Pan/zoom canvas ────────────────────────────────────────────────────────
  const {
    canvasRef,
    zoomLevel,
    zoomIn,
    zoomOut,
    zoomReset,
    panOffset,
    handleCanvasMouseDown,
    handleCanvasMouseMove,
    handleCanvasMouseUp,
  } = usePanZoom(initialZoom);

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
      setSelectedBlockIds((prev) => {
        const newIds = prev.includes(blockId) ? prev.filter((id) => id !== blockId) : [...prev, blockId];
        setInternalSelectedBlockId(newIds.length > 0 ? newIds[newIds.length - 1] : null);
        return newIds;
      });
    } else {
      setInternalSelectedBlockId(blockId);
      setSelectedBlockIds(blockId ? [blockId] : []);
    }
    onSelectBlock(blockId);
  }, [onSelectBlock]);

  const handleBlockHovered = useCallback(() => {}, []);

  // Bridge — iframe forwards Cmd+C/Cmd+V before the actual handlers exist in
  // this component (they're defined further down). The ref lets the message
  // dispatcher call into the eventual implementations once they're declared.
  const copyImplRef = useRef<(() => boolean) | null>(null);
  const pasteImplRef = useRef<(() => boolean) | null>(null);

  // Block updates (including nested) — defined ahead of useVisualEditorParent
  // because the iframe message handlers call into it through closure.
  const handleUpdateBlock = useCallback((blockId: string, updates: Partial<Block>) => {
    const updated = updateBlockById(blocks, blockId, updates);
    onBlocksChange(updated);
  }, [blocks, onBlocksChange]);

  const {
    iframeRef,
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
      const topIdx = blocks.findIndex((b) => b.id === blockId);
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
      setSelectedBlockIds((prev) => prev.includes(blockId) ? prev : [blockId]);
      setInternalSelectedBlockId(blockId);
      setContextMenu({ x: screenX, y: screenY });
    },
    onCopyBlocks: () => { copyImplRef.current?.(); },
    onPasteBlocks: () => { pasteImplRef.current?.(); },
    onRequestImagePicker: (blockId, field, currentValue) => {
      setImagePickerTarget({ blockId, field, currentValue });
    },
  });

  // Debounce + diff sendBlocksUpdate. The effect re-runs on every blocks
  // reference change (which is every panel-field tweak), and the iframe
  // postMessage payload is the entire block tree — JSON.stringify + structured
  // clone on every keystroke gets expensive past ~30 blocks. We coalesce
  // bursts inside one animation frame and bail out when the tree is reference-
  // equal to the last successfully-sent reference (cheap O(1) compare).
  const blocksSendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSentBlocksRef = useRef<Block[] | null>(null);
  useEffect(() => {
    if (iframeOriginatedRef.current) {
      iframeOriginatedRef.current = false;
      lastSentBlocksRef.current = blocks; // iframe already has these
      return;
    }
    if (lastSentBlocksRef.current === blocks) return; // already sent this reference
    // Coalesce mid-drag updates (slider thumb, color picker, range input) into
    // one undo entry; pointer-up flushes the next change as discrete.
    const coalesce = pointerDownRef.current;
    if (blocksSendTimerRef.current) clearTimeout(blocksSendTimerRef.current);
    blocksSendTimerRef.current = setTimeout(() => {
      if (lastSentBlocksRef.current === blocks) return;
      lastSentBlocksRef.current = blocks;
      sendBlocksUpdate(blocks, { coalesce });
    }, 16); // ~1 animation frame
    return () => {
      if (blocksSendTimerRef.current) clearTimeout(blocksSendTimerRef.current);
    };
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

  // ── Bulk actions + clipboard ───────────────────────────────────────────────
  const isMultiSelect = selectedBlockIds.length > 1;
  const { bulkDelete, bulkDuplicate, bulkGroup } = useBulkActions({
    blocks,
    selectedBlockIds,
    onBlocksChange,
    setSelectedBlockIds,
    setInternalSelectedBlockId,
    iframeOriginatedRef,
  });
  const { copySelectedBlocks, pasteFromClipboard } = useBlockClipboard({
    blocks,
    selectedBlockIds,
    siteId,
    onBlocksChange,
    setSelectedBlockIds,
    setInternalSelectedBlockId,
    iframeOriginatedRef,
  });

  // Publish the latest implementations into the bridge refs so the iframe
  // postMessage forwarders (defined above the impls) can call them.
  useEffect(() => {
    copyImplRef.current = copySelectedBlocks;
    pasteImplRef.current = pasteFromClipboard;
  }, [copySelectedBlocks, pasteFromClipboard]);

  // ── Layer drag/drop ────────────────────────────────────────────────────────
  const {
    sensors,
    draggedBlockId,
    layerOverId,
    allBlockIds,
    handleDragStart,
    handleLayerDragOver,
    handleDragEnd,
  } = useLayersDragDrop({ blocks, onBlocksChange });

  // ── Block-type catalog ─────────────────────────────────────────────────────
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

  const currentViewport: Breakpoint = viewport === 'mobile' ? 'mobile' : viewport === 'tablet' ? 'tablet' : 'desktop';

  return (
    <div className="flex h-[calc(100vh-3rem)] overflow-hidden">
      {!previewMode && (
        <LeftPanel
          leftCollapsed={leftCollapsed}
          setLeftCollapsed={setLeftCollapsed}
          leftTab={leftTab}
          setLeftTab={setLeftTab}
          brandingProfileId={brandingProfileId}
          onBrandingProfileChange={onBrandingProfileChange}
          pickerSearch={pickerSearch}
          setPickerSearch={setPickerSearch}
          pickerCategory={pickerCategory}
          setPickerCategory={setPickerCategory}
          categories={categories}
          allBlockTypes={allBlockTypes}
          customComponents={customComponents}
          blocks={blocks}
          onAddBlock={onAddBlock}
          onBlocksChange={onBlocksChange}
          iframeOriginatedRef={iframeOriginatedRef}
          setExternalDragType={setExternalDragType}
          sendExternalDragStart={sendExternalDragStart}
          sendExternalDragCancel={sendExternalDragCancel}
          setTemplateLibraryOpen={setTemplateLibraryOpen}
          selectedBlockId={selectedBlockId}
          selectedBlockIds={selectedBlockIds}
          selectBlock={selectBlock}
          onDeleteBlock={onDeleteBlock}
          handleUpdateBlock={handleUpdateBlock}
          setSelectedBlockIds={setSelectedBlockIds}
          setInternalSelectedBlockId={setInternalSelectedBlockId}
          setContextMenu={setContextMenu}
          draggedBlockId={draggedBlockId}
          layerOverId={layerOverId}
          sensors={sensors}
          allBlockIds={allBlockIds}
          noMovementStrategy={noMovementStrategy}
          handleDragStart={handleDragStart}
          handleLayerDragOver={handleLayerDragOver}
          handleDragEnd={handleDragEnd}
        />
      )}

      <IframePreview
        iframeRef={iframeRef}
        iframeSrc={iframeSrc}
        handleIframeLoad={handleIframeLoad}
        viewport={viewport}
        zoomLevel={zoomLevel}
        panOffset={panOffset}
        canvasRef={canvasRef}
        handleCanvasMouseDown={handleCanvasMouseDown}
        handleCanvasMouseMove={handleCanvasMouseMove}
        handleCanvasMouseUp={handleCanvasMouseUp}
        zoomIn={zoomIn}
        zoomOut={zoomOut}
        zoomReset={zoomReset}
        allowIframeScroll={allowIframeScroll}
        blocks={blocks}
        previewMode={previewMode}
        externalDragType={externalDragType}
        onExternalDragMove={sendExternalDragMove}
        onExternalDragEnd={(x, y) => {
          sendExternalDragEnd(x, y);
          setExternalDragType(null);
          setLeftTab('layers');
          setPickerSearch('');
        }}
        onExternalDragCancel={sendExternalDragCancel}
        onExternalDragLeave={() => {}}
      />

      {!previewMode && (
        <RightPanel
          rightCollapsed={rightCollapsed}
          setRightCollapsed={setRightCollapsed}
          isMultiSelect={isMultiSelect}
          selectedBlockIds={selectedBlockIds}
          selectedBlock={selectedBlock}
          selectedCustomManifest={selectedCustomManifest}
          blocks={blocks}
          rightPanelTab={rightPanelTab}
          setRightPanelTab={setRightPanelTab}
          siteId={siteId}
          currentViewport={currentViewport}
          onBlocksChange={onBlocksChange}
          handleUpdateBlock={handleUpdateBlock}
          onDeleteBlock={onDeleteBlock}
          bulkDuplicate={bulkDuplicate}
          bulkGroup={bulkGroup}
          bulkDelete={bulkDelete}
          noSelectionPanel={noSelectionPanel}
        />
      )}

      {/* Block context menu (right-click) */}
      {contextMenu && (
        <BlockContextMenu
          contextMenu={contextMenu}
          selectedCount={selectedBlockIds.length}
          onClose={() => setContextMenu(null)}
          onDuplicate={bulkDuplicate}
          onCopy={() => { copySelectedBlocks(); }}
          onPaste={() => { pasteFromClipboard(); }}
          onGroup={bulkGroup}
          onSaveAsTemplate={() => {
            const picked = selectedBlockIds
              .map((id) => findBlockById(blocks, id))
              .filter((b): b is Block => !!b);
            if (picked.length > 0) setSaveTemplateBlocks(picked);
          }}
          onDelete={bulkDelete}
        />
      )}

      {/* Save as Template modal */}
      {saveTemplateBlocks && (
        <SaveAsTemplateModal
          blocks={saveTemplateBlocks}
          endpoint={siteId ? `/api/portal/cms/websites/${siteId}/block-templates` : undefined}
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
          endpoint={siteId ? `/api/portal/cms/websites/${siteId}/block-templates` : undefined}
          onInsert={(newBlocks) => {
            // Insert after the currently selected top-level block; otherwise append
            const topLevelIndex = selectedBlockId
              ? blocks.findIndex((b) => b.id === selectedBlockId)
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
