'use client';

import React, { useMemo } from 'react';
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
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">
          Layers <span className="text-muted-foreground">({sorted.length})</span>
        </h3>
        {layerSelection.selectionMode === 'multiple' && (
          <span className="text-xs text-muted-foreground">
            {layerSelection.selectedLayerIds.length} selected
          </span>
        )}
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

  const typeIcon = layer.type === 'text'
    ? 'text_fields'
    : layer.type === 'icon'
      ? 'star'
      : 'image';

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onSelect}
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

      <span className="material-icons text-base text-muted-foreground">
        {typeIcon}
      </span>
      <span
        className={`flex-1 text-sm truncate ${
          layer.visible ? 'text-foreground' : 'text-muted-foreground line-through'
        }`}
      >
        {layer.name}
      </span>

      <div className="flex items-center gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
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
