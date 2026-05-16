'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FabricObject } from 'fabric';

import { useCanvasStore } from '@/lib/designer/canvasStore';
import {
  applyOutlineEffectToFabricObject,
  applyShadowEffectToFabricObject,
} from '@/lib/designer/layerFactory';
import type { TextLayerData, TextShadowEffect } from '@/lib/designer/types';

/**
 * Floating "Effects" panel that mounts at the bottom-center of the canvas and
 * is only shown when exactly one text layer is selected. Lives in a sibling
 * mount slot so it doesn't fight wave-2's PropertiesPanel for real estate.
 *
 * Mutations are applied directly to the underlying FabricObject; we then fire
 * `object:modified` so the existing DesignCanvas event handler syncs the
 * change back into the layer store (and autosave catches it).
 */
export default function EffectsFloating() {
  const selectedLayers = useCanvasStore((s) => s.selectedLayers);
  const layers = useCanvasStore((s) => s.layers);
  const canvas = useCanvasStore((s) => s.canvas);
  const activeLayerId = useCanvasStore((s) => s.activeLayerId);

  // Single text layer? (Fabric's text type is 'i-text' or 'text' depending on
  // sub-class; the designer adds FabricText so it's 'text', but we accept both.)
  const isSingleTextSelection = useMemo(() => {
    if (selectedLayers.length !== 1) return false;
    const obj = selectedLayers[0] as unknown as { type?: string };
    return obj.type === 'text' || obj.type === 'i-text';
  }, [selectedLayers]);

  const fabricObj = selectedLayers[0] as FabricObject | undefined;
  const layer = useMemo(
    () => layers.find((l) => l.id === activeLayerId) || null,
    [layers, activeLayerId]
  );
  const layerData = (layer?.data as Partial<TextLayerData> | undefined) || {};

  // Local state mirrors the layer; reseed on selection change so toggling
  // between layers doesn't carry stale values.
  const [outlineEnabled, setOutlineEnabled] = useState(false);
  const [outlineColor, setOutlineColor] = useState('#000000');
  const [outlineWidth, setOutlineWidth] = useState(2);
  const [shadowEnabled, setShadowEnabled] = useState(false);
  const [shadowColor, setShadowColor] = useState('#000000');
  const [shadowOffsetX, setShadowOffsetX] = useState(2);
  // Collapsed = chip-only at bottom-right. Expanded = full panel. Persist so
  // the customer's preference survives selection changes during one session.
  const [collapsed, setCollapsed] = useState(false);
  const [shadowOffsetY, setShadowOffsetY] = useState(2);
  const [shadowBlur, setShadowBlur] = useState(4);

  useEffect(() => {
    if (!isSingleTextSelection || !layer) return;
    const hasOutline = !!(
      layerData.stroke && (layerData.strokeWidth ?? 0) > 0
    );
    setOutlineEnabled(hasOutline);
    setOutlineColor(layerData.stroke || '#000000');
    setOutlineWidth(layerData.strokeWidth ?? 2);

    const sh = layerData.shadow;
    if (sh && sh.enabled) {
      setShadowEnabled(true);
      setShadowColor(sh.color || '#000000');
      setShadowOffsetX(sh.offsetX ?? 2);
      setShadowOffsetY(sh.offsetY ?? 2);
      setShadowBlur(sh.blur ?? 4);
    } else {
      setShadowEnabled(false);
      setShadowColor('#000000');
      setShadowOffsetX(2);
      setShadowOffsetY(2);
      setShadowBlur(4);
    }
    // Reset only when the *selected layer* changes — not when its data drifts.
  }, [activeLayerId, isSingleTextSelection]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = useCallback(() => {
    if (!canvas || !fabricObj) return;
    canvas.requestRenderAll();
    canvas.fire('object:modified', { target: fabricObj });
  }, [canvas, fabricObj]);

  const applyOutline = useCallback(
    (enabled: boolean, color: string, width: number) => {
      if (!fabricObj) return;
      applyOutlineEffectToFabricObject(
        fabricObj,
        color,
        enabled ? width : 0
      );
      commit();
    },
    [fabricObj, commit]
  );

  const applyShadow = useCallback(
    (effect: TextShadowEffect | null) => {
      if (!fabricObj) return;
      applyShadowEffectToFabricObject(fabricObj, effect);
      commit();
    },
    [fabricObj, commit]
  );

  if (!isSingleTextSelection || !fabricObj) return null;

  // Collapsed: a single chip the customer can click to expand the full panel.
  // Keeps the canvas centre unobstructed when the panel isn't actively in use.
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="fixed bottom-20 right-4 z-30 inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/95 dark:bg-neutral-900/95 border border-neutral-200 dark:border-neutral-800 shadow-md text-xs text-neutral-700 dark:text-neutral-200 hover:bg-white dark:hover:bg-neutral-900"
        aria-label="Show text effects"
      >
        <span className="material-icons text-sm">auto_fix_high</span>
        Effects
      </button>
    );
  }

  return (
    <div
      className="fixed bottom-20 right-4 z-30 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-lg p-3 flex flex-col gap-3 text-xs text-neutral-700 dark:text-neutral-200 w-[360px]"
      role="region"
      aria-label="Text effects"
    >
      <div className="flex items-center justify-between gap-1 font-medium text-neutral-900 dark:text-neutral-100">
        <span className="flex items-center gap-1">
          <span className="material-icons text-sm">auto_fix_high</span>
          Effects
        </span>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          aria-label="Collapse effects"
          className="p-0.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500"
        >
          <span className="material-icons text-base">close_fullscreen</span>
        </button>
      </div>

      {/* Outline row */}
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1 cursor-pointer select-none min-w-[88px]">
          <input
            type="checkbox"
            checked={outlineEnabled}
            onChange={(e) => {
              const v = e.target.checked;
              setOutlineEnabled(v);
              applyOutline(v, outlineColor, outlineWidth);
            }}
            className="accent-primary"
          />
          Outline
        </label>
        <input
          type="range"
          min={0}
          max={8}
          step={0.5}
          value={outlineWidth}
          disabled={!outlineEnabled}
          onChange={(e) => {
            const v = Number(e.target.value);
            setOutlineWidth(v);
            if (outlineEnabled) applyOutline(true, outlineColor, v);
          }}
          className="flex-1 accent-primary disabled:opacity-40"
          aria-label="Outline thickness"
        />
        <span className="w-8 tabular-nums text-right">
          {outlineWidth.toFixed(1)}
        </span>
        <input
          type="color"
          value={outlineColor}
          disabled={!outlineEnabled}
          onChange={(e) => {
            setOutlineColor(e.target.value);
            if (outlineEnabled)
              applyOutline(true, e.target.value, outlineWidth);
          }}
          className="h-7 w-9 rounded border border-neutral-300 dark:border-neutral-700 bg-transparent cursor-pointer disabled:opacity-40"
          aria-label="Outline color"
        />
      </div>

      {/* Shadow rows */}
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1 cursor-pointer select-none min-w-[88px]">
          <input
            type="checkbox"
            checked={shadowEnabled}
            onChange={(e) => {
              const v = e.target.checked;
              setShadowEnabled(v);
              applyShadow(
                v
                  ? {
                      enabled: true,
                      color: shadowColor,
                      offsetX: shadowOffsetX,
                      offsetY: shadowOffsetY,
                      blur: shadowBlur,
                    }
                  : null
              );
            }}
            className="accent-primary"
          />
          Shadow
        </label>
        <input
          type="color"
          value={shadowColor}
          disabled={!shadowEnabled}
          onChange={(e) => {
            setShadowColor(e.target.value);
            if (shadowEnabled)
              applyShadow({
                enabled: true,
                color: e.target.value,
                offsetX: shadowOffsetX,
                offsetY: shadowOffsetY,
                blur: shadowBlur,
              });
          }}
          className="h-7 w-9 rounded border border-neutral-300 dark:border-neutral-700 bg-transparent cursor-pointer disabled:opacity-40"
          aria-label="Shadow color"
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <ShadowSlider
          label="Offset X"
          min={-20}
          max={20}
          value={shadowOffsetX}
          disabled={!shadowEnabled}
          onChange={(v) => {
            setShadowOffsetX(v);
            if (shadowEnabled)
              applyShadow({
                enabled: true,
                color: shadowColor,
                offsetX: v,
                offsetY: shadowOffsetY,
                blur: shadowBlur,
              });
          }}
        />
        <ShadowSlider
          label="Offset Y"
          min={-20}
          max={20}
          value={shadowOffsetY}
          disabled={!shadowEnabled}
          onChange={(v) => {
            setShadowOffsetY(v);
            if (shadowEnabled)
              applyShadow({
                enabled: true,
                color: shadowColor,
                offsetX: shadowOffsetX,
                offsetY: v,
                blur: shadowBlur,
              });
          }}
        />
        <ShadowSlider
          label="Blur"
          min={0}
          max={20}
          value={shadowBlur}
          disabled={!shadowEnabled}
          onChange={(v) => {
            setShadowBlur(v);
            if (shadowEnabled)
              applyShadow({
                enabled: true,
                color: shadowColor,
                offsetX: shadowOffsetX,
                offsetY: shadowOffsetY,
                blur: v,
              });
          }}
        />
      </div>
    </div>
  );
}

function ShadowSlider({
  label,
  min,
  max,
  value,
  disabled,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  value: number;
  disabled: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-center justify-between text-[11px] text-neutral-500 dark:text-neutral-400">
        <span>{label}</span>
        <span className="tabular-nums">{value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-primary disabled:opacity-40"
      />
    </label>
  );
}
