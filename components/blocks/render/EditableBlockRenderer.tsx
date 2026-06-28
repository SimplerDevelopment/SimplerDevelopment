'use client';

import { Fragment, createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Block, BlockEditorData } from '@/types/blocks';
import { BlockStyleWrapper } from './BlockStyleWrapper';
import { BlockRenderer } from './BlockRenderer';
import { SelectableBlock } from '@/components/visual-editor/SelectableBlock';
import { useEditorModeContext } from '@/components/visual-editor/editor-mode-context';
import { getBlockRegistry } from '@/lib/visual-editor/registry';
import { sendToParent } from '@/lib/visual-editor/protocol';
import { IFRAME_MESSAGES } from '@/types/visual-editor';
import { PostContentSlotProvider } from '@/lib/visual-editor/post-content-slot';
import {
  DndContext,
  pointerWithin,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
} from '@dnd-kit/sortable';

// No-op sorting strategy: items stay in place during drag, only reorder on drop
const noMovementStrategy = () => null;

interface BlockRendererProps {
  content: string;
}

export function EditableBlockRenderer({ content }: BlockRendererProps) {
  const editor = useEditorModeContext();
  const registry = getBlockRegistry();

  // Disable all link navigation while the visual editor is active
  useEffect(() => {
    if (!editor.active) return;

    function preventNav(e: MouseEvent) {
      const target = (e.target as HTMLElement).closest('a');
      if (target) {
        e.preventDefault();
        e.stopPropagation();
      }
    }

    document.addEventListener('click', preventNav, true);
    return () => document.removeEventListener('click', preventNav, true);
  }, [editor.active]);

  // Inject a one-time stylesheet that gives the inline-editable html-render
  // fields a visible affordance (subtle dashed outline + focus ring). Lives
  // here so it's only present when the visual editor is active.
  useEffect(() => {
    if (!editor.active) return;
    const STYLE_ID = 'sd-field-editable-css';
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .sd-field-editable {
        outline: 1px dashed rgba(99, 102, 241, 0.35);
        outline-offset: 2px;
        border-radius: 2px;
        transition: outline-color 120ms ease;
      }
      .sd-field-editable:hover { outline-color: rgba(99, 102, 241, 0.6); }
      .sd-field-editable:focus {
        outline: 2px solid rgb(99, 102, 241);
        outline-offset: 2px;
      }
      img.sd-image-editable {
        outline: 1px dashed rgba(99, 102, 241, 0.35);
        outline-offset: 2px;
        transition: outline-color 120ms ease;
      }
      img.sd-image-editable:hover {
        outline: 2px solid rgb(99, 102, 241);
        outline-offset: 2px;
      }
      /* SelectableBlock's content wrappers set pointer-events:none on the
         unselected state, which blocks single-click into html-render fields.
         Re-enable pointer events for any element flagged contenteditable so
         click-to-edit works without first having to select the block. */
      [contenteditable="true"], img.sd-image-editable {
        pointer-events: auto !important;
      }
    `;
    document.head.appendChild(style);
    return () => style.remove();
  }, [editor.active]);

  // Parse the template once per typeTemplate change. Used when active + a
  // template is present to render the static chrome around the editable
  // post-blocks slot.
  const parsedTemplate = useMemo(() => {
    if (!editor.typeTemplate) return null;
    try {
      const data = JSON.parse(editor.typeTemplate) as BlockEditorData;
      const blocks = Array.isArray(data?.blocks) ? data.blocks : [];
      if (blocks.length === 0) return null;
      return { blocks, hasSlot: hasPostContentPlaceholder(blocks) };
    } catch {
      return null;
    }
  }, [editor.typeTemplate]);

  let blocks: Block[] = [];

  if (editor.active && editor.blocks.length > 0) {
    blocks = editor.blocks;
  } else {
    try {
      const data = JSON.parse(content) as BlockEditorData;
      blocks = data.blocks || [];
    } catch {
      return (
        <div className="prose prose-lg dark:prose-invert max-w-none">
          <div dangerouslySetInnerHTML={{ __html: content }} />
        </div>
      );
    }
  }

  if (editor.active && parsedTemplate) {
    // The slot is the live post-block list. PostContentSlotProvider injects it
    // into every `post-content` block encountered while rendering the template
    // chrome via the static BlockRenderer.
    const slot = <DraggableBlockList blocks={blocks} editor={editor} registry={registry} />;
    const templateContent = JSON.stringify({ blocks: parsedTemplate.blocks, version: '1.0' });
    return (
      <PostContentSlotProvider slot={slot}>
        <BlockRenderer content={templateContent} />
        {/* If the template author forgot a `post-content` block, render the
            editable region after the chrome so the post is still authorable. */}
        {!parsedTemplate.hasSlot && (
          <div className="block-content space-y-6 mt-6">{slot}</div>
        )}
      </PostContentSlotProvider>
    );
  }

  if (blocks.length === 0) return null;

  if (editor.active) {
    return <DraggableBlockList blocks={blocks} editor={editor} registry={registry} />;
  }

  return (
    <div className="block-content space-y-6">
      {blocks.map((block) => {
        const Component = registry.get(block.type);
        if (!Component) return null;
        return (
          <div key={block.id} className="block-wrapper">
            <BlockStyleWrapper block={block}>
              <Component block={block} />
            </BlockStyleWrapper>
          </div>
        );
      })}
    </div>
  );
}

function hasPostContentPlaceholder(blocks: Block[]): boolean {
  for (const b of blocks) {
    if (b?.type === 'post-content') return true;
    if (b?.type === 'columns' && Array.isArray(b.columns)) {
      for (const c of b.columns) if (Array.isArray(c?.blocks) && hasPostContentPlaceholder(c.blocks)) return true;
    }
    if (b?.type === 'tabs' && Array.isArray(b.tabs)) {
      for (const t of b.tabs) if (Array.isArray(t?.blocks) && hasPostContentPlaceholder(t.blocks)) return true;
    }
    if (b?.type === 'section' && Array.isArray(b.blocks) && hasPostContentPlaceholder(b.blocks)) return true;
  }
  return false;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function removeBlock(blocks: Block[], blockId: string): Block[] {
  return blocks.filter(b => b.id !== blockId).map(b => {
    if (b.type === 'columns') return { ...b, columns: b.columns.map(c => ({ ...c, blocks: removeBlock(c.blocks, blockId) })) };
    if (b.type === 'tabs') return { ...b, tabs: b.tabs.map(t => ({ ...t, blocks: removeBlock(t.blocks, blockId) })) };
    if (b.type === 'section') return { ...b, blocks: removeBlock(b.blocks, blockId) };
    return b;
  });
}

function findBlock(blocks: Block[], blockId: string): Block | null {
  for (const b of blocks) {
    if (b.id === blockId) return b;
    if (b.type === 'columns') for (const c of b.columns) { const f = findBlock(c.blocks, blockId); if (f) return f; }
    if (b.type === 'tabs') for (const t of b.tabs) { const f = findBlock(t.blocks, blockId); if (f) return f; }
    if (b.type === 'section') { const f = findBlock(b.blocks, blockId); if (f) return f; }
  }
  return null;
}

function newBlockId() {
  return `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function deepCloneBlock(block: Block): Block {
  const clone = { ...block, id: newBlockId() };
  if (clone.type === 'columns') {
    clone.columns = clone.columns.map(c => ({ ...c, id: newBlockId(), blocks: c.blocks.map(deepCloneBlock) }));
  }
  if (clone.type === 'tabs') {
    clone.tabs = clone.tabs.map(t => ({ ...t, id: newBlockId(), blocks: t.blocks.map(deepCloneBlock) }));
  }
  if (clone.type === 'section') {
    clone.blocks = clone.blocks.map(deepCloneBlock);
  }
  return clone as Block;
}

function allBlockIds(blocks: Block[] | undefined | null): string[] {
  const ids: string[] = [];
  if (!Array.isArray(blocks)) return ids;
  for (const b of blocks) {
    if (!b || typeof b !== 'object') continue;
    if (b.id) ids.push(b.id);
    if (b.type === 'columns' && Array.isArray(b.columns)) {
      b.columns.forEach(c => { if (Array.isArray(c?.blocks)) ids.push(...allBlockIds(c.blocks)); });
    }
    if (b.type === 'tabs' && Array.isArray(b.tabs)) {
      b.tabs.forEach(t => { if (Array.isArray(t?.blocks)) ids.push(...allBlockIds(t.blocks)); });
    }
    if (b.type === 'section' && Array.isArray(b.blocks)) ids.push(...allBlockIds(b.blocks));
  }
  return ids;
}

// ─── Draggable block list (editor mode) ──────────────────────────────────────

function DraggableBlockList({
  blocks,
  editor,
  registry,
}: {
  blocks: Block[];
  editor: ReturnType<typeof useEditorModeContext>;
  registry: ReturnType<typeof getBlockRegistry>;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [externalDropIndex, setExternalDropIndex] = useState<number | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // External drag from parent block picker
  useEffect(() => {
    if (!editor.externalDrag.active) {
      void Promise.resolve().then(() => setExternalDropIndex(null));
      return;
    }

    // Find nearest drop position based on cursor Y coordinate
    const container = contentRef.current;
    if (!container) return;
    const blockEls = container.querySelectorAll<HTMLElement>('[data-block-id]');
    if (blockEls.length === 0) {
      setExternalDropIndex(0);
      return;
    }

    const y = editor.externalDrag.y;
    let bestIndex = blocks.length; // default: append at end
    for (let i = 0; i < blockEls.length; i++) {
      const rect = blockEls[i].getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      if (y < midY) {
        bestIndex = i;
        break;
      }
    }
    setExternalDropIndex(bestIndex);
  }, [editor.externalDrag.active, editor.externalDrag.y, blocks.length]);

  // Handle external drop event
  useEffect(() => {
    const handleDrop = () => {
      const blockType = editor.externalDrag.blockType;
      if (!blockType || externalDropIndex === null) return;

      // Create a default block of the dragged type
      const newBlock: Block = {
        id: `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: blockType as Block['type'],
        order: externalDropIndex,
        content: blockType === 'text' ? 'New text block' : '',
        ...(blockType === 'heading' && { content: 'New Heading', level: 2 }),
        ...(blockType === 'button' && { text: 'Click Me', url: '#' }),
        ...(blockType === 'spacer' && { height: '40px' }),
        ...(blockType === 'divider' && {}),
        ...(blockType === 'quote' && { content: 'Quote text', author: '' }),
        ...(blockType === 'code' && { code: '', language: 'javascript' }),
        ...(blockType === 'image' && { src: '', alt: '' }),
        ...(blockType === 'columns' && { columns: [
          { id: `col-${Date.now()}-1`, width: 50, blocks: [] },
          { id: `col-${Date.now()}-2`, width: 50, blocks: [] },
        ], gap: 'md' }),
        ...(blockType === 'section' && { blocks: [] }),
      } as Block;

      const updated = [...blocks];
      updated.splice(externalDropIndex, 0, newBlock);
      editor.onBlocksReordered(updated);
      sendToParent(IFRAME_MESSAGES.EXTERNAL_DROP_COMPLETED, { blocks: updated });
      setExternalDropIndex(null);
    };

    window.addEventListener('sd-external-drop', handleDrop);
    return () => window.removeEventListener('sd-external-drop', handleDrop);
  }, [blocks, editor, externalDropIndex]);

  // Keyboard shortcuts for block editing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const selectedId = editor.selectedBlockId;
      const idx = selectedId ? blocks.findIndex(b => b.id === selectedId) : -1;

      // Escape: deselect
      if (e.key === 'Escape' && selectedId) {
        editor.onBlockClicked('');
        return;
      }

      // Arrow up/down: navigate blocks (only when not in an input)
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === 'ArrowUp' && !mod && idx > 0) {
        editor.onBlockClicked(blocks[idx - 1].id);
        return;
      }
      if (e.key === 'ArrowDown' && !mod && idx >= 0 && idx < blocks.length - 1) {
        editor.onBlockClicked(blocks[idx + 1].id);
        return;
      }

      if (!mod) return;

      // Cmd+Z: undo, Cmd+Shift+Z: redo
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        editor.undo();
        return;
      }
      if (e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        editor.redo();
        return;
      }

      // Cmd+Shift+Up/Down: move block
      if (e.shiftKey && e.key === 'ArrowUp' && idx > 0) {
        e.preventDefault();
        const updated = [...blocks];
        [updated[idx], updated[idx - 1]] = [updated[idx - 1], updated[idx]];
        editor.onBlocksReordered(updated);
        return;
      }
      if (e.shiftKey && e.key === 'ArrowDown' && idx >= 0 && idx < blocks.length - 1) {
        e.preventDefault();
        const updated = [...blocks];
        [updated[idx], updated[idx + 1]] = [updated[idx + 1], updated[idx]];
        editor.onBlocksReordered(updated);
        return;
      }

      // Cmd+D: duplicate (insert as sibling, even inside containers)
      if (e.key === 'd' && selectedId) {
        e.preventDefault();
        const block = findBlock(blocks, selectedId);
        if (block) {
          const dup = deepCloneBlock(block);
          const updated = insertNearBlock(blocks, selectedId, 'after', dup);
          editor.onBlocksReordered(updated);
        }
        return;
      }

      // Cmd+C / Cmd+V: forward to parent so the cross-post clipboard
      // (parent localStorage) is the single source of truth. Skip when
      // there's a real text selection — that's a regular text copy.
      if (e.key === 'c' && selectedId) {
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed && sel.toString().trim().length > 0) return;
        e.preventDefault();
        sendToParent(IFRAME_MESSAGES.COPY_BLOCKS, {});
        return;
      }
      if (e.key === 'v') {
        e.preventDefault();
        sendToParent(IFRAME_MESSAGES.PASTE_BLOCKS, {});
        return;
      }

      // Cmd+Backspace: delete (skip required blocks)
      if (e.key === 'Backspace' && selectedId) {
        const targetBlock = findBlock(blocks, selectedId);
        if (targetBlock?.required) return;
        e.preventDefault();
        const nextId = idx < blocks.length - 1 ? blocks[idx + 1]?.id : blocks[idx - 1]?.id;
        const updated = removeBlock(blocks, selectedId);
        editor.onBlocksReordered(updated);
        if (nextId) editor.onBlockClicked(nextId);
        return;
      }

      // Cmd+Enter: add block after
      if (e.key === 'Enter' && selectedId) {
        e.preventDefault();
        editor.onAddBlockAfter(selectedId);
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [blocks, editor]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 10 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setDraggingId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setDraggingId(null);
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const activeId = active.id as string;
      const overId = over.id as string;
      const draggedBlock = findBlock(blocks, activeId);
      if (!draggedBlock) return;

      // Drop into a container slot: "container:{containerId}:{slotIndex}"
      if (overId.startsWith('container:')) {
        const parts = overId.split(':');
        const containerId = parts[1];
        const slotIndex = parseInt(parts[2]);
        let updated = removeBlock(blocks, activeId);
        updated = insertIntoContainer(updated, containerId, slotIndex, draggedBlock);
        editor.onBlocksReordered(updated);
        return;
      }

      // Drop between blocks: "between:{blockId}:{position}" (before/after)
      if (overId.startsWith('between:')) {
        const parts = overId.split(':');
        const targetId = parts[1];
        const position = parts[2] as 'before' | 'after';
        let updated = removeBlock(blocks, activeId);
        updated = insertNearBlock(updated, targetId, position, draggedBlock);
        editor.onBlocksReordered(updated);
        return;
      }

      // Simple top-level reorder (fallback)
      const oldIndex = blocks.findIndex((b) => b.id === activeId);
      const newIndex = blocks.findIndex((b) => b.id === overId);
      if (oldIndex !== -1 && newIndex !== -1) {
        const updated = removeBlock(blocks, activeId);
        updated.splice(newIndex > oldIndex ? newIndex - 1 : newIndex, 0, draggedBlock);
        editor.onBlocksReordered(updated);
      }
    },
    [blocks, editor],
  );

  const ids = allBlockIds(blocks);

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={noMovementStrategy}>
        <div className="block-content" ref={contentRef} onClick={(e) => {
            if (e.target === e.currentTarget) {
              editor.onBlockClicked('');
            }
          }}>
          {blocks.map((block, i) => {
            // Defensive key: legacy/LLM-authored blocks sometimes lack ids.
            // Write paths backfill, but we can't trust all on-disk content.
            const reactKey = block.id ?? `block-${i}-${block.type}`;
            return (
            <div key={reactKey}>
              {/* External drop indicator before this block */}
              {editor.externalDrag.active && externalDropIndex === i && (
                <ExternalDropIndicator />
              )}
              {/* Drop zone before this block */}
              <DropIndicator id={`between:${block.id ?? reactKey}:before`} dragging={draggingId !== null} />
              <SortableBlock
                block={block}
                // Require a truthy block.id — otherwise `undefined === undefined`
                // would light up every id-less block when another id-less block
                // is selected (observed on LLM-authored pitch decks).
                isSelected={!!block.id && (editor.selectedBlockIds?.includes(block.id) || editor.selectedBlockId === block.id)}
                isHovered={!!block.id && editor.hoveredBlockId === block.id}
                onClicked={editor.onBlockClicked}
                onHovered={editor.onBlockHovered}
                onAddAfter={editor.onAddBlockAfter}
                onResize={editor.onBlockResized}
                registry={registry}
                draggingId={draggingId}
                editor={editor}
              />
              {/* Drop zone after last block */}
              {i === blocks.length - 1 && (
                <>
                  <DropIndicator id={`between:${block.id ?? reactKey}:after`} dragging={draggingId !== null} />
                  {editor.externalDrag.active && externalDropIndex === blocks.length && (
                    <ExternalDropIndicator />
                  )}
                </>
              )}
            </div>
            );
          })}
          {/* Empty state: show indicator when no blocks exist */}
          {blocks.length === 0 && editor.externalDrag.active && (
            <ExternalDropIndicator />
          )}
        </div>
      </SortableContext>
    </DndContext>
  );
}

// ─── External drop indicator (for drag from parent block picker) ──────────────

function ExternalDropIndicator() {
  return (
    <div className="relative" style={{ height: '4px', margin: '4px 0' }}>
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[3px] bg-green-500 rounded-full z-20">
        <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-green-500 rounded-full" />
        <div className="absolute -right-1 top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-green-500 rounded-full" />
      </div>
    </div>
  );
}

// ─── Drop indicator line between blocks ──────────────────────────────────────

function DropIndicator({ id, dragging }: { id: string; dragging: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id });

  if (!dragging) return <div className="h-2" />;

  return (
    <div
      ref={setNodeRef}
      className="relative"
      style={{ height: '8px' }}
    >
      {isOver && (
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[3px] bg-blue-500 rounded-full z-20">
          <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-blue-500 rounded-full" />
          <div className="absolute -right-1 top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-blue-500 rounded-full" />
        </div>
      )}
    </div>
  );
}

// ─── Container drop zone (inside columns/sections) ───────────────────────────

function ContainerSlotDropZone({ containerId, slotIndex, hasChildren }: { containerId: string; slotIndex: number; hasChildren: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `container:${containerId}:${slotIndex}` });

  return (
    <div
      ref={setNodeRef}
      className={`rounded-md border-2 border-dashed text-center text-xs transition-all ${
        isOver
          ? 'border-blue-400 bg-blue-50 text-blue-600 py-6'
          : hasChildren
            ? 'border-transparent py-1'
            : 'border-gray-200 text-gray-400 py-4'
      }`}
    >
      {isOver ? '+ Drop here' : hasChildren ? '' : 'Drag a block here, or use the "Add Block" panel to insert one'}
    </div>
  );
}

// ─── Sortable block with nested rendering ────────────────────────────────────

function SortableBlock({
  block,
  isSelected,
  isHovered,
  onClicked,
  onHovered,
  onAddAfter,
  onResize,
  registry,
  draggingId,
  editor,
}: {
  block: Block;
  isSelected: boolean;
  isHovered: boolean;
  onClicked: (id: string, modifiers?: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean }) => void;
  onHovered: (id: string | null) => void;
  onAddAfter?: (id: string) => void;
  onResize?: (id: string, width: string | undefined, height: string | undefined) => void;
  registry: ReturnType<typeof getBlockRegistry>;
  draggingId: string | null;
  editor: ReturnType<typeof useEditorModeContext>;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({ id: block.id, transition: null });
  // Get live block data from editor state (includes real-time style updates)
  const liveBlock = editor.blocks.find(b => b.id === block.id) || block;

  const style: React.CSSProperties = {
    opacity: isDragging ? 0.3 : 1,
    transition: 'opacity 200ms',
    position: 'relative' as const,
    zIndex: isDragging ? 50 : undefined,
  };

  const Component = registry.get(block.type);
  if (!Component) return null;

  // For container blocks (columns), render children with drop zones
  const isContainer = block.type === 'columns' || block.type === 'section' || block.type === 'tabs';

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <SelectableBlock
        blockId={block.id}
        blockType={block.type}
        isSelected={isSelected}
        isHovered={isHovered || isDragging}
        onClicked={onClicked}
        onHovered={onHovered}
        onAddAfter={onAddAfter}
        onResize={onResize}
        onStyleUpdate={editor.onBlockStyleUpdated}
        currentStyle={liveBlock.style ? { padding: liveBlock.style.padding, margin: liveBlock.style.margin } : undefined}
        sizeStyle={liveBlock.style ? { width: liveBlock.style.width, height: liveBlock.style.height, maxWidth: liveBlock.style.maxWidth, minWidth: liveBlock.style.minWidth, maxHeight: liveBlock.style.maxHeight, minHeight: liveBlock.style.minHeight } : undefined}
        dragListeners={listeners}
        columnsData={liveBlock.type === 'columns' && 'columns' in liveBlock ? { columns: (liveBlock as { columns: { id: string; width: number }[] }).columns, gap: (liveBlock as { gap?: 'sm' | 'md' | 'lg' }).gap } : undefined}
      >
        {isContainer ? (
          <ContainerBlockRenderer block={liveBlock} registry={registry} draggingId={draggingId} editor={editor} />
        ) : (
          <BlockStyleWrapper block={liveBlock}>
            {createElement(Component, { block: liveBlock })}
          </BlockStyleWrapper>
        )}
      </SelectableBlock>
    </div>
  );
}

// ─── Nested draggable block (inside containers) ─────────────────────────────

function NestedSortableBlock({
  block,
  registry,
  editor,
  draggingId,
}: {
  block: Block;
  registry: ReturnType<typeof getBlockRegistry>;
  editor: ReturnType<typeof useEditorModeContext>;
  draggingId: string | null;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({ id: block.id, transition: null });

  // Find live block from editor state for real-time style updates
  const findLiveBlock = (blocks: Block[], id: string): Block | null => {
    for (const b of blocks) {
      if (b.id === id) return b;
      if (b.type === 'columns') for (const c of b.columns) { const f = findLiveBlock(c.blocks, id); if (f) return f; }
      if (b.type === 'tabs') for (const t of b.tabs) { const f = findLiveBlock(t.blocks, id); if (f) return f; }
      if (b.type === 'section') { const f = findLiveBlock(b.blocks, id); if (f) return f; }
    }
    return null;
  };
  const liveBlock = findLiveBlock(editor.blocks, block.id) || block;

  const style: React.CSSProperties = {
    opacity: isDragging ? 0.3 : 1,
    transition: 'opacity 200ms',
    position: 'relative' as const,
    zIndex: isDragging ? 50 : undefined,
    minWidth: 0,
  };

  const isContainer = block.type === 'columns' || block.type === 'section' || block.type === 'tabs';
  const Component = registry.get(block.type);
  if (!Component) return null;

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      {draggingId && <DropIndicator id={`between:${block.id}:before`} dragging={true} />}
      <SelectableBlock
        blockId={block.id}
        blockType={block.type}
        isSelected={editor.selectedBlockIds?.includes(block.id) || editor.selectedBlockId === block.id}
        isHovered={editor.hoveredBlockId === block.id || isDragging}
        onClicked={editor.onBlockClicked}
        onHovered={editor.onBlockHovered}
        onAddAfter={editor.onAddBlockAfter}
        onResize={editor.onBlockResized}
        onStyleUpdate={editor.onBlockStyleUpdated}
        currentStyle={liveBlock.style ? { padding: liveBlock.style.padding, margin: liveBlock.style.margin } : undefined}
        sizeStyle={liveBlock.style ? { width: liveBlock.style.width, height: liveBlock.style.height, maxWidth: liveBlock.style.maxWidth, minWidth: liveBlock.style.minWidth, maxHeight: liveBlock.style.maxHeight, minHeight: liveBlock.style.minHeight } : undefined}
        dragListeners={listeners}
        columnsData={liveBlock.type === 'columns' && 'columns' in liveBlock ? { columns: (liveBlock as { columns: { id: string; width: number }[] }).columns, gap: (liveBlock as { gap?: 'sm' | 'md' | 'lg' }).gap } : undefined}
      >
        {isContainer ? (
          <ContainerBlockRenderer block={liveBlock} registry={registry} draggingId={draggingId} editor={editor} />
        ) : (
          <BlockStyleWrapper block={liveBlock}>
            {createElement(Component, { block: liveBlock })}
          </BlockStyleWrapper>
        )}
      </SelectableBlock>
    </div>
  );
}

// ─── Container block renderer (columns with nested drop zones) ───────────────

function ContainerBlockRenderer({
  block,
  registry,
  draggingId,
  editor,
}: {
  block: Block;
  registry: ReturnType<typeof getBlockRegistry>;
  draggingId: string | null;
  editor: ReturnType<typeof useEditorModeContext>;
}) {
  if (block.type === 'columns') {
    const gapClass = { sm: 'gap-4', md: 'gap-6', lg: 'gap-8' }[block.gap || 'md'];
    // Mirror ColumnsBlockRender: widths can be stored as `number` or as a
    // string like "55%" (LLM-authored / migrated decks). Strip the % so we
    // don't emit "55%%" — invalid CSS that collapses the column to auto.
    const parseWidth = (w: number | string | undefined) =>
      typeof w === 'string' ? parseFloat(w) || 50 : (typeof w === 'number' ? w : 50);
    const cols = block.columns || [];
    const rawWidths = cols.map(c => parseWidth(c.width));
    const totalWidth = rawWidths.reduce((s, w) => s + w, 0);
    const widths = totalWidth > 100 ? rawWidths.map(w => (w / totalWidth) * 100) : rawWidths;
    return (
      <BlockStyleWrapper block={block}>
        <div className={`flex ${gapClass} py-4`}>
          {cols.map((col, i) => {
            const verticalAlignClass = col.verticalAlign === 'center' ? 'flex flex-col justify-center' : col.verticalAlign === 'bottom' ? 'flex flex-col justify-end' : '';
            const paddingClass = col.padding === 'sm' ? 'p-2' : col.padding === 'md' ? 'p-4' : col.padding === 'lg' ? 'p-6' : '';
            const colWidth = `${widths[i]}%`;
            return (
              <div
                key={col.id}
                className={`${paddingClass} ${verticalAlignClass} ${col.cssClass || ''} min-h-[60px]`}
                style={{
                  flex: `0 0 ${colWidth}`,
                  maxWidth: colWidth,
                  ...(col.backgroundColor ? { backgroundColor: col.backgroundColor } : {}),
                }}
              >
                {(col.blocks || []).map((nested, ni) => (
                  <div key={nested.id}>
                    <NestedSortableBlock block={nested} registry={registry} editor={editor} draggingId={draggingId} />
                    {ni === (col.blocks || []).length - 1 && draggingId && (
                      <DropIndicator id={`between:${nested.id}:after`} dragging={true} />
                    )}
                  </div>
                ))}
                <ContainerSlotDropZone containerId={block.id} slotIndex={i} hasChildren={(col.blocks || []).length > 0} />
              </div>
            );
          })}
        </div>
      </BlockStyleWrapper>
    );
  }

  if (block.type === 'tabs') {
    return (
      <BlockStyleWrapper block={block}>
        <TabsContainerEditor block={block} registry={registry} draggingId={draggingId} editor={editor} />
      </BlockStyleWrapper>
    );
  }

  if (block.type === 'section') {
    const s = block.style;
    // Apply section-specific props — mirrors SectionBlockRender
    const bgColor = s?.backgroundColor || block.backgroundColor;
    const color = s?.color || block.color;
    const padding = s?.padding || `${block.paddingTop || '0'} ${block.paddingRight || '0'} ${block.paddingBottom || '0'} ${block.paddingLeft || '0'}`;
    // Compose background-image from gradient + image — mirrors SectionBlockRender
    const bgLayers: string[] = [];
    if (s?.backgroundGradient) bgLayers.push(s.backgroundGradient);
    const resolvedBgImage = s?.backgroundImage || block.backgroundImage;
    if (resolvedBgImage) bgLayers.push(`url(${resolvedBgImage})`);
    const bgImageStyle = bgLayers.length
      ? {
          backgroundImage: bgLayers.join(', '),
          backgroundSize: s?.backgroundSize || block.backgroundSize || 'cover',
          backgroundPosition: s?.backgroundPosition || block.backgroundPosition || 'center',
          ...(s?.backgroundRepeat ? { backgroundRepeat: s.backgroundRepeat } : {}),
          ...(s?.backgroundAttachment ? { backgroundAttachment: s.backgroundAttachment as React.CSSProperties['backgroundAttachment'] } : {}),
          ...(s?.backgroundBlendMode ? { backgroundBlendMode: s.backgroundBlendMode as React.CSSProperties['backgroundBlendMode'] } : {}),
        }
      : {};
    const sectionOuterStyle: React.CSSProperties = {
      ...(bgColor ? { backgroundColor: bgColor } : {}),
      ...bgImageStyle,
      ...(color ? { color } : {}),
      padding,
      // Border
      ...(s?.borderWidth ? { borderWidth: s.borderWidth } : {}),
      ...(s?.borderColor ? { borderColor: s.borderColor } : {}),
      ...(s?.borderStyle ? { borderStyle: s.borderStyle as React.CSSProperties['borderStyle'] } : {}),
      ...(s?.borderRadius ? { borderRadius: s.borderRadius } : {}),
      ...(s?.borderTopWidth ? { borderTopWidth: s.borderTopWidth } : {}),
      ...(s?.borderTopColor ? { borderTopColor: s.borderTopColor } : {}),
      ...(s?.borderTopStyle ? { borderTopStyle: s.borderTopStyle as React.CSSProperties['borderTopStyle'] } : {}),
      ...(s?.borderRightWidth ? { borderRightWidth: s.borderRightWidth } : {}),
      ...(s?.borderRightColor ? { borderRightColor: s.borderRightColor } : {}),
      ...(s?.borderRightStyle ? { borderRightStyle: s.borderRightStyle as React.CSSProperties['borderRightStyle'] } : {}),
      ...(s?.borderBottomWidth ? { borderBottomWidth: s.borderBottomWidth } : {}),
      ...(s?.borderBottomColor ? { borderBottomColor: s.borderBottomColor } : {}),
      ...(s?.borderBottomStyle ? { borderBottomStyle: s.borderBottomStyle as React.CSSProperties['borderBottomStyle'] } : {}),
      ...(s?.borderLeftWidth ? { borderLeftWidth: s.borderLeftWidth } : {}),
      ...(s?.borderLeftColor ? { borderLeftColor: s.borderLeftColor } : {}),
      ...(s?.borderLeftStyle ? { borderLeftStyle: s.borderLeftStyle as React.CSSProperties['borderLeftStyle'] } : {}),
      ...(s?.borderTopLeftRadius ? { borderTopLeftRadius: s.borderTopLeftRadius } : {}),
      ...(s?.borderTopRightRadius ? { borderTopRightRadius: s.borderTopRightRadius } : {}),
      ...(s?.borderBottomLeftRadius ? { borderBottomLeftRadius: s.borderBottomLeftRadius } : {}),
      ...(s?.borderBottomRightRadius ? { borderBottomRightRadius: s.borderBottomRightRadius } : {}),
      ...(s?.boxShadow ? { boxShadow: s.boxShadow } : {}),
      ...(s?.opacity ? { opacity: s.opacity } : {}),
    };
    const sectionInnerStyle: React.CSSProperties = {
      ...(block.maxWidth ? { maxWidth: block.maxWidth, marginLeft: 'auto', marginRight: 'auto' } : {}),
      ...(s?.display ? { display: s.display } : {}),
      ...(s?.flexDirection ? { flexDirection: s.flexDirection } : {}),
      ...(s?.justifyContent ? { justifyContent: s.justifyContent } : {}),
      ...(s?.alignItems ? { alignItems: s.alignItems } : {}),
      ...(s?.flexWrap ? { flexWrap: s.flexWrap } : {}),
      ...(s?.gap ? { gap: s.gap } : {}),
    };
    return (
      <div style={sectionOuterStyle}>
        <BlockStyleWrapper block={block}>
          <div className="border border-dashed border-gray-200/40 rounded min-h-[60px]" style={sectionInnerStyle}>
            {(block.blocks || []).map((nested, ni) => (
              <Fragment key={nested.id}>
                <NestedSortableBlock block={nested} registry={registry} editor={editor} draggingId={draggingId} />
                {ni === (block.blocks || []).length - 1 && draggingId && (
                  <DropIndicator id={`between:${nested.id}:after`} dragging={true} />
                )}
              </Fragment>
            ))}
            <ContainerSlotDropZone containerId={block.id} slotIndex={0} hasChildren={(block.blocks || []).length > 0} />
          </div>
        </BlockStyleWrapper>
      </div>
    );
  }

  // Fallback: render via registry
  const Component = registry.get(block.type);
  if (!Component) return null;
  return (
    <BlockStyleWrapper block={block}>
      {createElement(Component, { block })}
    </BlockStyleWrapper>
  );
}

// ─── Tabs container editor (tab headers + per-tab drop zone) ─────────────────

function TabsContainerEditor({
  block,
  registry,
  draggingId,
  editor,
}: {
  block: Extract<Block, { type: 'tabs' }>;
  registry: ReturnType<typeof getBlockRegistry>;
  draggingId: string | null;
  editor: ReturnType<typeof useEditorModeContext>;
}) {
  const tabs = block.tabs || [];
  const [activeTabId, setActiveTabId] = useState(tabs[0]?.id);
  const activeIndex = Math.max(0, tabs.findIndex(t => t.id === activeTabId));
  const activeTab = tabs[activeIndex] || tabs[0];

  return (
    <div className="border border-border rounded-lg overflow-hidden my-4">
      <div className="flex border-b border-border bg-muted/30">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setActiveTabId(tab.id);
            }}
            className={`px-4 py-3 font-medium transition-colors border-b-2 ${
              activeTab?.id === tab.id
                ? 'border-primary text-primary bg-background'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label || 'Tab'}
          </button>
        ))}
      </div>
      <div className="p-4 bg-card min-h-[120px]">
        {activeTab && (activeTab.blocks || []).map((nested, ni) => (
          <Fragment key={nested.id}>
            <NestedSortableBlock block={nested} registry={registry} editor={editor} draggingId={draggingId} />
            {ni === (activeTab.blocks || []).length - 1 && draggingId && (
              <DropIndicator id={`between:${nested.id}:after`} dragging={true} />
            )}
          </Fragment>
        ))}
        {activeTab && (
          <ContainerSlotDropZone
            containerId={block.id}
            slotIndex={activeIndex}
            hasChildren={(activeTab.blocks || []).length > 0}
          />
        )}
      </div>
    </div>
  );
}

// ─── Helpers for inserting blocks ────────────────────────────────────────────

function insertNearBlock(blocks: Block[], targetId: string, position: 'before' | 'after', blockToInsert: Block): Block[] {
  const result: Block[] = [];
  for (const b of blocks) {
    if (b.id === targetId) {
      if (position === 'before') { result.push(blockToInsert); result.push(b); }
      else { result.push(b); result.push(blockToInsert); }
    } else {
      const updated = { ...b };
      if (b.type === 'columns') {
        (updated as typeof b).columns = b.columns.map(c => ({ ...c, blocks: insertNearBlock(c.blocks, targetId, position, blockToInsert) }));
      }
      if (b.type === 'tabs') {
        (updated as typeof b).tabs = b.tabs.map(t => ({ ...t, blocks: insertNearBlock(t.blocks, targetId, position, blockToInsert) }));
      }
      if (b.type === 'section') {
        (updated as typeof b).blocks = insertNearBlock(b.blocks, targetId, position, blockToInsert);
      }
      result.push(updated);
    }
  }
  return result;
}

function insertIntoContainer(blocks: Block[], containerId: string, slotIndex: number, blockToInsert: Block): Block[] {
  return blocks.map(b => {
    if (b.id === containerId) {
      if (b.type === 'columns') {
        return { ...b, columns: b.columns.map((c, i) => i === slotIndex ? { ...c, blocks: [...c.blocks, blockToInsert] } : c) };
      }
      if (b.type === 'tabs') {
        return { ...b, tabs: b.tabs.map((t, i) => i === slotIndex ? { ...t, blocks: [...t.blocks, blockToInsert] } : t) };
      }
      if (b.type === 'section') {
        return { ...b, blocks: [...b.blocks, blockToInsert] };
      }
    }
    if (b.type === 'columns') return { ...b, columns: b.columns.map(c => ({ ...c, blocks: insertIntoContainer(c.blocks, containerId, slotIndex, blockToInsert) })) };
    if (b.type === 'tabs') return { ...b, tabs: b.tabs.map(t => ({ ...t, blocks: insertIntoContainer(t.blocks, containerId, slotIndex, blockToInsert) })) };
    if (b.type === 'section') return { ...b, blocks: insertIntoContainer(b.blocks, containerId, slotIndex, blockToInsert) };
    return b;
  });
}
