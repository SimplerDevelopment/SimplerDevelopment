import type { DesignerSurface, LayerData } from './types';

/**
 * Returns the rotated axis-aligned bounding box of a layer in canvas
 * coordinates. Mirrors what Fabric reports via `getBoundingRect()` but works
 * off the LayerData fields so we don't need a live Fabric instance — useful
 * for the LayersPanel rendering, which sits outside the canvas effects.
 *
 * Rotation is applied around the top-left corner because LayerData uses the
 * default Fabric originX/originY = 'left'/'top'. Width/height fall back to 0
 * when a layer hasn't been measured yet (e.g. brand-new text before the
 * Fabric object has reported back).
 */
export function getLayerBoundingBox(layer: LayerData): {
  left: number;
  top: number;
  right: number;
  bottom: number;
} {
  const w = (layer.width ?? 0) * (layer.scaleX ?? 1);
  const h = (layer.height ?? 0) * (layer.scaleY ?? 1);
  const angle = layer.angle ?? 0;
  if (!angle) {
    return {
      left: layer.left,
      top: layer.top,
      right: layer.left + w,
      bottom: layer.top + h,
    };
  }
  const rad = (angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  // Four corners relative to the top-left pivot.
  const corners = [
    [0, 0],
    [w, 0],
    [0, h],
    [w, h],
  ];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of corners) {
    const rx = x * cos - y * sin + layer.left;
    const ry = x * sin + y * cos + layer.top;
    minX = Math.min(minX, rx);
    minY = Math.min(minY, ry);
    maxX = Math.max(maxX, rx);
    maxY = Math.max(maxY, ry);
  }
  return { left: minX, top: minY, right: maxX, bottom: maxY };
}

export type PrintAreaStatus = 'inside' | 'partial' | 'outside';

/**
 * Classifies how a layer sits relative to the surface's safe print area.
 *
 *   inside  — entire bounding box lies within the print rect
 *   partial — bounding box overlaps the print rect but extends past at least
 *             one edge (will be clipped on the final print)
 *   outside — bounding box does not overlap at all (will not print)
 *
 * Layers with no measured width/height yet are reported as `inside` if their
 * origin is within the print rect — there's nothing to clip yet.
 */
export function classifyLayerPrintArea(
  layer: LayerData,
  surface: Pick<
    DesignerSurface,
    'printAreaX' | 'printAreaY' | 'printAreaWidth' | 'printAreaHeight'
  >
): PrintAreaStatus {
  const bb = getLayerBoundingBox(layer);
  const paLeft = surface.printAreaX;
  const paTop = surface.printAreaY;
  const paRight = surface.printAreaX + surface.printAreaWidth;
  const paBottom = surface.printAreaY + surface.printAreaHeight;

  const overlaps =
    bb.right > paLeft &&
    bb.left < paRight &&
    bb.bottom > paTop &&
    bb.top < paBottom;

  if (!overlaps) return 'outside';

  const fullyInside =
    bb.left >= paLeft &&
    bb.top >= paTop &&
    bb.right <= paRight &&
    bb.bottom <= paBottom;

  return fullyInside ? 'inside' : 'partial';
}

/**
 * Convenience: count how many layers on a surface aren't fully inside the
 * print area. Hidden + locked layers still count — they're still going to
 * end up on the printed product (or get dropped at print time).
 */
export function countLayersOutsidePrintArea(
  layers: LayerData[],
  surface: Pick<
    DesignerSurface,
    'printAreaX' | 'printAreaY' | 'printAreaWidth' | 'printAreaHeight'
  >
): { partial: number; outside: number } {
  let partial = 0;
  let outside = 0;
  for (const layer of layers) {
    if (!layer.visible) continue;
    const status = classifyLayerPrintArea(layer, surface);
    if (status === 'partial') partial += 1;
    else if (status === 'outside') outside += 1;
  }
  return { partial, outside };
}
