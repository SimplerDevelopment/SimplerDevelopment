'use client';

import React, { useMemo, useState, useRef, useEffect } from 'react';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { useCanvasStore } from '@/lib/designer/canvasStore';
import type { LayerData } from '@/lib/designer/types';

interface LayersPanelProps {
  className?: string;
  onShowAddLayerPanel?: () => void;
}

/**
 * Compact layers panel: shows all layers on the active surface (z-sorted,
 * top-to-bottom), with drag-reorder + visibility / lock / delete toggles.
 * Click selects a layer; Ctrl/Cmd+Click multi-selects.
 *
 * Drag-reorder uses @dnd-kit/sortable. The drag handle is the only drag
 * activator — the row itself stays clickable for selection so the existing
 * up/down/dup/delete buttons keep working. On reorder we call
 * `useCanvasStore.reorderLayers(orderedIds)` with the new top-to-bottom order.
 */
export default function LayersPanel({
  className = '',
  onShowAddLayerPanel,
}: LayersPanelProps) {
  const canvas = useCanvasStore((s) => s.canvas);
  const layers = useCanvasStore((s) => s.layers);
  const layerSelection = useCanvasStore((s) => s.layerSelection);
  const activeLayerId = useCanvasStore((s) => s.activeLayerId);
  const setActiveLayer = useCanvasStore((s) => s.setActiveLayer);
  const removeLayer = useCanvasStore((s) => s.removeLayer);
  const duplicateLayer = useCanvasStore((s) => s.duplicateLayer);
  const toggleLayerVisibility = useCanvasStore((s) => s.toggleLayerVisibility);
  const toggleLayerLock = useCanvasStore((s) => s.toggleLayerLock);
  const selectMultipleLayers = useCanvasStore((s) => s.selectMultipleLayers);
  const toggleLayerSelection = useCanvasStore((s) => s.toggleLayerSelection);
  const reorderLayer = useCanvasStore((s) => s.reorderLayer);
  const reorderLayers = useCanvasStore((s) => s.reorderLayers);
  const clearLayers = useCanvasStore((s) => s.clearLayers);

  const handleClearAll = () => {
    if (layers.length === 0) return;
    const ok = typeof window !== 'undefined'
      ? window.confirm(`Remove all ${layers.length} layer${layers.length === 1 ? '' : 's'} from this surface? This can be undone with Ctrl+Z.`)
      : true;
    if (ok) clearLayers();
  };

  const sorted = useMemo(
    () => [...layers].sort((a, b) => b.zIndex - a.zIndex),
    [layers]
  );

  const sortedIds = useMemo(() => sorted.map((l) => l.id), [sorted]);

  // Distance activation lets simple clicks on the handle still pass through
  // to selection logic without immediately starting a drag.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (ev: DragEndEvent) => {
    const { active, over } = ev;
    if (!over || active.id === over.id) return;
    const oldIndex = sortedIds.indexOf(String(active.id));
    const newIndex = sortedIds.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(sortedIds, oldIndex, newIndex);
    reorderLayers(next);
  };

  const handleSelect = (layerId: string, ev: React.MouseEvent) => {
    if (ev.ctrlKey || ev.metaKey) {
      toggleLayerSelection(layerId);
      return;
    }
    if (!canvas) {
      setActiveLayer(layerId);
      selectMultipleLayers([layerId]);
      return;
    }
    const fabricObj = canvas.getObjects().find(
      (o) =>
        ((o as unknown as { data?: { id?: string } }).data?.id ||
          (o as unknown as { id?: string }).id) === layerId
    );
    if (fabricObj) {
      canvas.setActiveObject(fabricObj);
      canvas.renderAll();
    }
    setActiveLayer(layerId);
    selectMultipleLayers([layerId]);
  };

  return (
    <div
      className={`bg-background border border-border rounded-md ${className}`}
    >
      <div className="px-3 py-2 border-b border-border flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-foreground">
          Layers <span className="text-muted-foreground">({sorted.length})</span>
        </h3>
        <div className="flex items-center gap-2">
          {layerSelection.selectionMode === 'multiple' && (
            <span className="text-xs text-muted-foreground">
              {layerSelection.selectedLayerIds.length} selected
            </span>
          )}
          {sorted.length >= 2 && (
            <button
              type="button"
              onClick={handleClearAll}
              title="Remove every layer on this surface"
              className="inline-flex items-center gap-1 px-1.5 py-1 rounded text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            >
              <span className="material-icons text-sm">delete_sweep</span>
              <span className="hidden sm:inline">Clear</span>
            </button>
          )}
        </div>
      </div>

      {onShowAddLayerPanel && (
        <div className="p-2 border-b border-border">
          <button
            type="button"
            onClick={onShowAddLayerPanel}
            className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-md border border-dashed border-border text-foreground hover:bg-muted transition-colors"
          >
            <span className="material-icons text-base">add</span>
            <span>Add layer</span>
          </button>
        </div>
      )}

      <div className="max-h-96 overflow-y-auto p-2 space-y-1">
        {sorted.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            <span className="material-icons text-3xl mb-2 block">
              layers
            </span>
            <p className="text-sm">No layers yet</p>
            <p className="text-xs mt-1">Add content to get started</p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={sortedIds}
              strategy={verticalListSortingStrategy}
            >
              {sorted.map((layer) => (
                <SortableLayerRow
                  key={layer.id}
                  layer={layer}
                  active={layer.id === activeLayerId}
                  selected={layerSelection.selectedLayerIds.includes(layer.id)}
                  onSelect={(ev) => handleSelect(layer.id, ev)}
                  onToggleVisibility={() => toggleLayerVisibility(layer.id)}
                  onToggleLock={() => toggleLayerLock(layer.id)}
                  onDelete={() => removeLayer(layer.id)}
                  onDuplicate={() => duplicateLayer(layer.id)}
                  onMoveUp={() => reorderLayer(layer.id, 'up')}
                  onMoveDown={() => reorderLayer(layer.id, 'down')}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}

interface SortableLayerRowProps {
  layer: LayerData;
  active: boolean;
  selected: boolean;
  onSelect: (ev: React.MouseEvent) => void;
  onToggleVisibility: () => void;
  onToggleLock: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function SortableLayerRow({
  layer,
  active,
  selected,
  onSelect,
  onToggleVisibility,
  onToggleLock,
  onDelete,
  onDuplicate,
  onMoveUp,
  onMoveDown,
}: SortableLayerRowProps) {
  const updateLayer = useCanvasStore((s) => s.updateLayer);
  const reorderLayer = useCanvasStore((s) => s.reorderLayer);
  const layerCount = useCanvasStore((s) => s.layers.length);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(layer.name);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // When entering edit mode, focus + select the whole name so a customer can
  // immediately retype without first clearing it.
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  // Keep the draft in sync if the layer's name changes externally
  // (e.g. an Undo while we're editing).
  useEffect(() => {
    if (!editing) setDraftName(layer.name);
  }, [layer.name, editing]);

  const commitName = () => {
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== layer.name) {
      updateLayer(layer.id, { name: trimmed });
    } else {
      setDraftName(layer.name);
    }
    setEditing(false);
  };

  const cancelEdit = () => {
    setDraftName(layer.name);
    setEditing(false);
  };

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: layer.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
    position: 'relative',
  };

  // Build a tiny inline preview for the row instead of a single generic icon:
  // text shows the first 2 chars in the layer's own font + color; icons
  // render their glyph in their own fill color; images show a 24×24
  // thumbnail of the URL.
  const data = (layer.data ?? {}) as Record<string, unknown>;
  const layerPreview = (() => {
    if (layer.type === 'text') {
      const text = (data.text as string) || 'T';
      const fontFamily = (data.fontFamily as string) || 'Arial';
      const fill = (data.fill as string) || (data.color as string) || '#111';
      return (
        <span
          className="inline-flex items-center justify-center w-6 h-6 text-[10px] font-bold rounded bg-muted overflow-hidden"
          style={{ fontFamily, color: fill }}
          aria-hidden="true"
        >
          {text.slice(0, 2)}
        </span>
      );
    }
    if (layer.type === 'icon') {
      const glyphMap: Record<string, string> = {
        star: 'star',
        heart: 'favorite',
        circle: 'circle',
        square: 'square',
        triangle: 'change_history',
        diamond: 'diamond',
        arrow: 'north_east',
        check: 'check_circle',
        bolt: 'bolt',
      };
      const iconName = (data.iconName as string) || 'star';
      const fill = (data.fill as string) || (data.color as string) || '#111';
      return (
        <span
          className="inline-flex items-center justify-center w-6 h-6 rounded bg-muted"
          style={{ color: fill }}
          aria-hidden="true"
        >
          <span className="material-icons text-base">
            {glyphMap[iconName] ?? 'star'}
          </span>
        </span>
      );
    }
    if (layer.type === 'image' && typeof data.url === 'string') {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={data.url}
          alt=""
          className="w-6 h-6 rounded object-cover bg-muted"
          aria-hidden="true"
        />
      );
    }
    return (
      <span
        className="inline-flex items-center justify-center w-6 h-6 rounded bg-muted text-muted-foreground"
        aria-hidden="true"
      >
        <span className="material-icons text-base">image</span>
      </span>
    );
  })();

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onSelect}
      onContextMenu={(e) => {
        e.preventDefault();
        onSelect(e);
        setContextMenu({ x: e.clientX, y: e.clientY });
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(e as unknown as React.MouseEvent);
        }
      }}
      className={`group flex items-center gap-2 px-2 py-1.5 rounded-md border cursor-pointer transition-colors ${
        active || selected
          ? 'border-primary bg-primary/10'
          : 'border-transparent hover:bg-muted'
      }`}
    >
      {/* Drag handle — only this element initiates a drag */}
      <button
        type="button"
        aria-label="Drag to reorder"
        title="Drag to reorder"
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        className="p-0.5 -ml-0.5 rounded text-muted-foreground/60 hover:text-foreground hover:bg-background/70 cursor-grab active:cursor-grabbing touch-none"
      >
        <span className="material-icons text-base">drag_indicator</span>
      </button>

      {layerPreview}
      {editing ? (
        <input
          ref={inputRef}
          type="text"
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitName();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              cancelEdit();
            }
            e.stopPropagation();
          }}
          onClick={(e) => e.stopPropagation()}
          aria-label="Rename layer"
          className="flex-1 text-sm px-1 py-0.5 rounded border border-border bg-background text-foreground focus:outline-none focus:border-primary"
        />
      ) : (
        <span
          onDoubleClick={(e) => {
            e.stopPropagation();
            setEditing(true);
          }}
          title="Double-click to rename"
          className={`flex-1 text-sm truncate cursor-text select-none ${
            layer.visible ? 'text-foreground' : 'text-muted-foreground line-through'
          }`}
        >
          {layer.name}
        </span>
      )}

      {/* Action buttons are removed from layout (not just faded) until the
          row is hovered/focused, so the layer name has room to display
          renamed strings like "My Cool Star Front" without being clipped. */}
      <div
        className={`items-center gap-0.5 ${
          active || selected
            ? 'flex'
            : 'hidden group-hover:flex group-focus-within:flex'
        }`}
      >
        <IconButton
          ariaLabel={layer.visible ? 'Hide layer' : 'Show layer'}
          onClick={onToggleVisibility}
          name={layer.visible ? 'visibility' : 'visibility_off'}
        />
        <IconButton
          ariaLabel={layer.locked ? 'Unlock layer' : 'Lock layer'}
          onClick={onToggleLock}
          name={layer.locked ? 'lock' : 'lock_open'}
        />
        <IconButton ariaLabel="Move layer up" onClick={onMoveUp} name="expand_less" />
        <IconButton
          ariaLabel="Move layer down"
          onClick={onMoveDown}
          name="expand_more"
        />
        <IconButton
          ariaLabel="Duplicate layer"
          onClick={onDuplicate}
          name="content_copy"
        />
        <IconButton ariaLabel="Delete layer" onClick={onDelete} name="delete" />
      </div>
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={[
            { glyph: 'flip_to_front', label: 'Bring to front', onClick: () => reorderLayer(layer.id, 0) },
            { glyph: 'arrow_upward', label: 'Bring forward', onClick: onMoveUp },
            { glyph: 'arrow_downward', label: 'Send backward', onClick: onMoveDown },
            { glyph: 'flip_to_back', label: 'Send to back', onClick: () => reorderLayer(layer.id, Math.max(0, layerCount - 1)) },
            { divider: true },
            { glyph: 'edit', label: 'Rename', onClick: () => setEditing(true) },
            { glyph: 'content_copy', label: 'Duplicate', onClick: onDuplicate },
            { glyph: layer.visible ? 'visibility_off' : 'visibility', label: layer.visible ? 'Hide' : 'Show', onClick: onToggleVisibility },
            { glyph: layer.locked ? 'lock_open' : 'lock', label: layer.locked ? 'Unlock' : 'Lock', onClick: onToggleLock },
            { divider: true },
            { glyph: 'delete', label: 'Delete', onClick: onDelete, destructive: true },
          ]}
        />
      )}
    </div>
  );
}

interface MenuItemDivider {
  divider: true;
}
interface MenuItemAction {
  glyph: string;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}
type MenuItem = MenuItemDivider | MenuItemAction;

function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', onClickOutside);
    window.addEventListener('keydown', onEsc);
    return () => {
      window.removeEventListener('mousedown', onClickOutside);
      window.removeEventListener('keydown', onEsc);
    };
  }, [onClose]);

  // Clamp the menu inside the viewport so right-click near the edge doesn't
  // push the menu off-screen.
  const left = Math.min(x, (typeof window !== 'undefined' ? window.innerWidth : 9999) - 220);
  const top = Math.min(y, (typeof window !== 'undefined' ? window.innerHeight : 9999) - items.length * 32 - 16);

  return (
    <div
      ref={ref}
      style={{ left, top }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      className="fixed z-50 min-w-[200px] py-1 rounded-md border border-border bg-background shadow-lg text-sm"
      role="menu"
    >
      {items.map((it, i) =>
        'divider' in it ? (
          <div key={`d-${i}`} className="my-1 border-t border-border" />
        ) : (
          <button
            key={`${it.label}-${i}`}
            type="button"
            onClick={() => {
              it.onClick();
              onClose();
            }}
            className={`w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-muted ${
              it.destructive ? 'text-destructive' : 'text-foreground'
            }`}
            role="menuitem"
          >
            <span className="material-icons text-base">{it.glyph}</span>
            {it.label}
          </button>
        )
      )}
    </div>
  );
}

function IconButton({
  ariaLabel,
  onClick,
  name,
}: {
  ariaLabel: string;
  onClick: () => void;
  name: string;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      title={ariaLabel}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="p-1 rounded hover:bg-background/70 text-muted-foreground hover:text-foreground transition-colors"
    >
      <span className="material-icons text-base">{name}</span>
    </button>
  );
}
