// @vitest-environment node
/**
 * Unit tests for the print-file export geometry.
 *
 * resolveCropRect / resolveExportScale decide how much of the design surface
 * is captured and at what resolution. Both are pure, and both fail silently if
 * wrong — a bad crop ships artwork with the wrong margins, a bad scale ships a
 * file the server rejects (or that prints soft). The html2canvas call itself
 * needs a DOM and is left to e2e.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveCropRect,
  resolveExportScale,
  isUsableSurface,
  MIN_PRINT_EDGE_PX,
  MAX_OUTPUT_EDGE_PX,
  MIN_SURFACE_EDGE_PX,
} from '@/components/product-designer/utils/exportPrintFile';

describe('isUsableSurface', () => {
  it('accepts a normally laid-out canvas', () => {
    expect(isUsableSurface(600, 600)).toBe(true);
  });

  it('rejects the collapsed surface seen when the mockup image is missing', () => {
    // Observed live: the design surface sizes itself from the mockup image, and
    // with an empty src it collapsed to 600x24. Capturing that yields a sliver
    // whose long edge still passes the server's check — a silently corrupt
    // print file, which is worse than exporting nothing.
    expect(isUsableSurface(600, 24)).toBe(false);
  });

  it('rejects a zero-size surface', () => {
    expect(isUsableSurface(0, 0)).toBe(false);
  });

  it('accepts exactly at the threshold', () => {
    expect(isUsableSurface(MIN_SURFACE_EDGE_PX, MIN_SURFACE_EDGE_PX)).toBe(true);
  });
});

describe('resolveCropRect', () => {
  it('falls back to the whole surface when no bounds are recorded', () => {
    expect(resolveCropRect(800, 600, null)).toEqual({ x: 0, y: 0, width: 800, height: 600 });
  });

  it('treats null width/height as "full image" (the schema default)', () => {
    // product_sides.printableWidth/Height are nullable and documented as
    // "null = full image".
    const rect = resolveCropRect(800, 600, {
      printableX: 10,
      printableY: 20,
      printableWidth: null,
      printableHeight: null,
    });
    expect(rect).toEqual({ x: 0, y: 0, width: 800, height: 600 });
  });

  it('uses recorded printable bounds', () => {
    const rect = resolveCropRect(800, 600, {
      printableX: 100,
      printableY: 50,
      printableWidth: 300,
      printableHeight: 400,
    });
    expect(rect).toEqual({ x: 100, y: 50, width: 300, height: 400 });
  });

  it('clamps bounds that overflow the surface', () => {
    // A mis-recorded bound must not produce a crop extending past the canvas —
    // html2canvas would pad with transparent pixels and quietly reduce the
    // effective artwork resolution.
    const rect = resolveCropRect(800, 600, {
      printableX: 700,
      printableY: 500,
      printableWidth: 400,
      printableHeight: 400,
    });
    expect(rect.x).toBe(700);
    expect(rect.y).toBe(500);
    expect(rect.x + rect.width).toBeLessThanOrEqual(800);
    expect(rect.y + rect.height).toBeLessThanOrEqual(600);
  });

  it('ignores zero or negative bounds', () => {
    expect(resolveCropRect(800, 600, { printableWidth: 0, printableHeight: 0 }))
      .toEqual({ x: 0, y: 0, width: 800, height: 600 });
    expect(resolveCropRect(800, 600, { printableWidth: -5, printableHeight: -5 }))
      .toEqual({ x: 0, y: 0, width: 800, height: 600 });
  });
});

describe('resolveExportScale', () => {
  it('scales a small crop up to the resolution floor', () => {
    const scale = resolveExportScale(500, 400, MIN_PRINT_EDGE_PX);
    expect(scale).toBeCloseTo(MIN_PRINT_EDGE_PX / 500);
    expect(500 * scale).toBeCloseTo(MIN_PRINT_EDGE_PX);
  });

  it('never downscales artwork that is already large enough', () => {
    // Long edge already exceeds the floor — scaling below 1 would throw away
    // resolution to hit a minimum, which is self-defeating.
    expect(resolveExportScale(4000, 3000, MIN_PRINT_EDGE_PX)).toBe(1);
  });

  it('caps on output pixels, not on the multiplier', () => {
    // A large multiplier is fine when the crop is small — what must stay
    // bounded is the rasterised canvas, since browsers cap canvas area.
    const scale = resolveExportScale(10, 10, MIN_PRINT_EDGE_PX);
    expect(10 * scale).toBeLessThanOrEqual(MAX_OUTPUT_EDGE_PX);
    expect(10 * scale).toBeGreaterThanOrEqual(MIN_PRINT_EDGE_PX);
  });

  it('never exceeds the output ceiling even when the floor is set absurdly high', () => {
    const scale = resolveExportScale(1000, 800, 50_000);
    expect(1000 * scale).toBeLessThanOrEqual(MAX_OUTPUT_EDGE_PX);
  });

  it('keys off the long edge, not the short one', () => {
    const scale = resolveExportScale(300, 1500, MIN_PRINT_EDGE_PX);
    expect(scale).toBe(1);
  });

  it('is safe on a zero-size surface', () => {
    expect(resolveExportScale(0, 0)).toBe(1);
  });

  it('produces an export that clears the server floor', () => {
    // The contract that actually matters: whatever the crop size, the exported
    // long edge must satisfy validatePrintFile's MIN_PRINT_EDGE_PX check.
    // 120x90 is the case that caught the original multiplier-cap bug: it needs
    // 12.5x to reach 1500px, which a 12x cap silently truncated to 1440px.
    for (const [w, h] of [[500, 400], [120, 90], [10, 10], [1600, 1200], [800, 800]]) {
      const scale = resolveExportScale(w, h, MIN_PRINT_EDGE_PX);
      expect(Math.max(w, h) * scale).toBeGreaterThanOrEqual(MIN_PRINT_EDGE_PX);
    }
  });
});
