'use client';

import { memo, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import type { Block } from '@/types/blocks';
import { BLOCK_ICON_MAP } from './_lib/block-icon-map';

/**
 * One node in the layer tree. Recursive — sections, columns, tabs, and
 * accordion items all expand into nested children. Selection, multi-select,
 * rename, and delete all happen here; drag/drop sortable hooks are wired up
 * by the parent DndContext + SortableContext.
 *
 * Wrapped in React.memo with a custom equality check so selecting block A
 * doesn't re-render the entire tree of unrelated layer rows. Selection state
 * is the field that flips most often during normal editing, so we re-render
 * only when this specific block transitions in/out of the selection set; the
 * block reference change covers content edits, and the callback identities
 * are stable from the parent.
 */
function LayerItemComponent({
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

/**
 * Custom equality predicate for the memoized LayerItem. Re-renders when:
 *  - the block reference changes (content/structure edit on THIS block)
 *  - this block's selected status changes (single-select or multi-select set)
 *  - depth / showDropIndicator change (drag/drop visuals)
 *  - the callback identities change (rare — parent should memoize them)
 *
 * Critically does NOT re-render when an UNRELATED block becomes selected:
 * `selectedBlockId` and `selectedBlockIds` change for the whole tree on every
 * selection, so we project them onto "is THIS block selected" before the
 * comparison. With ~100 layers a click used to re-render all 100; now it
 * re-renders the 2 that actually flipped.
 */
function layerItemPropsAreEqual(
  prev: Parameters<typeof LayerItemComponent>[0],
  next: Parameters<typeof LayerItemComponent>[0],
): boolean {
  if (prev.block !== next.block) return false;
  if (prev.depth !== next.depth) return false;
  if (prev.showDropIndicator !== next.showDropIndicator) return false;
  if (prev.onSelect !== next.onSelect) return false;
  if (prev.onDelete !== next.onDelete) return false;
  if (prev.onUpdate !== next.onUpdate) return false;
  if (prev.onContextMenu !== next.onContextMenu) return false;
  const id = prev.block.id;
  const prevSelected = !!id && (
    (prev.selectedBlockIds ?? []).length > 1
      ? (prev.selectedBlockIds ?? []).includes(id)
      : prev.selectedBlockId === id
  );
  const nextSelected = !!id && (
    (next.selectedBlockIds ?? []).length > 1
      ? (next.selectedBlockIds ?? []).includes(id)
      : next.selectedBlockId === id
  );
  if (prevSelected !== nextSelected) return false;
  return true;
}

export const LayerItem = memo(LayerItemComponent, layerItemPropsAreEqual);

// ─── Container Drop Zone ─────────────────────────────────────────────────────

export function ContainerDropZone({ containerId, slotIndex, depth }: { containerId: string; slotIndex: number; depth: number }) {
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
