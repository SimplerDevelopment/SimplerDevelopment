'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { FabricObject } from 'fabric';

import { useCanvasStore } from '@/lib/designer/canvasStore';
import type {
  IconLayerData,
  LayerData,
  TextLayerData,
} from '@/lib/designer/types';

import BatchPropertiesPanel from './BatchPropertiesPanel';

interface PropertiesPanelProps {
  className?: string;
}

interface GeneralPropertiesState {
  left: number;
  top: number;
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
  angle: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
}

const DEFAULT_PROPS: GeneralPropertiesState = {
  left: 0,
  top: 0,
  width: 0,
  height: 0,
  scaleX: 1,
  scaleY: 1,
  angle: 0,
  opacity: 1,
  visible: true,
  locked: false,
};

/**
 * Properties panel — shows transform / opacity / type-specific properties
 * for the currently selected layer(s). When >1 layer is selected, shows the
 * BatchPropertiesPanel.
 */
export default function PropertiesPanel({ className = '' }: PropertiesPanelProps) {
  const selectedLayers = useCanvasStore((s) => s.selectedLayers);
  const layers = useCanvasStore((s) => s.layers);
  const updateLayer = useCanvasStore((s) => s.updateLayer);
  const getSelectedLayerIds = useCanvasStore((s) => s.getSelectedLayerIds);
  const getBatchEditableProperties = useCanvasStore(
    (s) => s.getBatchEditableProperties
  );
  const batchUpdateLayers = useCanvasStore((s) => s.batchUpdateLayers);

  const primary = selectedLayers[0];
  const isMulti = selectedLayers.length > 1;
  const primaryLayer = useMemo<LayerData | undefined>(
    () =>
      layers.find((l) => {
        const id =
          (primary as unknown as { data?: { id?: string } })?.data?.id ||
          (primary as unknown as { id?: string })?.id;
        return l.id === id;
      }),
    [layers, primary]
  );

  if (selectedLayers.length === 0) {
    return (
      <div
        className={`bg-background border border-border rounded-md p-6 text-center ${className}`}
      >
        <span className="material-icons text-3xl text-muted-foreground mb-2 block">
          tune
        </span>
        <p className="text-sm text-muted-foreground">
          Select a layer to edit its properties
        </p>
      </div>
    );
  }

  if (isMulti) {
    const ids = getSelectedLayerIds();
    const selectedTypes = layers
      .filter((l) => ids.includes(l.id))
      .map((l) => l.type);
    return (
      <div
        className={`bg-background border border-border rounded-md ${className}`}
      >
        <div className="px-3 py-2 border-b border-border">
          <h3 className="text-sm font-medium text-foreground">
            Batch Properties
          </h3>
        </div>
        <div className="p-3">
          <BatchPropertiesPanel
            selectedLayerIds={ids}
            onBatchUpdate={batchUpdateLayers}
            layerTypes={selectedTypes}
            batchEditableProperties={getBatchEditableProperties()}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-background border border-border rounded-md ${className}`}>
      <div className="px-3 py-2 border-b border-border">
        <h3 className="text-sm font-medium text-foreground truncate">
          {primaryLayer?.name || 'Properties'}{' '}
          <span className="text-xs text-muted-foreground">
            ({primaryLayer?.type || 'unknown'})
          </span>
        </h3>
      </div>
      <div className="p-3 space-y-4">
        <GeneralProperties primaryObject={primary} primaryLayer={primaryLayer} updateLayer={updateLayer} />
        {primaryLayer?.type === 'text' && (
          <TextProperties layer={primaryLayer} updateLayer={updateLayer} />
        )}
        {primaryLayer?.type === 'icon' && (
          <IconProperties layer={primaryLayer} updateLayer={updateLayer} />
        )}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */

function GeneralProperties({
  primaryObject,
  primaryLayer,
  updateLayer,
}: {
  primaryObject: FabricObject | undefined;
  primaryLayer: LayerData | undefined;
  updateLayer: (id: string, updates: Partial<LayerData>) => void;
}) {
  const [props, setProps] = useState<GeneralPropertiesState>(DEFAULT_PROPS);

  useEffect(() => {
    if (!primaryObject) return;
    const bounds = primaryObject.getBoundingRect();
    setProps({
      left: Math.round(primaryObject.left ?? 0),
      top: Math.round(primaryObject.top ?? 0),
      width: Math.round(bounds.width),
      height: Math.round(bounds.height),
      scaleX: primaryObject.scaleX ?? 1,
      scaleY: primaryObject.scaleY ?? 1,
      angle: Math.round(primaryObject.angle ?? 0),
      opacity: primaryObject.opacity ?? 1,
      visible: primaryObject.visible !== false,
      locked: !primaryObject.selectable,
    });
  }, [primaryObject]);

  const handleChange = (key: keyof GeneralPropertiesState, value: number | boolean) => {
    setProps((p) => ({ ...p, [key]: value }));
    if (!primaryObject) return;
    switch (key) {
      case 'left':
      case 'top':
      case 'angle':
      case 'opacity':
      case 'scaleX':
      case 'scaleY':
        primaryObject.set({ [key]: value } as Record<string, number>);
        break;
      case 'visible':
        primaryObject.set({ visible: value as boolean });
        break;
      case 'locked':
        primaryObject.set({
          selectable: !(value as boolean),
          evented: !(value as boolean),
        });
        break;
    }
    if (primaryLayer) {
      const patch: Partial<LayerData> = { [key]: value } as Partial<LayerData>;
      updateLayer(primaryLayer.id, patch);
    }
    primaryObject.canvas?.renderAll();
  };

  return (
    <div className="space-y-3">
      <FieldRow label="Position">
        <NumberField
          label="X"
          value={props.left}
          onChange={(v) => handleChange('left', v)}
        />
        <NumberField
          label="Y"
          value={props.top}
          onChange={(v) => handleChange('top', v)}
        />
      </FieldRow>

      <FieldRow label="Scale">
        <NumberField
          label="X"
          step={0.1}
          min={0.1}
          max={10}
          value={Number(props.scaleX.toFixed(2))}
          onChange={(v) => handleChange('scaleX', v)}
        />
        <NumberField
          label="Y"
          step={0.1}
          min={0.1}
          max={10}
          value={Number(props.scaleY.toFixed(2))}
          onChange={(v) => handleChange('scaleY', v)}
        />
      </FieldRow>

      <div>
        <label className="block text-xs font-medium text-foreground mb-1">
          Rotation: {props.angle}°
        </label>
        <input
          type="range"
          min={0}
          max={360}
          value={props.angle}
          onChange={(e) => handleChange('angle', Number(e.target.value))}
          className="w-full"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-foreground mb-1">
          Opacity: {Math.round(props.opacity * 100)}%
        </label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={props.opacity}
          onChange={(e) => handleChange('opacity', Number(e.target.value))}
          className="w-full"
        />
      </div>

      <div className="flex flex-wrap gap-3">
        <label className="inline-flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={props.visible}
            onChange={(e) => handleChange('visible', e.target.checked)}
          />
          Visible
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={props.locked}
            onChange={(e) => handleChange('locked', e.target.checked)}
          />
          Locked
        </label>
      </div>
    </div>
  );
}

function TextProperties({
  layer,
  updateLayer,
}: {
  layer: LayerData;
  updateLayer: (id: string, updates: Partial<LayerData>) => void;
}) {
  const data = (layer.data || {}) as TextLayerData;

  const patch = (next: Partial<TextLayerData>) => {
    updateLayer(layer.id, {
      data: { ...data, ...next } as Partial<TextLayerData>,
    } as Partial<LayerData>);
  };

  return (
    <div className="space-y-3 border-t border-border pt-3">
      <div>
        <label className="block text-xs font-medium text-foreground mb-1">
          Text
        </label>
        <textarea
          rows={2}
          value={data.text || ''}
          onChange={(e) => patch({ text: e.target.value })}
          className="w-full px-2 py-1.5 text-sm rounded-md border border-border bg-background text-foreground"
        />
      </div>
      <FieldRow label="Font">
        <input
          type="text"
          value={data.fontFamily || ''}
          onChange={(e) => patch({ fontFamily: e.target.value })}
          placeholder="Arial"
          className="flex-1 px-2 py-1 text-sm rounded-md border border-border bg-background text-foreground"
        />
        <NumberField
          label="px"
          value={data.fontSize ?? 24}
          onChange={(v) => patch({ fontSize: v })}
        />
      </FieldRow>
      <FieldRow label="Color">
        <input
          type="color"
          value={(data.fill || data.color || '#000000') as string}
          onChange={(e) => patch({ fill: e.target.value, color: e.target.value })}
          className="w-10 h-8 rounded-md border border-border cursor-pointer"
        />
        <input
          type="text"
          value={(data.fill || data.color || '#000000') as string}
          onChange={(e) => patch({ fill: e.target.value, color: e.target.value })}
          className="flex-1 px-2 py-1 text-sm rounded-md border border-border bg-background text-foreground"
        />
      </FieldRow>
    </div>
  );
}

function IconProperties({
  layer,
  updateLayer,
}: {
  layer: LayerData;
  updateLayer: (id: string, updates: Partial<LayerData>) => void;
}) {
  const data = (layer.data || {}) as IconLayerData;
  const patch = (next: Partial<IconLayerData>) => {
    updateLayer(layer.id, {
      data: { ...data, ...next } as Partial<IconLayerData>,
    } as Partial<LayerData>);
  };
  return (
    <div className="space-y-3 border-t border-border pt-3">
      <FieldRow label="Icon name">
        <input
          type="text"
          value={data.iconName || ''}
          onChange={(e) => patch({ iconName: e.target.value })}
          className="flex-1 px-2 py-1 text-sm rounded-md border border-border bg-background text-foreground"
        />
      </FieldRow>
      <FieldRow label="Color">
        <input
          type="color"
          value={(data.fill || data.color || '#000000') as string}
          onChange={(e) => patch({ fill: e.target.value, color: e.target.value })}
          className="w-10 h-8 rounded-md border border-border cursor-pointer"
        />
        <NumberField
          label="px"
          value={data.size ?? 48}
          onChange={(v) => patch({ size: v })}
        />
      </FieldRow>
    </div>
  );
}

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-foreground mb-1">
        {label}
      </label>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step,
  min,
  max,
}: {
  label?: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  return (
    <div className="flex-1">
      {label && (
        <div className="text-[10px] uppercase text-muted-foreground mb-0.5">
          {label}
        </div>
      )}
      <input
        type="number"
        step={step ?? 1}
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full px-2 py-1 text-sm rounded-md border border-border bg-background text-foreground"
      />
    </div>
  );
}
