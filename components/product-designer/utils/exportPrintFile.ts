'use client';

/**
 * Print-file export for the product designer.
 *
 * The designer renders layers as DOM (divs/imgs with CSS transforms) on top of
 * a product mockup image. A print file must be the ARTWORK ALONE on a
 * transparent background — the mockup must never be captured, because sending
 * a composite to Printful prints a picture of the garment onto the garment.
 * The server rejects opaque uploads for exactly this reason
 * (see validatePrintFile in the print-file route).
 *
 * Capture strategy: html2canvas over the design surface with
 * `backgroundColor: null`, skipping any element tagged `data-print-exclude`
 * (the mockup img), then crop to the side's printable area and upscale so the
 * result clears the server's resolution floor.
 */

/** Keep in sync with MIN_PRINT_EDGE_PX in the print-file route. */
export const MIN_PRINT_EDGE_PX = 1500;

/** Marks DOM that must never appear in a print file (i.e. the product mockup). */
export const PRINT_EXCLUDE_ATTR = 'data-print-exclude';

/**
 * Smallest surface edge we will treat as a real design canvas.
 *
 * The design surface sizes itself from the product mockup image. When that
 * image is missing or hasn't loaded, the container collapses (observed at
 * 600x24) and capturing it yields a sliver that still clears the server's
 * long-edge check — a silently corrupt print file, which is the worst outcome.
 * Better to export nothing and say so.
 */
export const MIN_SURFACE_EDGE_PX = 50;

/** True when the surface is plausibly a real, laid-out design canvas. */
export function isUsableSurface(width: number, height: number): boolean {
  return width >= MIN_SURFACE_EDGE_PX && height >= MIN_SURFACE_EDGE_PX;
}

export interface PrintableBounds {
  printableX?: number | null;
  printableY?: number | null;
  printableWidth?: number | null;
  printableHeight?: number | null;
}

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Resolve the crop rectangle for a side, in the surface's own pixel space.
 *
 * `product_sides` stores the printable area in mockup-image pixels. When a
 * side has no bounds recorded (printableWidth/Height are nullable and mean
 * "full image"), the whole surface is the print area.
 *
 * Pure — exported for unit testing.
 */
export function resolveCropRect(
  surfaceWidth: number,
  surfaceHeight: number,
  bounds: PrintableBounds | null | undefined,
): CropRect {
  const full = { x: 0, y: 0, width: surfaceWidth, height: surfaceHeight };
  if (!bounds) return full;

  const w = bounds.printableWidth ?? null;
  const h = bounds.printableHeight ?? null;
  if (!w || !h || w <= 0 || h <= 0) return full;

  // Clamp into the surface so a mis-recorded bound can't produce a crop that
  // extends past the canvas (html2canvas would pad it with transparent px and
  // silently shrink the effective artwork resolution).
  const x = Math.max(0, Math.min(bounds.printableX ?? 0, surfaceWidth));
  const y = Math.max(0, Math.min(bounds.printableY ?? 0, surfaceHeight));
  return {
    x,
    y,
    width: Math.max(1, Math.min(w, surfaceWidth - x)),
    height: Math.max(1, Math.min(h, surfaceHeight - y)),
  };
}

/**
 * Largest long-edge we will ask the browser to rasterise. Browsers cap canvas
 * area (Safari is the tightest), so the ceiling is on OUTPUT pixels — capping
 * the scale multiplier instead is the wrong quantity: a 120px crop legitimately
 * needs 12.5x to clear a 1500px floor, and a multiplier cap silently emits an
 * undersized file that the server then rejects.
 */
export const MAX_OUTPUT_EDGE_PX = 8000;

/**
 * Scale factor needed for the cropped region's long edge to reach `minEdge`.
 *
 * Never returns below 1 — downscaling artwork to hit a floor would be
 * self-defeating.
 *
 * Pure — exported for unit testing.
 */
export function resolveExportScale(
  cropWidth: number,
  cropHeight: number,
  minEdge: number = MIN_PRINT_EDGE_PX,
  maxOutputEdge: number = MAX_OUTPUT_EDGE_PX,
): number {
  const longEdge = Math.max(cropWidth, cropHeight);
  if (longEdge <= 0) return 1;

  const needed = minEdge / longEdge;
  const allowed = maxOutputEdge / longEdge;
  return Math.max(1, Math.min(needed, allowed));
}

/**
 * Render the design surface to a transparent, print-resolution PNG data URL.
 *
 * Returns null when the surface isn't mounted or has no size yet.
 */
export async function exportPrintFile(
  surface: HTMLElement | null,
  bounds?: PrintableBounds | null,
  minEdge: number = MIN_PRINT_EDGE_PX,
): Promise<string | null> {
  if (!surface) return null;

  const surfaceWidth = surface.offsetWidth;
  const surfaceHeight = surface.offsetHeight;
  if (!isUsableSurface(surfaceWidth, surfaceHeight)) return null;

  const crop = resolveCropRect(surfaceWidth, surfaceHeight, bounds);
  const scale = resolveExportScale(crop.width, crop.height, minEdge);

  // Loaded lazily — html2canvas is heavy and only needed when exporting.
  const html2canvas = (await import('html2canvas')).default;

  const canvas = await html2canvas(surface, {
    // The whole point: no background, so the export carries real alpha.
    backgroundColor: null,
    // Never capture the product mockup — that is what turns a print file into
    // a mockup and gets the upload rejected server-side.
    ignoreElements: (el) => el.hasAttribute?.(PRINT_EXCLUDE_ATTR),
    scale,
    x: crop.x,
    y: crop.y,
    width: crop.width,
    height: crop.height,
    useCORS: true,
    logging: false,
  });

  return canvas.toDataURL('image/png');
}

/**
 * Export + upload the print-ready file for one side of a saved design.
 *
 * Every save path must call this: checkout copies printFiles onto the order
 * item and pod.ts refuses to submit an order without one, so a design saved
 * without a print file cannot be fulfilled.
 *
 * Never throws. The design itself is already saved by the time this runs, and
 * losing the customer's work because a raster step failed would be worse than
 * shipping without the file. Returns a user-facing message on failure, or null
 * on success (and when there is nothing to do), so the caller can surface it.
 *
 * Lives here rather than inside ProductDesigner because there are three save
 * paths and they drifted apart once already.
 */
export async function uploadPrintFileForSide(
  designId: number | null | undefined,
  side: (PrintableBounds & { side?: string }) | null | undefined,
  upload: (id: number, side: string, dataUrl: string) => Promise<unknown>,
): Promise<string | null> {
  if (!designId) return null;
  try {
    const surface = document.querySelector<HTMLElement>('#productEditorMainView .mainView');
    const dataUrl = await exportPrintFile(surface, side ?? null);
    if (!dataUrl) {
      return 'Design saved, but no print file could be rendered — it cannot be ordered yet.';
    }
    await upload(designId, side?.side ?? 'front', dataUrl);
    return null;
  } catch (err) {
    console.error('Print-file export failed:', err);
    return `Design saved, but the print file failed: ${
      err instanceof Error ? err.message : 'unknown error'
    }`;
  }
}
