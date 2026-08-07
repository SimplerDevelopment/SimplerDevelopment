// Server-side print-file renderer.
//
// Rasterises a saved design's layers into a transparent, artwork-only PNG at
// print resolution. Replaces capturing the browser DOM: html2canvas returns an
// empty canvas for this editor's markup, and a print file is not something to
// leave to whatever the browser happened to paint.
//
// Output contract (enforced downstream by validatePrintFile):
//   - PNG with a real alpha channel — artwork only, never the product mockup
//   - long edge >= MIN_PRINT_EDGE_PX
//
// See vault ADR print-file-is-artwork-not-mockup.

import sharp from 'sharp';

/**
 * Canonical design-surface width, in CSS pixels.
 *
 * Layer positions are stored in the surface's layout pixels, which is a screen
 * space rather than a device-independent one — so reproducing them server-side
 * needs the same reference width the editor lays out at. The editor's centre
 * panel fixes this at 600 and derives height from the mockup's aspect ratio.
 *
 * If the editor's layout width ever changes, previously saved designs shift.
 * That fragility is inherent to storing screen-space coordinates and is worth
 * removing at the source one day (store positions normalised to the print area
 * instead); until then this constant is the contract between the two renderers.
 */
export const DESIGN_SURFACE_WIDTH = 600;

export interface PrintLayer {
  id?: string;
  type?: string;
  side?: string;
  text?: string;
  font?: string;
  size?: number;
  color?: string;
  url?: string;
  imageUrl?: string;
  width?: number;
  height?: number;
  rotation?: number;
  position?: { x?: number; y?: number };
}

export interface PrintSide {
  side?: string;
  printableX?: number | null;
  printableY?: number | null;
  printableWidth?: number | null;
  printableHeight?: number | null;
}

export interface MockupSize {
  width: number;
  height: number;
}

export interface RenderResult {
  buffer: Buffer;
  width: number;
  height: number;
  layersRendered: number;
  layersSkipped: number;
}

/** Keep in sync with the upload route's floor. */
export const MIN_PRINT_EDGE_PX = 1500;
/** Ceiling on the rasterised output, so a tiny print area can't ask for a gigapixel canvas. */
export const MAX_OUTPUT_EDGE_PX = 8000;

/**
 * Where a layer actually renders, in surface layout pixels.
 *
 * `.layer` is absolutely positioned with no top/left, so its static position is
 * the one it would occupy in normal flow — which is *below* the full-height
 * mockup <img> that precedes it. react-draggable then applies
 * translate(x, y) from there. Net effect: y is an offset from the BOTTOM of the
 * surface, which is why stored values are routinely negative.
 *
 * Verified against live data: a layer stored at y=-500 on a 901px surface
 * measured at 400px from the top.
 *
 * Pure — exported for unit testing.
 */
export function layerOrigin(
  layer: PrintLayer,
  surfaceHeight: number,
): { x: number; y: number } {
  return {
    x: layer.position?.x ?? 0,
    y: surfaceHeight + (layer.position?.y ?? 0),
  };
}

/**
 * Resolve the print area in surface layout pixels.
 *
 * `product_sides` records bounds against the mockup's own pixel grid, so they
 * must be scaled by the surface/mockup ratio before they mean anything in
 * layout space. Null width/height mean "the whole image".
 *
 * Pure — exported for unit testing.
 */
export function printAreaInSurfaceSpace(
  side: PrintSide | null | undefined,
  mockup: MockupSize,
  surfaceWidth: number = DESIGN_SURFACE_WIDTH,
): { x: number; y: number; width: number; height: number } {
  const scale = mockup.width > 0 ? surfaceWidth / mockup.width : 1;
  const surfaceHeight = Math.round(mockup.height * scale);

  const w = side?.printableWidth ?? null;
  const h = side?.printableHeight ?? null;
  if (!side || !w || !h || w <= 0 || h <= 0) {
    return { x: 0, y: 0, width: surfaceWidth, height: surfaceHeight };
  }

  const x = Math.round((side.printableX ?? 0) * scale);
  const y = Math.round((side.printableY ?? 0) * scale);
  return {
    x: Math.max(0, Math.min(x, surfaceWidth)),
    y: Math.max(0, Math.min(y, surfaceHeight)),
    width: Math.max(1, Math.min(Math.round(w * scale), surfaceWidth - x)),
    height: Math.max(1, Math.min(Math.round(h * scale), surfaceHeight - y)),
  };
}

/**
 * Scale factor taking the print area up to the resolution floor.
 *
 * Bounds OUTPUT pixels, not the multiplier — a small print area legitimately
 * needs a large multiplier, and capping the multiplier silently emits an
 * undersized file that the upload route then rejects.
 *
 * Pure — exported for unit testing.
 */
export function outputScale(
  areaWidth: number,
  areaHeight: number,
  minEdge: number = MIN_PRINT_EDGE_PX,
  maxOutputEdge: number = MAX_OUTPUT_EDGE_PX,
): number {
  const longEdge = Math.max(areaWidth, areaHeight);
  if (longEdge <= 0) return 1;
  return Math.max(1, Math.min(minEdge / longEdge, maxOutputEdge / longEdge));
}

const escapeXml = (s: string): string =>
  s.replace(/[<>&'"]/g, (c) =>
    c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c === "'" ? '&apos;' : '&quot;',
  );

/** Fetch an image layer's bytes and inline them, since librsvg won't fetch for us. */
async function inlineImage(url: string): Promise<string | null> {
  try {
    // Relative media-proxy URLs need an origin to be fetchable server-side.
    const abs = url.startsWith('http')
      ? url
      : `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}${url}`;
    const res = await fetch(abs);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const mime = res.headers.get('content-type') ?? 'image/png';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

/**
 * Render one side's layers to a transparent print-resolution PNG.
 *
 * Layers whose type isn't supported are skipped and counted rather than
 * failing the render — a missing icon should not block an order that also has
 * valid artwork. The caller decides what to do when layersRendered is 0.
 */
export async function renderPrintFile(params: {
  layers: PrintLayer[];
  side: PrintSide | null | undefined;
  mockup: MockupSize;
  minEdge?: number;
  surfaceWidth?: number;
}): Promise<RenderResult> {
  const surfaceWidth = params.surfaceWidth ?? DESIGN_SURFACE_WIDTH;
  const scale = params.mockup.width > 0 ? surfaceWidth / params.mockup.width : 1;
  const surfaceHeight = Math.round(params.mockup.height * scale);

  const area = printAreaInSurfaceSpace(params.side, params.mockup, surfaceWidth);
  const k = outputScale(area.width, area.height, params.minEdge ?? MIN_PRINT_EDGE_PX);

  const outW = Math.max(1, Math.round(area.width * k));
  const outH = Math.max(1, Math.round(area.height * k));

  const parts: string[] = [];
  let rendered = 0;
  let skipped = 0;

  for (const layer of params.layers ?? []) {
    const origin = layerOrigin(layer, surfaceHeight);
    // Into print-area space, then up to output resolution.
    const x = (origin.x - area.x) * k;
    const y = (origin.y - area.y) * k;
    const rot = layer.rotation ?? 0;
    const transform = rot ? ` transform="rotate(${rot} ${x} ${y})"` : '';

    if (layer.type === 'text' && layer.text) {
      const fontSize = (layer.size ?? 24) * k;
      const family = escapeXml(layer.font || 'sans-serif');
      const fill = escapeXml(layer.color || '#000000');
      // dominant-baseline hanging matches the DOM box, whose top edge is the
      // translate origin rather than the text baseline.
      parts.push(
        `<text x="${x}" y="${y}" font-family="${family}" font-size="${fontSize}" ` +
          `fill="${fill}" dominant-baseline="hanging"${transform}>${escapeXml(layer.text)}</text>`,
      );
      rendered++;
      continue;
    }

    const src = layer.url ?? layer.imageUrl;
    if ((layer.type === 'image' || layer.type === 'art') && src) {
      const dataUri = await inlineImage(src);
      if (!dataUri) { skipped++; continue; }
      const w = (layer.width ?? 100) * k;
      const h = (layer.height ?? 100) * k;
      parts.push(
        `<image x="${x}" y="${y}" width="${w}" height="${h}" ` +
          `href="${dataUri}" preserveAspectRatio="xMidYMid meet"${transform}/>`,
      );
      rendered++;
      continue;
    }

    skipped++;
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${outW}" height="${outH}" ` +
    `viewBox="0 0 ${outW} ${outH}">${parts.join('')}</svg>`;

  // Rasterise onto a fully transparent canvas — never a background, never the
  // mockup. An opaque print file is rejected downstream for good reason.
  const buffer = await sharp(Buffer.from(svg), { density: 96 })
    .resize(outW, outH, { fit: 'fill' })
    .png()
    .toBuffer();

  return { buffer, width: outW, height: outH, layersRendered: rendered, layersSkipped: skipped };
}
