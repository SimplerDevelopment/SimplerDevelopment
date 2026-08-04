// @vitest-environment node
/**
 * Unit tests for the server-side print-file renderer.
 *
 * The geometry is the part that fails silently: a wrong origin or a wrong print
 * area produces a plausible-looking PNG containing the wrong region, which only
 * shows up on a physical garment. The rasterisation itself is exercised too,
 * since a blank output is exactly the failure this renderer exists to replace.
 */
import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import {
  layerOrigin,
  printAreaInSurfaceSpace,
  outputScale,
  renderPrintFile,
  DESIGN_SURFACE_WIDTH,
  MIN_PRINT_EDGE_PX,
  MAX_OUTPUT_EDGE_PX,
} from '@/lib/printing/renderPrintFile';

// The real mockup used in local verification, and the real bounds recorded for
// its front side.
const MOCKUP = { width: 333, height: 500 };
const FRONT = { side: 'front', printableX: 80, printableY: 80, printableWidth: 173, printableHeight: 310 };

describe('layerOrigin', () => {
  it('treats y as an offset from the bottom of the surface', () => {
    // Verified against live data: a layer stored at y=-500 on a 901px surface
    // rendered 400px from the top. `.layer` is absolute with no top/left, so its
    // static position sits below the full-height mockup image.
    expect(layerOrigin({ position: { x: 300, y: -500 } }, 901)).toEqual({ x: 300, y: 401 });
  });

  it('defaults a missing position to the surface origin corner', () => {
    expect(layerOrigin({}, 901)).toEqual({ x: 0, y: 901 });
  });
});

describe('printAreaInSurfaceSpace', () => {
  it('scales mockup-pixel bounds into surface layout pixels', () => {
    // 333 -> 600 is ~1.802x.
    const area = printAreaInSurfaceSpace(FRONT, MOCKUP);
    expect(area).toEqual({ x: 144, y: 144, width: 312, height: 559 });
  });

  it('falls back to the whole surface when bounds are absent', () => {
    const area = printAreaInSurfaceSpace(null, MOCKUP);
    expect(area).toEqual({ x: 0, y: 0, width: DESIGN_SURFACE_WIDTH, height: 901 });
  });

  it('treats null width/height as "full image" (the schema default)', () => {
    const area = printAreaInSurfaceSpace(
      { printableX: 10, printableY: 10, printableWidth: null, printableHeight: null },
      MOCKUP,
    );
    expect(area.width).toBe(DESIGN_SURFACE_WIDTH);
  });

  it('clamps bounds that would extend past the surface', () => {
    const area = printAreaInSurfaceSpace(
      { printableX: 320, printableY: 480, printableWidth: 200, printableHeight: 200 },
      MOCKUP,
    );
    expect(area.x + area.width).toBeLessThanOrEqual(DESIGN_SURFACE_WIDTH);
    expect(area.y + area.height).toBeLessThanOrEqual(901);
  });
});

describe('outputScale', () => {
  it('lifts a small print area to the resolution floor', () => {
    expect(312 * outputScale(312, 559)).toBeGreaterThanOrEqual(0); // sanity
    expect(559 * outputScale(312, 559)).toBeCloseTo(MIN_PRINT_EDGE_PX, 0);
  });

  it('never downscales an already-large area', () => {
    expect(outputScale(4000, 3000)).toBe(1);
  });

  it('bounds output pixels rather than the multiplier', () => {
    const k = outputScale(10, 10);
    expect(10 * k).toBeGreaterThanOrEqual(MIN_PRINT_EDGE_PX);
    expect(10 * k).toBeLessThanOrEqual(MAX_OUTPUT_EDGE_PX);
  });
});

describe('renderPrintFile', () => {
  it('renders a text layer as visible, non-transparent artwork', async () => {
    const res = await renderPrintFile({
      layers: [
        { type: 'text', text: 'SHIP IT', font: 'sans-serif', size: 60, color: '#ff0000', position: { x: 200, y: -500 }, rotation: 0 },
      ],
      side: FRONT,
      mockup: MOCKUP,
    });

    expect(res.layersRendered).toBe(1);
    expect(res.layersSkipped).toBe(0);

    const meta = await sharp(res.buffer).metadata();
    expect(meta.format).toBe('png');
    expect(meta.hasAlpha).toBe(true);
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeGreaterThanOrEqual(MIN_PRINT_EDGE_PX);

    // The whole point: the file must not be blank. This is the exact assertion
    // the html2canvas path failed — it produced a correctly-sized, fully
    // transparent PNG (alpha mean 0.00).
    const stats = await sharp(res.buffer).stats();
    expect(stats.channels[3].mean).toBeGreaterThan(0);
  });

  it('produces a transparent canvas when there is nothing to draw', async () => {
    const res = await renderPrintFile({ layers: [], side: FRONT, mockup: MOCKUP });
    expect(res.layersRendered).toBe(0);
    const stats = await sharp(res.buffer).stats();
    expect(stats.channels[3].mean).toBe(0);
  });

  it('skips unsupported layers instead of failing the whole render', async () => {
    const res = await renderPrintFile({
      layers: [
        { type: 'text', text: 'KEEP', size: 60, position: { x: 200, y: -500 } },
        { type: 'icon', position: { x: 10, y: -400 } },
      ],
      side: FRONT,
      mockup: MOCKUP,
    });
    expect(res.layersRendered).toBe(1);
    expect(res.layersSkipped).toBe(1);
    const stats = await sharp(res.buffer).stats();
    expect(stats.channels[3].mean).toBeGreaterThan(0);
  });

  it('escapes text that would otherwise break the SVG', async () => {
    const res = await renderPrintFile({
      layers: [{ type: 'text', text: '<Tom & "Jerry">', size: 48, position: { x: 150, y: -500 } }],
      side: FRONT,
      mockup: MOCKUP,
    });
    expect(res.layersRendered).toBe(1);
    const stats = await sharp(res.buffer).stats();
    expect(stats.channels[3].mean).toBeGreaterThan(0);
  });
});
