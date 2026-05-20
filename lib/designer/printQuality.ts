/**
 * Estimates whether a raster image layer has enough source resolution to
 * print well at our standard 3× export multiplier (matches ExportButton's
 * `print-ready` mode). A customer who drops a 200×200 photo into a 1000×1000
 * print area is going to be unhappy when the printed shirt looks fuzzy — we
 * want to surface that *before* checkout, not after.
 *
 * The metric is a single "detail ratio" — source pixels per export pixel:
 *   detailRatio = naturalWidth / (displayWidth * 3)
 *
 *   ≥ 1.0  → great  (≥1 source pixel per export pixel)
 *   0.5–1  → okay   (some upscaling, acceptable)
 *   < 0.5  → poor   (≥2× upscale, will look blurry)
 *
 * We compute against width only; for typical apparel art the aspect ratio is
 * preserved end-to-end so width and height degrade together.
 */
export type PrintQualityLevel = 'great' | 'okay' | 'poor';

const PRINT_EXPORT_MULTIPLIER = 3;

export interface PrintQualityInput {
  /** Natural / source image width in pixels (e.g. ImageLayerData.originalWidth). */
  naturalWidth?: number | null;
  /** LayerData.width — the canvas-pixel width of the layer at scaleX=1. */
  layerWidth?: number | null;
  /** LayerData.scaleX — the current uniform-x scale factor. */
  scaleX?: number | null;
}

export interface PrintQualityResult {
  level: PrintQualityLevel;
  /** Source pixels available per export pixel. */
  detailRatio: number;
  /** Human-readable upscale factor as a multiplier (e.g. 2.3 → "2.3×"). */
  upscaleFactor: number;
  /** One-line summary suitable for a tooltip or banner. */
  reason: string;
}

export function assessPrintQuality(
  input: PrintQualityInput,
): PrintQualityResult | null {
  const naturalWidth = Number(input.naturalWidth);
  const layerWidth = Number(input.layerWidth);
  const scaleX = Number.isFinite(Number(input.scaleX)) ? Number(input.scaleX) : 1;
  if (!Number.isFinite(naturalWidth) || naturalWidth <= 0) return null;
  if (!Number.isFinite(layerWidth) || layerWidth <= 0) return null;

  const displayWidth = Math.max(1, layerWidth * Math.max(0.01, scaleX));
  const exportPixels = displayWidth * PRINT_EXPORT_MULTIPLIER;
  const detailRatio = naturalWidth / exportPixels;
  const upscaleFactor = 1 / Math.max(0.001, detailRatio);

  if (detailRatio >= 1) {
    return {
      level: 'great',
      detailRatio,
      upscaleFactor,
      reason:
        'Plenty of source resolution for a sharp print at this size — no upscaling needed.',
    };
  }
  if (detailRatio >= 0.5) {
    return {
      level: 'okay',
      detailRatio,
      upscaleFactor,
      reason: `Print is being stretched ${upscaleFactor.toFixed(1)}× past the source — still usable but softer than the original.`,
    };
  }
  return {
    level: 'poor',
    detailRatio,
    upscaleFactor,
    reason: `Print is being stretched ${upscaleFactor.toFixed(1)}× past the source — the printed image will look blurry. Shrink this layer or use a higher-resolution source.`,
  };
}
