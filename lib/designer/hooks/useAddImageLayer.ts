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

  /**
   * Adds an already-uploaded image (caller-supplied URL + dimensions) to
   * the canvas as a new image layer. Used by the AI-image flow which
   * uploads server-side rather than going through the FormData uploader.
   *
   * `extraData` is shallow-merged into the resulting `ImageLayerData` so
   * callers can stamp AI metadata (prompt / style) without forking the
   * scale-and-place plumbing.
   */
  const addFromResult = useCallback(
    async (
      result: UploadedImageResult,
      layerName: string,
      extraData?: Partial<ImageLayerData>,
    ): Promise<string | null> => {
      if (!canvas) return null;
      try {
        const cx = canvas.getWidth() / 2;
        const cy = canvas.getHeight() / 2;
        const imageData: ImageLayerData = {
          url: result.url,
          originalWidth: result.width,
          originalHeight: result.height,
          ...(extraData ?? {}),
        };
        const fab = await createFabricImage(result.url, {
          left: cx,
          top: cy,
          originX: 'center',
          originY: 'center',
        });
        const maxSize = Math.min(canvas.getWidth(), canvas.getHeight()) * 0.6;
        if ((fab.width ?? 0) > maxSize || (fab.height ?? 0) > maxSize) {
          const s = maxSize / Math.max(fab.width ?? 1, fab.height ?? 1);
          fab.scale(s);
        }
        const layerId = addLayer({
          type: 'image',
          name: layerName || 'Image Layer',
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
        return layerId;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Image layer add failed:', err);
        return null;
      }
    },
    [canvas, addLayer, setSelectedLayers],
  );

  const addFromFile = useCallback(
    async (file: File): Promise<void> => {
      if (!canvas) return;
      try {
        const result = await onUploadImage(file);
        await addFromResult(result, file.name || 'Image Layer');
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Image upload failed:', err);
      }
    },
    [canvas, onUploadImage, addFromResult],
  );

  // Backwards-compatible default: callers that treat this hook as
  // `(file) => Promise<void>` still work. The function carries the
  // `addFromResult` escape hatch for code paths that already have an
  // uploaded URL (AI generation, drag-and-drop with a remote URL).
  type AddImageLayerFn = ((file: File) => Promise<void>) & {
    addFromResult: (
      result: UploadedImageResult,
      layerName: string,
      extraData?: Partial<ImageLayerData>,
    ) => Promise<string | null>;
  };
  // Create a fresh wrapper each call so we never mutate the memoized addFromFile ref
  const wrapper = (file: File) => addFromFile(file);
  return Object.assign(wrapper, { addFromResult }) as AddImageLayerFn;
}

export default useAddImageLayer;
