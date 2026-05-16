'use client';

import React, { useRef } from 'react';

import { useCanvasStore } from '@/lib/designer/canvasStore';
import { createFabricIcon, createFabricImage, createFabricText } from '@/lib/designer/layerFactory';
import type {
  IconLayerData,
  ImageLayerData,
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

  const handleAddText = () => {
    if (!canvas) return;
    const cx = canvas.getWidth() / 2;
    const cy = canvas.getHeight() / 2;
    const textData: TextLayerData = {
      text: 'New Text',
      fontFamily: 'Arial',
      fontSize: 32,
      fontWeight: 'normal',
      fill: '#111111',
      textAlign: 'left',
      lineHeight: 1.2,
      charSpacing: 0,
    };
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
      fill: textData.fill,
      textAlign: textData.textAlign,
      data: { id: layerId, type: 'text' },
    });
    canvas.add(fab);
    canvas.setActiveObject(fab);
    canvas.renderAll();
    setSelectedLayers([fab]);
    onLayerAdded?.('text');
  };

  const handleAddIcon = (iconName: string) => {
    if (!canvas) return;
    const cx = canvas.getWidth() / 2;
    const cy = canvas.getHeight() / 2;
    const iconData: IconLayerData = {
      iconName,
      fill: '#111111',
      size: 64,
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

  const handleFileSelected = async (file: File) => {
    if (!canvas) return;
    try {
      const result = await onUploadImage(file);
      const cx = canvas.getWidth() / 2;
      const cy = canvas.getHeight() / 2;
      const imageData: ImageLayerData = {
        url: result.url,
        originalWidth: result.width,
        originalHeight: result.height,
      };
      const fab = await createFabricImage(result.url, {
        left: cx,
        top: cy,
        originX: 'center',
        originY: 'center',
      });
      // Scale down oversized uploads.
      const maxSize = Math.min(canvas.getWidth(), canvas.getHeight()) * 0.6;
      if ((fab.width ?? 0) > maxSize || (fab.height ?? 0) > maxSize) {
        const s = maxSize / Math.max(fab.width ?? 1, fab.height ?? 1);
        fab.scale(s);
      }
      const layerId = addLayer({
        type: 'image',
        name: 'Image Layer',
        visible: true,
        locked: false,
        opacity: 1,
        left: fab.left ?? cx,
        top: fab.top ?? cy,
        scaleX: fab.scaleX ?? 1,
        scaleY: fab.scaleY ?? 1,
        angle: 0,
        data: imageData as unknown as Record<string, unknown>,
      });
      (fab as unknown as { data: Record<string, unknown> }).data = {
        id: layerId,
        type: 'image',
      };
      canvas.add(fab);
      canvas.setActiveObject(fab);
      canvas.renderAll();
      setSelectedLayers([fab]);
      onLayerAdded?.('image');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Image upload failed:', err);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      void handleFileSelected(file);
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
          onClick={handleAddText}
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
