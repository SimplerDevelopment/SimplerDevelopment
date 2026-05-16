'use client';

import { useCallback } from 'react';

import { useCanvasStore } from '../canvasStore';
import { createFabricImage } from '../layerFactory';
import type { ImageLayerData, UploadedImageResult } from '../types';

interface UseAddImageLayerOptions {
  /**
   * Caller-supplied uploader. The hook hands the file off and trusts the
   * caller to upload to its storage and return a public URL + dimensions.
   */
  onUploadImage: (file: File) => Promise<UploadedImageResult>;
}

/**
 * Encapsulates "add a user image to the canvas as a new layer". Used by both
 * the AddLayerPanel's file picker and the DesignerShell's canvas-drop zone so
 * the upload + scale + addLayer logic stays in one place.
 */
export function useAddImageLayer({ onUploadImage }: UseAddImageLayerOptions) {
  const canvas = useCanvasStore((s) => s.canvas);
  const addLayer = useCanvasStore((s) => s.addLayer);
  const setSelectedLayers = useCanvasStore((s) => s.setSelectedLayers);

  return useCallback(
    async (file: File): Promise<void> => {
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
        // Scale oversized uploads down so they fit comfortably inside the
        // print area without the customer having to resize manually.
        const maxSize = Math.min(canvas.getWidth(), canvas.getHeight()) * 0.6;
        if ((fab.width ?? 0) > maxSize || (fab.height ?? 0) > maxSize) {
          const s = maxSize / Math.max(fab.width ?? 1, fab.height ?? 1);
          fab.scale(s);
        }
        const layerId = addLayer({
          type: 'image',
          name: file.name || 'Image Layer',
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
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Image upload failed:', err);
      }
    },
    [canvas, addLayer, setSelectedLayers, onUploadImage]
  );
}

export default useAddImageLayer;
