'use client';

import React, { useMemo } from 'react';

import { useCanvasStore } from '@/lib/designer/canvasStore';
import type { LayerData } from '@/lib/designer/types';

interface LayersPanelProps {
  className?: string;
  onShowAddLayerPanel?: () => void;
}

/**
 * Compact layers panel: shows all layers on the active surface (z-sorted,
 * top-to-bottom), with visibility / lock / delete toggles. Click selects a
 * layer; Ctrl/Cmd+Click multi-selects.
 *
 * Adapted from `productDesigner/components/EnhancedLayersPanel.tsx` minus
 * drag-reorder + virtualization (kept simple here — wiring agent can extend).
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

  const sorted = useMemo(
    () => [...layers].sort((a, b) => b.zIndex - a.zIndex),
    [layers]
  );

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
          sorted.map((layer) => (
            <LayerRow
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
          ))
        )}
      </div>
    </div>
  );
}

interface LayerRowProps {
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

function LayerRow({
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
}: LayerRowProps) {
  const typeIcon = layer.type === 'text'
    ? 'text_fields'
    : layer.type === 'icon'
      ? 'star'
      : 'image';

  return (
    <div
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
