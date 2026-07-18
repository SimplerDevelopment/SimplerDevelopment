'use client';

import React, { useCallback, useMemo, useState } from 'react';

import { useCanvasStore } from '@/lib/designer/canvasStore';
import { tintKey } from '@/lib/designer/fillResolver';
import type { BatchUpdateData, LayerType } from '@/lib/designer/types';

import ColorPicker from './ColorPicker';

const TINT_LABELS: Record<string, string> = {
  '#ffffff': 'White',
  '#c9cbcd': 'Heather Grey',
  '#111111': 'Black',
  '#1f2a44': 'Navy',
  '#1d4ed8': 'Royal Blue',
  '#1f5132': 'Forest Green',
  '#b71c1c': 'Red',
  '#65161f': 'Burgundy',
  '#c9a227': 'Mustard',
};

interface BatchPropertiesPanelProps {
  selectedLayerIds: string[];
  onBatchUpdate: (updates: BatchUpdateData) => void;
  layerTypes: LayerType[];
  batchEditableProperties: Array<'opacity' | 'visible' | 'locked' | 'color'>;
  disabled?: boolean;
  className?: string;
}

/**
 * Bulk editor for opacity / visibility / lock / color across the current
 * multi-selection. Ported from `productDesigner/components/BatchPropertiesPanel.tsx`.
 */
export default function BatchPropertiesPanel({
  selectedLayerIds,
  onBatchUpdate,
  layerTypes,
  batchEditableProperties,
  disabled = false,
  className = '',
}: BatchPropertiesPanelProps) {
  const [opacity, setOpacity] = useState<number>(100);
  const [visible, setVisible] = useState<boolean>(true);
  const [locked, setLocked] = useState<boolean>(false);
  const [color, setColor] = useState<string>('#000000');
  const mockupTint = useCanvasStore((s) => s.mockupTint);
  const tintLabel = mockupTint
    ? (TINT_LABELS[mockupTint.toLowerCase()] ?? mockupTint.toUpperCase())
    : null;

  const canEditColor = useMemo(() => {
    if (!batchEditableProperties.includes('color')) return false;
    if (layerTypes.length === 0) return false;
    return layerTypes.every((t) => t === 'text' || t === 'icon');
  }, [layerTypes, batchEditableProperties]);

  const available = {
    opacity: batchEditableProperties.includes('opacity'),
    visible: batchEditableProperties.includes('visible'),
    locked: batchEditableProperties.includes('locked'),
    color: canEditColor,
  };

  const applyUpdate = useCallback(
    (next: BatchUpdateData) => {
      if (disabled || selectedLayerIds.length === 0) return;
      const filtered: BatchUpdateData = {};
      if (next.opacity !== undefined) filtered.opacity = next.opacity;
      if (next.visible !== undefined) filtered.visible = next.visible;
      if (next.locked !== undefined) filtered.locked = next.locked;
      if (next.color !== undefined) {
        filtered.color = next.color;
        // When a mockup tint is active, scope the bulk colour change to that
        // tint via fillByTint so other shirt colours keep their base fill.
        if (mockupTint) {
          filtered.colorTintKey = tintKey(mockupTint);
        }
      }
      if (Object.keys(filtered).length === 0) return;
      onBatchUpdate(filtered);
    },
    [disabled, selectedLayerIds.length, onBatchUpdate, mockupTint]
  );

  if (selectedLayerIds.length === 0) return null;

  return (
    <div
      className={`space-y-4 ${disabled ? 'opacity-50 pointer-events-none' : ''} ${className}`}
    >
      <div className="flex items-center justify-between text-sm">
        <span className="text-foreground font-medium inline-flex items-center gap-1.5">
          <span className="material-icons text-base">layers</span>
          {selectedLayerIds.length} layers
        </span>
      </div>

      {available.opacity && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs font-medium text-foreground">
            <span className="inline-flex items-center gap-1">
              <span className="material-icons text-sm">tune</span>
              Opacity
            </span>
            <span className="text-muted-foreground">{opacity}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={opacity}
            onChange={(e) => {
              const v = Number(e.target.value);
              setOpacity(v);
              applyUpdate({ opacity: v / 100 });
            }}
            className="w-full"
          />
        </div>
      )}

      {available.color && (
        <div className="space-y-1">
          <div className="text-xs font-medium text-foreground inline-flex items-center gap-1">
            <span className="material-icons text-sm">palette</span>
            {tintLabel ? `Color (${tintLabel})` : 'Color'}
          </div>
          <ColorPicker
            value={color}
            onChange={(hex) => {
              setColor(hex);
              applyUpdate({ color: hex });
            }}
          />
          {tintLabel && (
            <p className="text-[10px] text-muted-foreground leading-snug">
              Override the fill for the {selectedLayerIds.length} selected
              layers only when {tintLabel} is the active shirt colour.
            </p>
          )}
        </div>
      )}

      <div className="flex gap-2">
        {available.visible && (
          <button
            type="button"
            onClick={() => {
              const next = !visible;
              setVisible(next);
              applyUpdate({ visible: next });
            }}
            className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-md border transition-colors ${
              visible
                ? 'border-border bg-background text-foreground hover:bg-muted'
                : 'border-border bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            <span className="material-icons text-base">
              {visible ? 'visibility' : 'visibility_off'}
            </span>
            {visible ? 'Visible' : 'Hidden'}
          </button>
        )}
        {available.locked && (
          <button
            type="button"
            onClick={() => {
              const next = !locked;
              setLocked(next);
              applyUpdate({ locked: next });
            }}
            className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-md border transition-colors ${
              locked
                ? 'border-border bg-muted text-foreground hover:bg-muted/80'
                : 'border-border bg-background text-foreground hover:bg-muted'
            }`}
          >
            <span className="material-icons text-base">
              {locked ? 'lock' : 'lock_open'}
            </span>
            {locked ? 'Locked' : 'Unlocked'}
          </button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Changes apply to all {selectedLayerIds.length} selected layers.
      </p>
    </div>
  );
}
