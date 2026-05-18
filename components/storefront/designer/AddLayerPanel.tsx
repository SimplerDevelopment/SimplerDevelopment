'use client';

import React, { useRef } from 'react';

import { useCanvasStore } from '@/lib/designer/canvasStore';
import { createFabricIcon, createFabricText } from '@/lib/designer/layerFactory';
import { loadGoogleFont } from '@/lib/designer/fontVirtualizer';
import { useAddImageLayer } from '@/lib/designer/hooks/useAddImageLayer';
import type {
  IconLayerData,
  TextLayerData,
  UploadedImageResult,
} from '@/lib/designer/types';

interface AddLayerPanelProps {
  className?: string;
  onLayerAdded?: (type: 'text' | 'icon' | 'image') => void;
  onClose?: () => void;
  /**
   * Caller-provided uploader. Receives the user's file and must resolve with
   * a public URL + image dimensions. The parent (designer shell / page) wires
   * this to the storefront image-upload API.
   */
  onUploadImage: (file: File) => Promise<UploadedImageResult>;
}

// Pre-styled text presets shown in a small gallery — one-click drop-in for
// customers who don't want to fiddle with font pickers. Each preset is a
// partial TextLayerData override merged over the standard text defaults.
const TEXT_PRESETS: Array<{
  label: string;
  preview: string;
  textData: Partial<TextLayerData>;
}> = [
  {
    label: 'Headline',
    preview: 'BIG BOLD HEADLINE',
    textData: {
      text: 'BIG BOLD HEADLINE',
      fontFamily: 'Anton',
      fontSize: 64,
      fontWeight: 'bold',
      fill: '#000000',
      fontSource: 'google',
      googleFont: { family: 'Anton', variants: ['400'] },
    },
  },
  {
    label: 'Script',
    preview: 'elegant script',
    textData: {
      text: 'elegant script',
      fontFamily: 'Pacifico',
      fontSize: 48,
      fontWeight: 'normal',
      fontStyle: 'italic',
      fill: '#374151',
      fontSource: 'google',
      googleFont: { family: 'Pacifico', variants: ['400'] },
    },
  },
  {
    label: 'Vintage',
    preview: 'Vintage Stamp',
    textData: {
      text: 'Vintage Stamp',
      fontFamily: 'Bebas Neue',
      fontSize: 56,
      fontWeight: 'bold',
      fill: 'transparent',
      stroke: '#000000',
      strokeWidth: 2,
      fontSource: 'google',
      googleFont: { family: 'Bebas Neue', variants: ['400'] },
    },
  },
  {
    label: 'Pink',
    preview: 'rainbow',
    textData: {
      text: 'rainbow',
      fontFamily: 'Roboto',
      fontSize: 48,
      fontWeight: 'normal',
      fill: '#ec4899',
      fontSource: 'google',
      googleFont: { family: 'Roboto', variants: ['400'] },
    },
  },
  {
    label: 'Mono',
    preview: 'MONOSPACE',
    textData: {
      text: 'MONOSPACE',
      fontFamily: 'Roboto Mono',
      fontSize: 36,
      fontWeight: 'normal',
      fill: '#0ea5e9',
      fontSource: 'google',
      googleFont: { family: 'Roboto Mono', variants: ['400'] },
    },
  },
  {
    label: 'Quote',
    preview: 'Quote',
    textData: {
      text: 'Quote',
      fontFamily: 'Playfair Display',
      fontSize: 40,
      fontWeight: 'normal',
      fontStyle: 'italic',
      fill: '#1e293b',
      fontSource: 'google',
      googleFont: { family: 'Playfair Display', variants: ['400'] },
    },
  },
];

// Each entry is the icon name we store on the layer + the Material Icons glyph
// used both for the panel button and for rendering on the canvas via
// createFabricIcon. Keeping these in one place stops the panel from showing
// six identical stars (the original bug — every shape button rendered "star").
const POPULAR_ICONS: Array<{ name: string; glyph: string; label: string }> = [
  { name: 'star',     glyph: 'star',           label: 'Star' },
  { name: 'heart',    glyph: 'favorite',       label: 'Heart' },
  { name: 'circle',   glyph: 'circle',         label: 'Circle' },
  { name: 'square',   glyph: 'square',         label: 'Square' },
  { name: 'triangle', glyph: 'change_history', label: 'Triangle' },
  { name: 'diamond',  glyph: 'diamond',        label: 'Diamond' },
  { name: 'arrow',    glyph: 'north_east',     label: 'Arrow' },
  { name: 'check',    glyph: 'check_circle',   label: 'Check' },
  { name: 'bolt',     glyph: 'bolt',           label: 'Bolt' },
];

/**
 * Add-layer panel — buttons for inserting text, icons, and uploaded images.
 *
 * Image upload is delegated to a parent-supplied callback so this component
 * stays agnostic of the storefront API.
 */
export default function AddLayerPanel({
  className = '',
  onLayerAdded,
  onClose,
  onUploadImage,
}: AddLayerPanelProps) {
  const canvas = useCanvasStore((s) => s.canvas);
  const addLayer = useCanvasStore((s) => s.addLayer);
  const setSelectedLayers = useCanvasStore((s) => s.setSelectedLayers);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Shared with DesignerShell's canvas drop zone — keeps the upload-then-add
  // behavior in one place so both code paths render identical layers.
  const addImageLayer = useAddImageLayer({ onUploadImage });

  /**
   * Pick a high-contrast ink colour for a given tint. Returns null when the
   * base colour (#111111) is already readable. The customer can still
   * override with the properties panel — this just sets a sensible default
   * so new layers don't drop in invisible against a dark shirt.
   * YIQ brightness lifted from the W3C WCAG draft heuristic.
   */
  const contrastingInkForTint = (tint: string | null | undefined): string | null => {
    if (!tint) return null;
    const hex = tint.replace('#', '');
    const full = hex.length === 3
      ? hex.split('').map((c) => c + c).join('')
      : hex;
    if (full.length !== 6) return null;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    if ([r, g, b].some((v) => Number.isNaN(v))) return null;
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness < 128 ? '#ffffff' : null;
  };

  const handleAddText = (override?: Partial<TextLayerData>) => {
    if (!canvas) return;
    const cx = canvas.getWidth() / 2;
    const cy = canvas.getHeight() / 2;
    const tint = useCanvasStore.getState().mockupTint;
    const tintInk = contrastingInkForTint(tint);
    // Only inject a smart per-tint override when the caller didn't provide
    // its own `fill`. Presets pick deliberate colours (Pink, Vintage, etc.)
    // and shouldn't be overridden to white/black on dark mockups.
    const callerHasFill =
      override?.fill !== undefined || override?.color !== undefined;
    const defaults: TextLayerData = {
      text: 'New Text',
      fontFamily: 'Arial',
      fontSize: 32,
      fontWeight: 'normal',
      // Base fill stays black so the layer reads correctly on any *other*
      // tint the customer hasn't customised yet. When the current tint
      // needs a contrasting ink, we stash it in `fillByTint` so switching
      // away from this shirt colour reveals the base black instead of
      // carrying the white-on-black guess everywhere.
      fill: '#111111',
      textAlign: 'left',
      lineHeight: 1.2,
      charSpacing: 0,
      ...(tint && tintInk && !callerHasFill
        ? { fillByTint: { [tint.toLowerCase()]: tintInk } }
        : {}),
    };
    const textData: TextLayerData = { ...defaults, ...(override || {}) };
    const layerId = addLayer({
      type: 'text',
      name: 'Text Layer',
      visible: true,
      locked: false,
      opacity: 1,
      left: cx,
      top: cy,
      scaleX: 1,
      scaleY: 1,
      angle: 0,
      data: textData as unknown as Record<string, unknown>,
    });
    const fab = createFabricText(textData.text, {
      left: cx,
      top: cy,
      originX: 'center',
      originY: 'center',
      fontFamily: textData.fontFamily,
      fontSize: textData.fontSize,
      fontWeight: textData.fontWeight,
      fontStyle: textData.fontStyle,
      fill: textData.fill,
      textAlign: textData.textAlign,
      lineHeight: textData.lineHeight,
      charSpacing: textData.charSpacing,
      stroke: textData.stroke,
      strokeWidth: textData.strokeWidth,
      data: { id: layerId, type: 'text' },
    });
    canvas.add(fab);
    canvas.setActiveObject(fab);
    canvas.renderAll();
    setSelectedLayers([fab]);
    onLayerAdded?.('text');
  };

  const handleAddPreset = async (
    preset: (typeof TEXT_PRESETS)[number]
  ): Promise<void> => {
    // Best-effort: load Google font before adding so Fabric measures glyphs
    // against the real face. Non-fatal if the load fails — handleAddText still
    // proceeds with the requested family.
    if (preset.textData.googleFont) {
      try {
        await loadGoogleFont(preset.textData.googleFont);
      } catch {
        // ignore — handleAddText will still render with fallback.
      }
    }
    handleAddText(preset.textData);
  };

  const handleAddIcon = (iconName: string) => {
    if (!canvas) return;
    const cx = canvas.getWidth() / 2;
    const cy = canvas.getHeight() / 2;
    const tint = useCanvasStore.getState().mockupTint;
    const tintInk = contrastingInkForTint(tint);
    const iconData: IconLayerData = {
      iconName,
      fill: '#111111',
      size: 64,
      ...(tint && tintInk
        ? { fillByTint: { [tint.toLowerCase()]: tintInk } }
        : {}),
    };
    const layerId = addLayer({
      type: 'icon',
      name: `${iconName} icon`,
      visible: true,
      locked: false,
      opacity: 1,
      left: cx,
      top: cy,
      scaleX: 1,
      scaleY: 1,
      angle: 0,
      data: iconData as unknown as Record<string, unknown>,
    });
    const fab = createFabricIcon(iconName, {
      left: cx,
      top: cy,
      originX: 'center',
      originY: 'center',
      fill: iconData.fill,
      fontSize: iconData.size,
      data: { id: layerId, type: 'icon' },
    });
    canvas.add(fab);
    canvas.setActiveObject(fab);
    canvas.renderAll();
    setSelectedLayers([fab]);
    onLayerAdded?.('icon');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      void addImageLayer(file).then(() => onLayerAdded?.('image'));
    }
    e.target.value = '';
  };

  return (
    <div className={`bg-background border border-border rounded-md ${className}`}>
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">Add Layer</h3>
        {onClose && (
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
          >
            <span className="material-icons text-base">close</span>
          </button>
        )}
      </div>

      <div className="p-3 space-y-2">
        <button
          type="button"
          onClick={() => handleAddText()}
          className="w-full inline-flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-background text-foreground hover:bg-muted text-sm transition-colors"
        >
          <span className="material-icons text-base">text_fields</span>
          <span className="flex-1 text-left">Text</span>
        </button>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-full inline-flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-background text-foreground hover:bg-muted text-sm transition-colors"
        >
          <span className="material-icons text-base">image</span>
          <span className="flex-1 text-left">Upload image</span>
        </button>

        <div className="pt-2 border-t border-border">
          <p className="text-xs font-medium text-muted-foreground mb-2">
            Icons
          </p>
          <div className="grid grid-cols-3 gap-2">
            {POPULAR_ICONS.map(({ name, glyph, label }) => (
              <button
                key={name}
                type="button"
                onClick={() => handleAddIcon(name)}
                className="inline-flex flex-col items-center justify-center gap-1 px-2 py-2.5 rounded-md border border-border bg-background hover:bg-muted text-sm transition-colors"
                title={`Add ${label.toLowerCase()}`}
                aria-label={`Add ${label.toLowerCase()}`}
              >
                <span className="material-icons text-xl text-foreground/80">{glyph}</span>
                <span className="text-[10px] text-muted-foreground">{label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="pt-2 border-t border-border">
          <p className="text-xs font-medium text-muted-foreground mb-2">
            Text presets
          </p>
          <div className="grid grid-cols-2 gap-2">
            {TEXT_PRESETS.map((preset) => {
              const previewStyle: React.CSSProperties = {
                fontFamily: preset.textData.fontFamily,
                fontSize: '14px',
                fontWeight: preset.textData.fontWeight as React.CSSProperties['fontWeight'],
                fontStyle: preset.textData.fontStyle,
                color:
                  preset.textData.fill && preset.textData.fill !== 'transparent'
                    ? preset.textData.fill
                    : preset.textData.stroke || '#111111',
                WebkitTextStroke:
                  preset.textData.fill === 'transparent' && preset.textData.stroke
                    ? `1px ${preset.textData.stroke}`
                    : undefined,
              };
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => void handleAddPreset(preset)}
                  className="inline-flex flex-col items-center justify-center gap-1 px-2 py-2.5 rounded-md border border-border bg-background hover:bg-muted transition-colors overflow-hidden"
                  title={`Add "${preset.preview}" preset`}
                  aria-label={`Add ${preset.label} text preset`}
                >
                  <span
                    className="truncate max-w-full leading-tight"
                    style={previewStyle}
                  >
                    {preset.preview}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {preset.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}
