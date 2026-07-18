// @vitest-environment node
/**
 * Unit tests for lib/designer/printAreaCheck.ts
 *
 * Pure geometry logic — no mocks needed, no DB, no framework deps.
 *
 * Covers:
 *   - getLayerBoundingBox: no angle, with angle, missing optional fields
 *   - classifyLayerPrintArea: inside / partial / outside
 *   - countLayersOutsidePrintArea: visible filter, mixed statuses
 *   - computeFixOverflowPosition: inside→null, zero-size→null, outside→center,
 *     partial overflow on each edge
 */
import { describe, it, expect } from 'vitest';
import type { LayerData, DesignerSurface } from '@/lib/designer/types';
import {
  getLayerBoundingBox,
  classifyLayerPrintArea,
  countLayersOutsidePrintArea,
  computeFixOverflowPosition,
} from '@/lib/designer/printAreaCheck';

// ---------------------------------------------------------------------------
// Test fixture builders
// ---------------------------------------------------------------------------

function makeLayer(overrides: Partial<LayerData> = {}): LayerData {
  return {
    id: 'l1',
    type: 'text',
    name: 'Layer 1',
    visible: true,
    locked: false,
    opacity: 1,
    left: 0,
    top: 0,
    width: 100,
    height: 50,
    scaleX: 1,
    scaleY: 1,
    angle: 0,
    data: { text: 'hi', fontFamily: 'sans-serif', fontSize: 14, fontWeight: 400, fill: '#000', textAlign: 'left', lineHeight: 1.2, charSpacing: 0 },
    zIndex: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/** A 200×200 print area starting at (50, 50). */
const surface: Pick<DesignerSurface, 'printAreaX' | 'printAreaY' | 'printAreaWidth' | 'printAreaHeight'> = {
  printAreaX: 50,
  printAreaY: 50,
  printAreaWidth: 200,
  printAreaHeight: 200,
};

// ---------------------------------------------------------------------------
// getLayerBoundingBox
// ---------------------------------------------------------------------------

describe('getLayerBoundingBox', () => {
  it('returns an axis-aligned rect for a zero-angle layer', () => {
    const layer = makeLayer({ left: 10, top: 20, width: 100, height: 50 });
    const bb = getLayerBoundingBox(layer);
    expect(bb).toEqual({ left: 10, top: 20, right: 110, bottom: 70 });
  });

  it('applies scaleX / scaleY', () => {
    const layer = makeLayer({ left: 0, top: 0, width: 100, height: 50, scaleX: 2, scaleY: 3 });
    const bb = getLayerBoundingBox(layer);
    expect(bb).toEqual({ left: 0, top: 0, right: 200, bottom: 150 });
  });

  it('falls back to 0 when width / height are undefined', () => {
    const layer = makeLayer({ left: 5, top: 10, width: undefined, height: undefined });
    const bb = getLayerBoundingBox(layer);
    expect(bb).toEqual({ left: 5, top: 10, right: 5, bottom: 10 });
  });

  it('falls back to 1 when scaleX / scaleY are undefined', () => {
    // makeLayer always sets them, so strip them via spread
    const base = makeLayer({ left: 0, top: 0, width: 40, height: 20 });
    const layer = { ...base, scaleX: undefined as unknown as number, scaleY: undefined as unknown as number };
    const bb = getLayerBoundingBox(layer);
    expect(bb).toEqual({ left: 0, top: 0, right: 40, bottom: 20 });
  });

  it('expands bounding box for a 90-degree rotation', () => {
    // 90° rotation of a 100×50 rect around top-left: corners rotate.
    // The AABB should have width≈50 and height≈100 (approximately).
    const layer = makeLayer({ left: 0, top: 0, width: 100, height: 50, angle: 90 });
    const bb = getLayerBoundingBox(layer);
    expect(bb.right - bb.left).toBeCloseTo(50, 0);
    expect(bb.bottom - bb.top).toBeCloseTo(100, 0);
  });

  it('handles 45-degree rotation: bounding box is larger than unrotated', () => {
    const layer = makeLayer({ left: 0, top: 0, width: 100, height: 100, angle: 45 });
    const bb = getLayerBoundingBox(layer);
    // Diagonal of 100×100 square at 45° ≈ 141
    expect(bb.right - bb.left).toBeGreaterThan(100);
    expect(bb.bottom - bb.top).toBeGreaterThan(100);
  });

  it('falls back to angle=0 when angle is undefined', () => {
    const layer = { ...makeLayer({ left: 10, top: 20, width: 60, height: 30 }), angle: undefined as unknown as number };
    const bb = getLayerBoundingBox(layer);
    expect(bb).toEqual({ left: 10, top: 20, right: 70, bottom: 50 });
  });
});

// ---------------------------------------------------------------------------
// classifyLayerPrintArea
// ---------------------------------------------------------------------------

describe('classifyLayerPrintArea', () => {
  // surface: printArea x:50-250, y:50-250

  it('returns "inside" when layer is fully within print area', () => {
    const layer = makeLayer({ left: 60, top: 60, width: 100, height: 100 });
    expect(classifyLayerPrintArea(layer, surface)).toBe('inside');
  });

  it('returns "outside" when layer is entirely to the left', () => {
    const layer = makeLayer({ left: 0, top: 60, width: 40, height: 40 });
    expect(classifyLayerPrintArea(layer, surface)).toBe('outside');
  });

  it('returns "outside" when layer is entirely to the right', () => {
    const layer = makeLayer({ left: 260, top: 60, width: 40, height: 40 });
    expect(classifyLayerPrintArea(layer, surface)).toBe('outside');
  });

  it('returns "outside" when layer is entirely above', () => {
    const layer = makeLayer({ left: 60, top: 0, width: 40, height: 40 });
    expect(classifyLayerPrintArea(layer, surface)).toBe('outside');
  });

  it('returns "outside" when layer is entirely below', () => {
    const layer = makeLayer({ left: 60, top: 260, width: 40, height: 40 });
    expect(classifyLayerPrintArea(layer, surface)).toBe('outside');
  });

  it('returns "partial" when layer overflows to the right', () => {
    // left=200, width=100 → right=300, PA right=250
    const layer = makeLayer({ left: 200, top: 60, width: 100, height: 40 });
    expect(classifyLayerPrintArea(layer, surface)).toBe('partial');
  });

  it('returns "partial" when layer overflows to the left', () => {
    // left=40, width=50 → right=90 (inside PA right), but left 40 < PA left 50
    const layer = makeLayer({ left: 40, top: 60, width: 50, height: 40 });
    expect(classifyLayerPrintArea(layer, surface)).toBe('partial');
  });

  it('returns "partial" when layer overflows the bottom', () => {
    const layer = makeLayer({ left: 60, top: 220, width: 40, height: 100 });
    expect(classifyLayerPrintArea(layer, surface)).toBe('partial');
  });

  it('returns "inside" when layer exactly touches print area edges', () => {
    const layer = makeLayer({ left: 50, top: 50, width: 200, height: 200 });
    expect(classifyLayerPrintArea(layer, surface)).toBe('inside');
  });
});

// ---------------------------------------------------------------------------
// countLayersOutsidePrintArea
// ---------------------------------------------------------------------------

describe('countLayersOutsidePrintArea', () => {
  it('returns zeros when all layers are inside', () => {
    const layers = [
      makeLayer({ left: 60, top: 60, width: 80, height: 80 }),
      makeLayer({ id: 'l2', left: 80, top: 80, width: 50, height: 50 }),
    ];
    expect(countLayersOutsidePrintArea(layers, surface)).toEqual({ partial: 0, outside: 0 });
  });

  it('counts partial and outside separately', () => {
    const layers = [
      makeLayer({ id: 'l-in', left: 60, top: 60, width: 80, height: 80 }),    // inside
      makeLayer({ id: 'l-part', left: 220, top: 60, width: 80, height: 40 }), // partial (right overflow)
      makeLayer({ id: 'l-out', left: 0, top: 0, width: 30, height: 30 }),     // outside
    ];
    expect(countLayersOutsidePrintArea(layers, surface)).toEqual({ partial: 1, outside: 1 });
  });

  it('skips invisible layers', () => {
    const layers = [
      makeLayer({ id: 'l-hidden', left: 0, top: 0, width: 30, height: 30, visible: false }), // outside but invisible
    ];
    expect(countLayersOutsidePrintArea(layers, surface)).toEqual({ partial: 0, outside: 0 });
  });

  it('counts locked layers that are visible', () => {
    const layers = [
      makeLayer({ id: 'l-locked', left: 0, top: 0, width: 30, height: 30, visible: true, locked: true }),
    ];
    expect(countLayersOutsidePrintArea(layers, surface)).toEqual({ partial: 0, outside: 1 });
  });

  it('returns zeros for empty layer list', () => {
    expect(countLayersOutsidePrintArea([], surface)).toEqual({ partial: 0, outside: 0 });
  });
});

// ---------------------------------------------------------------------------
// computeFixOverflowPosition
// ---------------------------------------------------------------------------

describe('computeFixOverflowPosition', () => {
  it('returns null when layer is already inside', () => {
    const layer = makeLayer({ left: 60, top: 60, width: 80, height: 80 });
    expect(computeFixOverflowPosition(layer, surface)).toBeNull();
  });

  it('returns null when layer has zero width', () => {
    const layer = makeLayer({ left: 0, top: 0, width: 0, height: 50 });
    expect(computeFixOverflowPosition(layer, surface)).toBeNull();
  });

  it('returns null when layer has zero height', () => {
    const layer = makeLayer({ left: 0, top: 0, width: 50, height: 0 });
    expect(computeFixOverflowPosition(layer, surface)).toBeNull();
  });

  it('centers an "outside" layer within the print area', () => {
    // layer is completely outside; surface center = (50+100, 50+100) = (150, 150)
    const layer = makeLayer({ left: 0, top: 0, width: 40, height: 20 });
    const pos = computeFixOverflowPosition(layer, surface);
    expect(pos).not.toBeNull();
    // Center the 40×20 bbox: left = 150 - 20 + (layer.left - bb.left), top = 150 - 10 + ...
    // layer.left == bb.left == 0, so left = 130, top = 140
    expect(pos!.left).toBeCloseTo(130, 5);
    expect(pos!.top).toBeCloseTo(140, 5);
  });

  it('nudges a right-overflow "partial" layer just inside', () => {
    // left=220, width=80 → right=300, PA right=250 → overflow by 50
    const layer = makeLayer({ left: 220, top: 60, width: 80, height: 40 });
    const pos = computeFixOverflowPosition(layer, surface);
    expect(pos).not.toBeNull();
    expect(pos!.left).toBeCloseTo(170, 5); // 220 - 50
    expect(pos!.top).toBeCloseTo(60, 5);   // no vertical overflow
  });

  it('nudges a left-overflow "partial" layer just inside', () => {
    // left=40, width=100 → right=140, left<50 → nudge right by 10
    const layer = makeLayer({ left: 40, top: 60, width: 100, height: 40 });
    const pos = computeFixOverflowPosition(layer, surface);
    expect(pos).not.toBeNull();
    expect(pos!.left).toBeCloseTo(50, 5);
    expect(pos!.top).toBeCloseTo(60, 5);
  });

  it('nudges a top-overflow "partial" layer just inside', () => {
    // top=30, height=60 → bottom=90, top<50 → nudge down by 20
    const layer = makeLayer({ left: 60, top: 30, width: 40, height: 60 });
    const pos = computeFixOverflowPosition(layer, surface);
    expect(pos).not.toBeNull();
    expect(pos!.left).toBeCloseTo(60, 5);
    expect(pos!.top).toBeCloseTo(50, 5);
  });

  it('nudges a bottom-overflow "partial" layer just inside', () => {
    // top=230, height=60 → bottom=290, PA bottom=250 → overflow by 40
    const layer = makeLayer({ left: 60, top: 230, width: 40, height: 60 });
    const pos = computeFixOverflowPosition(layer, surface);
    expect(pos).not.toBeNull();
    expect(pos!.left).toBeCloseTo(60, 5);
    expect(pos!.top).toBeCloseTo(190, 5); // 230 - 40
  });
});
