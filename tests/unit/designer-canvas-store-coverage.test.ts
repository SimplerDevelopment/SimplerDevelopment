// @vitest-environment jsdom
/**
 * Supplemental unit tests for `lib/designer/canvasStore.ts`.
 *
 * These tests target the uncovered canvas-backed code paths (the `if (canvas)`
 * branches), undo/redo edge cases, and misc selectors not exercised by the
 * primary test file.  All canvas interactions are satisfied by a lightweight
 * fake canvas that implements only the surface the store touches.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks (must precede store import) ────────────────────────────────────────

let uuidCounter = 0;
vi.mock('uuid', () => ({
  v4: () => `cov-uuid-${++uuidCounter}`,
}));

vi.mock('fabric', () => ({
  Point: class Point {
    x: number;
    y: number;
    constructor(x: number, y: number) {
      this.x = x;
      this.y = y;
    }
  },
}));

// ── Import store after mocks ─────────────────────────────────────────────────

import { useCanvasStore, findLayerAcrossSurfaces } from '@/lib/designer/canvasStore';
import type { DesignerSurface, LayerData } from '@/lib/designer/types';
import type { Canvas, FabricObject } from 'fabric';

// ── Fake canvas factory ───────────────────────────────────────────────────────

/**
 * Creates a minimal fake Fabric canvas.  Only the methods the store actually
 * calls are implemented; everything else is left absent so a missing call
 * throws rather than silently passing.
 */
function makeFakeCanvas(objects: FakeFabricObject[] = []): FakeCanvas {
  return {
    _objects: objects,
    getObjects: vi.fn(() => objects),
    getWidth: vi.fn(() => 800),
    getHeight: vi.fn(() => 600),
    remove: vi.fn((obj: FakeFabricObject) => {
      const idx = objects.indexOf(obj);
      if (idx !== -1) objects.splice(idx, 1);
    }),
    renderAll: vi.fn(),
    requestRenderAll: vi.fn(),
    discardActiveObject: vi.fn(),
    setActiveObject: vi.fn(),
    zoomToPoint: vi.fn(),
    absolutePan: vi.fn(),
    relativePan: vi.fn(),
    setZoom: vi.fn(),
    setViewportTransform: vi.fn(),
    moveObjectTo: vi.fn(),
    viewportTransform: [1, 0, 0, 1, 0, 0] as number[],
    constructor: {},
  };
}

interface FakeFabricObject {
  data?: { id?: string };
  id?: string;
  visible?: boolean;
  selectable?: boolean;
  evented?: boolean;
  getBoundingRect?: () => { left: number; top: number; width: number; height: number };
  _designerPrintArea?: boolean;
  _designerGuide?: boolean;
  excludeFromExport?: boolean;
}

interface FakeCanvas {
  _objects: FakeFabricObject[];
  getObjects: ReturnType<typeof vi.fn>;
  getWidth: ReturnType<typeof vi.fn>;
  getHeight: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  renderAll: ReturnType<typeof vi.fn>;
  requestRenderAll: ReturnType<typeof vi.fn>;
  discardActiveObject: ReturnType<typeof vi.fn>;
  setActiveObject: ReturnType<typeof vi.fn>;
  zoomToPoint: ReturnType<typeof vi.fn>;
  absolutePan: ReturnType<typeof vi.fn>;
  relativePan: ReturnType<typeof vi.fn>;
  setZoom: ReturnType<typeof vi.fn>;
  setViewportTransform: ReturnType<typeof vi.fn>;
  moveObjectTo: ReturnType<typeof vi.fn>;
  viewportTransform: number[];
  constructor: Record<string, unknown>;
}

// ── Store reset ───────────────────────────────────────────────────────────────

function resetStore() {
  useCanvasStore.setState({
    canvas: null,
    designId: null,
    designName: 'Untitled Design',
    productId: null,
    status: 'draft',
    canvasSize: { width: 800, height: 600, dpi: 72 },
    surfaces: [],
    activeSurface: '',
    layersBySurface: {},
    layers: [],
    selectedLayers: [],
    activeLayerId: null,
    layerSelection: {
      selectedLayerIds: [],
      selectionMode: 'single',
      lastSelectedId: null,
      canBatchEdit: false,
      batchEditableProperties: [],
    },
    clipboardLayers: [],
    isDirty: false,
    lastSaved: null,
    isLoading: false,
    history: [],
    historyIndex: -1,
    zoom: 0.64,
    panX: 0,
    panY: 0,
    hasManuallyPanned: false,
    showPrintArea: true,
    showGrid: false,
    mockupTint: null,
    brandColors: [],
    brandLogoUrl: '',
    brandFonts: {},
  });
  uuidCounter = 0;
}

function seedSurface(slug = 'front') {
  const surface: DesignerSurface = {
    id: 1,
    slug,
    name: 'Front',
    mockupImage: '/img.png',
    canvasWidth: 400,
    canvasHeight: 400,
    printAreaX: 50,
    printAreaY: 50,
    printAreaWidth: 300,
    printAreaHeight: 300,
    printDpi: 72,
    displayOrder: 0,
  };
  useCanvasStore.getState().setSurfaces([surface]);
}

function makeLayerInput(overrides: Partial<LayerData> = {}) {
  return {
    type: 'text' as const,
    name: 'Test Layer',
    visible: true,
    locked: false,
    opacity: 1,
    left: 0,
    top: 0,
    scaleX: 1,
    scaleY: 1,
    angle: 0,
    data: { text: 'hello' },
    ...overrides,
  };
}

beforeEach(() => {
  resetStore();
});

// ── setZoom with canvas ───────────────────────────────────────────────────────

describe('setZoom with canvas', () => {
  it('calls canvas.zoomToPoint and renderAll when canvas is set', () => {
    const fc = makeFakeCanvas();
    useCanvasStore.getState().setCanvas(fc as unknown as Canvas);
    useCanvasStore.getState().setZoom(2);
    expect(fc.zoomToPoint).toHaveBeenCalledOnce();
    expect(fc.renderAll).toHaveBeenCalled();
    expect(useCanvasStore.getState().zoom).toBe(2);
  });

  it('clamps and still calls canvas when value is out of range', () => {
    const fc = makeFakeCanvas();
    useCanvasStore.getState().setCanvas(fc as unknown as Canvas);
    useCanvasStore.getState().setZoom(99);
    expect(useCanvasStore.getState().zoom).toBe(5);
    expect(fc.zoomToPoint).toHaveBeenCalledOnce();
  });
});

// ── setPan with canvas ────────────────────────────────────────────────────────

describe('setPan with canvas', () => {
  it('calls canvas.relativePan and renderAll', () => {
    const fc = makeFakeCanvas();
    useCanvasStore.getState().setCanvas(fc as unknown as Canvas);
    useCanvasStore.getState().setPan(30, -20);
    expect(fc.relativePan).toHaveBeenCalledOnce();
    expect(fc.renderAll).toHaveBeenCalled();
    const s = useCanvasStore.getState();
    expect(s.panX).toBe(30);
    expect(s.panY).toBe(-20);
    expect(s.hasManuallyPanned).toBe(true);
  });
});

// ── resetView with canvas ─────────────────────────────────────────────────────

describe('resetView with canvas', () => {
  it('calls canvas.zoomToPoint and absolutePan', () => {
    const fc = makeFakeCanvas();
    useCanvasStore.getState().setCanvas(fc as unknown as Canvas);
    useCanvasStore.getState().setZoom(3);
    useCanvasStore.getState().resetView();
    expect(fc.zoomToPoint).toHaveBeenCalled();
    expect(fc.absolutePan).toHaveBeenCalled();
    expect(fc.renderAll).toHaveBeenCalled();
    const s = useCanvasStore.getState();
    expect(s.zoom).toBe(0.64);
    expect(s.panX).toBe(0);
    expect(s.hasManuallyPanned).toBe(false);
  });
});

// ── zoomToFit ─────────────────────────────────────────────────────────────────

describe('zoomToFit', () => {
  it('is a no-op when canvas is null', () => {
    // canvas is null — just verify it does not throw
    expect(() => useCanvasStore.getState().zoomToFit()).not.toThrow();
  });

  it('calls resetView when canvas has no objects', () => {
    const fc = makeFakeCanvas([]); // empty
    useCanvasStore.getState().setCanvas(fc as unknown as Canvas);
    useCanvasStore.getState().setZoom(2);
    useCanvasStore.getState().zoomToFit();
    // resetView should have restored initial zoom
    expect(useCanvasStore.getState().zoom).toBe(0.64);
  });

  it('fits to bounding rect of all objects when canvas has objects', () => {
    const obj: FakeFabricObject = {
      data: { id: 'obj1' },
      getBoundingRect: () => ({ left: 100, top: 100, width: 200, height: 150 }),
    };
    const fc = makeFakeCanvas([obj]);
    useCanvasStore.getState().setCanvas(fc as unknown as Canvas);
    useCanvasStore.getState().zoomToFit();
    expect(fc.setZoom).toHaveBeenCalledOnce();
    expect(fc.absolutePan).toHaveBeenCalledOnce();
    expect(fc.renderAll).toHaveBeenCalled();
    // zoom should be updated in the store
    expect(useCanvasStore.getState().zoom).toBeGreaterThan(0);
  });

  it('computes correct fit zoom for multiple objects', () => {
    const objs: FakeFabricObject[] = [
      { getBoundingRect: () => ({ left: 0, top: 0, width: 100, height: 50 }) },
      { getBoundingRect: () => ({ left: 200, top: 100, width: 100, height: 50 }) },
    ];
    const fc = makeFakeCanvas(objs);
    useCanvasStore.getState().setCanvas(fc as unknown as Canvas);
    useCanvasStore.getState().zoomToFit();
    const z = useCanvasStore.getState().zoom;
    // contentW=300, contentH=150; canvas 800x600; padding 50
    // fitZ = min((800-100)/300, (600-100)/150, 5) = min(2.33, 3.33, 5) = 2.33
    expect(z).toBeCloseTo(2.333, 1);
  });
});

// ── panUp / panDown / panLeft / panRight ──────────────────────────────────────

describe('pan direction helpers with canvas', () => {
  it('panUp increments vpt[5] and sets hasManuallyPanned', () => {
    const fc = makeFakeCanvas();
    fc.viewportTransform = [1, 0, 0, 1, 0, 0];
    useCanvasStore.getState().setCanvas(fc as unknown as Canvas);
    useCanvasStore.getState().panUp(30);
    expect(fc.viewportTransform[5]).toBe(30);
    expect(fc.setViewportTransform).toHaveBeenCalledOnce();
    expect(fc.renderAll).toHaveBeenCalled();
    expect(useCanvasStore.getState().hasManuallyPanned).toBe(true);
  });

  it('panUp uses default distance of 50', () => {
    const fc = makeFakeCanvas();
    fc.viewportTransform = [1, 0, 0, 1, 0, 0];
    useCanvasStore.getState().setCanvas(fc as unknown as Canvas);
    useCanvasStore.getState().panUp();
    expect(fc.viewportTransform[5]).toBe(50);
  });

  it('panDown decrements vpt[5]', () => {
    const fc = makeFakeCanvas();
    fc.viewportTransform = [1, 0, 0, 1, 0, 10];
    useCanvasStore.getState().setCanvas(fc as unknown as Canvas);
    useCanvasStore.getState().panDown(10);
    expect(fc.viewportTransform[5]).toBe(0);
    expect(useCanvasStore.getState().hasManuallyPanned).toBe(true);
  });

  it('panLeft increments vpt[4]', () => {
    const fc = makeFakeCanvas();
    fc.viewportTransform = [1, 0, 0, 1, 0, 0];
    useCanvasStore.getState().setCanvas(fc as unknown as Canvas);
    useCanvasStore.getState().panLeft(20);
    expect(fc.viewportTransform[4]).toBe(20);
    expect(useCanvasStore.getState().hasManuallyPanned).toBe(true);
  });

  it('panRight decrements vpt[4]', () => {
    const fc = makeFakeCanvas();
    fc.viewportTransform = [1, 0, 0, 1, 10, 0];
    useCanvasStore.getState().setCanvas(fc as unknown as Canvas);
    useCanvasStore.getState().panRight(10);
    expect(fc.viewportTransform[4]).toBe(0);
    expect(useCanvasStore.getState().hasManuallyPanned).toBe(true);
  });

  it('panUp is a no-op when canvas is null', () => {
    // canvas is null — just verify it doesn't throw
    expect(() => useCanvasStore.getState().panUp()).not.toThrow();
    expect(useCanvasStore.getState().hasManuallyPanned).toBe(false);
  });

  it('panDown is a no-op when canvas is null', () => {
    expect(() => useCanvasStore.getState().panDown()).not.toThrow();
  });

  it('panLeft is a no-op when canvas is null', () => {
    expect(() => useCanvasStore.getState().panLeft()).not.toThrow();
  });

  it('panRight is a no-op when canvas is null', () => {
    expect(() => useCanvasStore.getState().panRight()).not.toThrow();
  });

  it('pan helpers skip transform when viewportTransform is null', () => {
    const fc = makeFakeCanvas();
    // @ts-expect-error — testing null-vpt guard
    fc.viewportTransform = null;
    useCanvasStore.getState().setCanvas(fc as unknown as Canvas);
    expect(() => useCanvasStore.getState().panUp()).not.toThrow();
    expect(fc.setViewportTransform).not.toHaveBeenCalled();
  });
});

// ── removeLayer with canvas ───────────────────────────────────────────────────

describe('removeLayer with canvas', () => {
  it('removes the matching fabric object and calls renderAll', () => {
    seedSurface();
    const id = useCanvasStore.getState().addLayer(makeLayerInput());
    const fabricObj: FakeFabricObject = { data: { id } };
    const fc = makeFakeCanvas([fabricObj]);
    useCanvasStore.getState().setCanvas(fc as unknown as Canvas);
    useCanvasStore.getState().removeLayer(id);
    expect(fc.remove).toHaveBeenCalledWith(fabricObj);
    expect(fc.renderAll).toHaveBeenCalled();
    expect(useCanvasStore.getState().layers).toHaveLength(0);
  });

  it('matches object by top-level id when data.id is absent', () => {
    seedSurface();
    const id = useCanvasStore.getState().addLayer(makeLayerInput());
    const fabricObj: FakeFabricObject = { id };
    const fc = makeFakeCanvas([fabricObj]);
    useCanvasStore.getState().setCanvas(fc as unknown as Canvas);
    useCanvasStore.getState().removeLayer(id);
    expect(fc.remove).toHaveBeenCalledWith(fabricObj);
  });

  it('does not call canvas.remove when no matching object is found', () => {
    seedSurface();
    const id = useCanvasStore.getState().addLayer(makeLayerInput());
    // Canvas has an object with a *different* id
    const fabricObj: FakeFabricObject = { data: { id: 'unrelated' } };
    const fc = makeFakeCanvas([fabricObj]);
    useCanvasStore.getState().setCanvas(fc as unknown as Canvas);
    useCanvasStore.getState().removeLayer(id);
    expect(fc.remove).not.toHaveBeenCalled();
    // Layer still removed from store
    expect(useCanvasStore.getState().layers).toHaveLength(0);
  });
});

// ── clearLayers with canvas ───────────────────────────────────────────────────

describe('clearLayers with canvas', () => {
  it('removes user-content objects but skips protected ones', () => {
    seedSurface();
    useCanvasStore.getState().addLayer(makeLayerInput({ name: 'User' }));

    const userObj: FakeFabricObject = { data: { id: 'cov-uuid-1' } };
    const bgObj: FakeFabricObject = { id: 'designer-canvas-background' };
    const printAreaObj: FakeFabricObject = { _designerPrintArea: true };
    const guideObj: FakeFabricObject = { _designerGuide: true };
    const excludedObj: FakeFabricObject = { excludeFromExport: true };

    const fc = makeFakeCanvas([userObj, bgObj, printAreaObj, guideObj, excludedObj]);
    useCanvasStore.getState().setCanvas(fc as unknown as Canvas);

    useCanvasStore.getState().clearLayers();

    expect(fc.remove).toHaveBeenCalledWith(userObj);
    expect(fc.remove).not.toHaveBeenCalledWith(bgObj);
    expect(fc.remove).not.toHaveBeenCalledWith(printAreaObj);
    expect(fc.remove).not.toHaveBeenCalledWith(guideObj);
    expect(fc.remove).not.toHaveBeenCalledWith(excludedObj);
    expect(fc.discardActiveObject).toHaveBeenCalledOnce();
    expect(fc.requestRenderAll).toHaveBeenCalledOnce();
  });

  it('skips objects without a data.id (non-user content)', () => {
    seedSurface();
    const noIdObj: FakeFabricObject = { data: {} };
    const fc = makeFakeCanvas([noIdObj]);
    useCanvasStore.getState().setCanvas(fc as unknown as Canvas);
    useCanvasStore.getState().clearLayers();
    expect(fc.remove).not.toHaveBeenCalled();
  });
});

// ── setLayerVisible with canvas ───────────────────────────────────────────────

describe('setLayerVisible with canvas', () => {
  it('updates obj.visible on the fabric object and calls renderAll', () => {
    seedSurface();
    const id = useCanvasStore.getState().addLayer(makeLayerInput({ visible: true }));
    const fabricObj: FakeFabricObject = { data: { id }, visible: true };
    const fc = makeFakeCanvas([fabricObj]);
    useCanvasStore.getState().setCanvas(fc as unknown as Canvas);
    useCanvasStore.getState().setLayerVisible(id, false);
    expect(fabricObj.visible).toBe(false);
    expect(fc.renderAll).toHaveBeenCalled();
  });

  it('does not throw when no matching object is in the canvas', () => {
    seedSurface();
    const id = useCanvasStore.getState().addLayer(makeLayerInput());
    const fc = makeFakeCanvas([{ data: { id: 'other' } }]);
    useCanvasStore.getState().setCanvas(fc as unknown as Canvas);
    expect(() => useCanvasStore.getState().setLayerVisible(id, false)).not.toThrow();
  });
});

// ── setLayerLocked with canvas ────────────────────────────────────────────────

describe('setLayerLocked with canvas', () => {
  it('sets obj.selectable and obj.evented to !locked and calls renderAll', () => {
    seedSurface();
    const id = useCanvasStore.getState().addLayer(makeLayerInput({ locked: false }));
    const fabricObj: FakeFabricObject = { data: { id }, selectable: true, evented: true };
    const fc = makeFakeCanvas([fabricObj]);
    useCanvasStore.getState().setCanvas(fc as unknown as Canvas);
    useCanvasStore.getState().setLayerLocked(id, true);
    expect(fabricObj.selectable).toBe(false);
    expect(fabricObj.evented).toBe(false);
    expect(fc.renderAll).toHaveBeenCalled();
  });

  it('unlocks: sets selectable and evented to true', () => {
    seedSurface();
    const id = useCanvasStore.getState().addLayer(makeLayerInput({ locked: true }));
    const fabricObj: FakeFabricObject = { data: { id }, selectable: false, evented: false };
    const fc = makeFakeCanvas([fabricObj]);
    useCanvasStore.getState().setCanvas(fc as unknown as Canvas);
    useCanvasStore.getState().setLayerLocked(id, false);
    expect(fabricObj.selectable).toBe(true);
    expect(fabricObj.evented).toBe(true);
  });
});

// ── reorderLayers with canvas ─────────────────────────────────────────────────

describe('reorderLayers with canvas', () => {
  it('calls canvas.moveObjectTo for each object and renderAll', () => {
    seedSurface();
    const id1 = useCanvasStore.getState().addLayer(makeLayerInput({ name: 'A' }));
    const id2 = useCanvasStore.getState().addLayer(makeLayerInput({ name: 'B' }));
    const obj1: FakeFabricObject = { data: { id: id1 } };
    const obj2: FakeFabricObject = { data: { id: id2 } };
    const fc = makeFakeCanvas([obj1, obj2]);
    useCanvasStore.getState().setCanvas(fc as unknown as Canvas);
    useCanvasStore.getState().reorderLayers([id2, id1]);
    expect(fc.moveObjectTo).toHaveBeenCalledTimes(2);
    expect(fc.renderAll).toHaveBeenCalled();
  });

  it('appends layers not in orderedIds at the bottom', () => {
    seedSurface();
    const id1 = useCanvasStore.getState().addLayer(makeLayerInput({ name: 'A' }));
    const id2 = useCanvasStore.getState().addLayer(makeLayerInput({ name: 'B' }));
    const id3 = useCanvasStore.getState().addLayer(makeLayerInput({ name: 'C' }));
    // Only pass id1 and id2 — id3 is not in orderedIds
    useCanvasStore.getState().reorderLayers([id1, id2]);
    const layers = useCanvasStore.getState().layers;
    const layerC = layers.find((l) => l.id === id3);
    expect(layerC).toBeDefined();
    // id3 should still be present even though it wasn't in orderedIds
    expect(layers).toHaveLength(3);
  });
});

// ── reorderLayer with numeric index ──────────────────────────────────────────

describe('reorderLayer with numeric index', () => {
  it('accepts a numeric target index', () => {
    seedSurface();
    const id1 = useCanvasStore.getState().addLayer(makeLayerInput({ name: 'A' }));
    const id2 = useCanvasStore.getState().addLayer(makeLayerInput({ name: 'B' }));
    const id3 = useCanvasStore.getState().addLayer(makeLayerInput({ name: 'C' }));
    // sorted desc by zIndex: [C(2), B(1), A(0)]
    // Move C (idx 0) to position 2 (bottom)
    useCanvasStore.getState().reorderLayer(id3, 2);
    const layers = useCanvasStore.getState().layers;
    const byId = Object.fromEntries(layers.map((l) => [l.id, l.zIndex]));
    // C should now have lowest zIndex
    expect(byId[id3]).toBeLessThan(byId[id1]);
    expect(byId[id3]).toBeLessThan(byId[id2]);
  });

  it('is a no-op when target === current index', () => {
    seedSurface();
    const id1 = useCanvasStore.getState().addLayer(makeLayerInput({ name: 'A' }));
    const before = useCanvasStore.getState().layers.find((l) => l.id === id1)!.zIndex;
    useCanvasStore.getState().reorderLayer(id1, 0); // already at idx 0 in sorted list
    const after = useCanvasStore.getState().layers.find((l) => l.id === id1)!.zIndex;
    expect(after).toBe(before);
  });

  it('is a no-op when layerId is not found', () => {
    seedSurface();
    useCanvasStore.getState().addLayer(makeLayerInput());
    const before = useCanvasStore.getState().layers[0].zIndex;
    useCanvasStore.getState().reorderLayer('ghost-id', 'up');
    expect(useCanvasStore.getState().layers[0].zIndex).toBe(before);
  });
});

// ── selectMultipleLayers with canvas (1 match) ───────────────────────────────

describe('selectMultipleLayers with canvas', () => {
  it('calls setActiveObject when exactly one object matches', () => {
    seedSurface();
    const id = useCanvasStore.getState().addLayer(makeLayerInput());
    const fabricObj: FakeFabricObject = { data: { id } };
    const fc = makeFakeCanvas([fabricObj]);
    useCanvasStore.getState().setCanvas(fc as unknown as Canvas);
    useCanvasStore.getState().selectMultipleLayers([id]);
    expect(fc.setActiveObject).toHaveBeenCalledWith(fabricObj);
    expect(fc.renderAll).toHaveBeenCalled();
  });

  it('sets activeLayerId when exactly one valid id', () => {
    seedSurface();
    const id = useCanvasStore.getState().addLayer(makeLayerInput());
    useCanvasStore.getState().selectMultipleLayers([id]);
    expect(useCanvasStore.getState().activeLayerId).toBe(id);
  });

  it('sets activeLayerId to null when multiple valid ids', () => {
    seedSurface();
    const id1 = useCanvasStore.getState().addLayer(makeLayerInput({ name: 'A' }));
    const id2 = useCanvasStore.getState().addLayer(makeLayerInput({ name: 'B' }));
    useCanvasStore.getState().selectMultipleLayers([id1, id2]);
    expect(useCanvasStore.getState().activeLayerId).toBeNull();
  });

  it('filters out ids that do not correspond to real layers', () => {
    seedSurface();
    const id = useCanvasStore.getState().addLayer(makeLayerInput());
    useCanvasStore.getState().selectMultipleLayers([id, 'nonexistent']);
    expect(useCanvasStore.getState().layerSelection.selectedLayerIds).toEqual([id]);
  });

  it('sets multiple selectionMode and canBatchEdit for 2 unlocked layers', () => {
    seedSurface();
    const id1 = useCanvasStore.getState().addLayer(makeLayerInput({ name: 'A' }));
    const id2 = useCanvasStore.getState().addLayer(makeLayerInput({ name: 'B' }));
    useCanvasStore.getState().selectMultipleLayers([id1, id2]);
    const sel = useCanvasStore.getState().layerSelection;
    expect(sel.selectionMode).toBe('multiple');
    expect(sel.canBatchEdit).toBe(true);
  });

  it('canBatchEdit is false when a selected layer is locked', () => {
    seedSurface();
    const id1 = useCanvasStore.getState().addLayer(makeLayerInput());
    const id2 = useCanvasStore.getState().addLayer(makeLayerInput({ locked: true }));
    useCanvasStore.getState().selectMultipleLayers([id1, id2]);
    expect(useCanvasStore.getState().layerSelection.canBatchEdit).toBe(false);
  });

  it('adds color to batchEditableProperties when all selected are text/icon', () => {
    seedSurface();
    const id1 = useCanvasStore.getState().addLayer({ type: 'text', data: {} });
    const id2 = useCanvasStore.getState().addLayer({ type: 'icon', data: {} });
    useCanvasStore.getState().selectMultipleLayers([id1, id2]);
    expect(useCanvasStore.getState().layerSelection.batchEditableProperties).toContain('color');
  });

  it('omits color when selection has a non-text/icon layer', () => {
    seedSurface();
    const id1 = useCanvasStore.getState().addLayer({ type: 'text', data: {} });
    const id2 = useCanvasStore.getState().addLayer({ type: 'image', data: {} });
    useCanvasStore.getState().selectMultipleLayers([id1, id2]);
    expect(useCanvasStore.getState().layerSelection.batchEditableProperties).not.toContain('color');
  });

  it('calls setActiveObject with ActiveSelection when 2 objects match in canvas', () => {
    seedSurface();
    const id1 = useCanvasStore.getState().addLayer(makeLayerInput({ name: 'A' }));
    const id2 = useCanvasStore.getState().addLayer(makeLayerInput({ name: 'B' }));
    const obj1: FakeFabricObject = { data: { id: id1 } };
    const obj2: FakeFabricObject = { data: { id: id2 } };
    let ctorCallCount = 0;
    const ctorInstances: object[] = [];
    class MockActiveSelection {
      constructor(..._args: unknown[]) {
        ctorCallCount++;
        ctorInstances.push(this);
      }
    }
    const fc = makeFakeCanvas([obj1, obj2]);
    fc.constructor = { ActiveSelection: MockActiveSelection };
    useCanvasStore.getState().setCanvas(fc as unknown as Canvas);
    useCanvasStore.getState().selectMultipleLayers([id1, id2]);
    expect(ctorCallCount).toBe(1);
    expect(fc.setActiveObject).toHaveBeenCalledWith(ctorInstances[0]);
  });

  it('skips ActiveSelection creation when constructor has no ActiveSelection', () => {
    seedSurface();
    const id1 = useCanvasStore.getState().addLayer(makeLayerInput({ name: 'A' }));
    const id2 = useCanvasStore.getState().addLayer(makeLayerInput({ name: 'B' }));
    const obj1: FakeFabricObject = { data: { id: id1 } };
    const obj2: FakeFabricObject = { data: { id: id2 } };
    const fc = makeFakeCanvas([obj1, obj2]);
    fc.constructor = {}; // no ActiveSelection
    useCanvasStore.getState().setCanvas(fc as unknown as Canvas);
    expect(() => useCanvasStore.getState().selectMultipleLayers([id1, id2])).not.toThrow();
    expect(fc.setActiveObject).not.toHaveBeenCalled();
  });
});

// ── deselectAllLayers with canvas ─────────────────────────────────────────────

describe('deselectAllLayers with canvas', () => {
  it('calls canvas.discardActiveObject and renderAll', () => {
    const fc = makeFakeCanvas();
    useCanvasStore.getState().setCanvas(fc as unknown as Canvas);
    useCanvasStore.getState().deselectAllLayers();
    expect(fc.discardActiveObject).toHaveBeenCalledOnce();
    expect(fc.renderAll).toHaveBeenCalled();
  });
});

// ── undo/redo edge cases ──────────────────────────────────────────────────────

describe('undo edge cases', () => {
  it('undo for clear/batch/move actions falls through to default (no state error)', () => {
    seedSurface();
    // Manually push a history entry with action 'clear'
    useCanvasStore.getState().clearLayers(); // pushes 'clear'
    const histIdx = useCanvasStore.getState().historyIndex;
    expect(histIdx).toBeGreaterThanOrEqual(0);
    // undo a 'clear' hits the default case — should not throw
    expect(() => useCanvasStore.getState().undo()).not.toThrow();
  });

  it('undo a remove does nothing when beforeState is an array (guard)', () => {
    seedSurface();
    // Inject a fake remove entry where beforeState is an array (shouldn't normally happen)
    useCanvasStore.setState({
      history: [
        {
          id: 'h1',
          action: 'remove',
          surface: 'front',
          timestamp: new Date(),
          layerId: 'some-id',
          beforeState: [] as unknown as LayerData,
        },
      ],
      historyIndex: 0,
    });
    // Should not add any layer (guard: !Array.isArray(beforeState))
    const beforeLen = useCanvasStore.getState().layers.length;
    useCanvasStore.getState().undo();
    expect(useCanvasStore.getState().layers.length).toBe(beforeLen);
  });

  it('undo a modify does nothing when beforeState is an array', () => {
    seedSurface();
    const id = useCanvasStore.getState().addLayer(makeLayerInput({ name: 'Original' }));
    useCanvasStore.setState({
      history: [
        {
          id: 'h2',
          action: 'modify',
          surface: 'front',
          timestamp: new Date(),
          layerId: id,
          beforeState: [] as unknown as LayerData,
        },
      ],
      historyIndex: 0,
    });
    useCanvasStore.getState().undo();
    // Name should be unchanged
    expect(useCanvasStore.getState().layers.find((l) => l.id === id)!.name).toBe('Original');
  });
});

describe('redo edge cases', () => {
  it('redo a remove re-removes the layer', () => {
    seedSurface();
    const id = useCanvasStore.getState().addLayer(makeLayerInput({ name: 'ToRemove' }));
    useCanvasStore.getState().removeLayer(id);
    // Now undo to restore it, then redo to remove again
    useCanvasStore.getState().undo();
    expect(useCanvasStore.getState().layers).toHaveLength(1);
    useCanvasStore.getState().redo();
    expect(useCanvasStore.getState().layers).toHaveLength(0);
  });

  it('redo a modify re-applies the after state', () => {
    seedSurface();
    const id = useCanvasStore.getState().addLayer(makeLayerInput({ name: 'Before' }));
    useCanvasStore.getState().updateLayer(id, { name: 'After' });
    useCanvasStore.getState().undo(); // restore to 'Before'
    expect(useCanvasStore.getState().layers.find((l) => l.id === id)!.name).toBe('Before');
    useCanvasStore.getState().redo(); // re-apply 'After'
    expect(useCanvasStore.getState().layers.find((l) => l.id === id)!.name).toBe('After');
  });

  it('redo a clear/batch/move falls through to default without error', () => {
    seedSurface();
    useCanvasStore.getState().addLayer(makeLayerInput());
    useCanvasStore.getState().clearLayers(); // action: 'clear'
    useCanvasStore.getState().undo(); // now at index before clear
    expect(() => useCanvasStore.getState().redo()).not.toThrow();
  });

  it('redo add does nothing when afterState is an array (guard)', () => {
    seedSurface();
    useCanvasStore.setState({
      history: [
        {
          id: 'h3',
          action: 'add',
          surface: 'front',
          timestamp: new Date(),
          afterState: [] as unknown as LayerData,
        },
      ],
      historyIndex: -1,
    });
    const beforeLen = useCanvasStore.getState().layers.length;
    useCanvasStore.getState().redo();
    expect(useCanvasStore.getState().layers.length).toBe(beforeLen);
  });

  it('redo modify does nothing when afterState is an array (guard)', () => {
    seedSurface();
    const id = useCanvasStore.getState().addLayer(makeLayerInput({ name: 'Stable' }));
    useCanvasStore.setState({
      history: [
        {
          id: 'h4',
          action: 'modify',
          surface: 'front',
          timestamp: new Date(),
          layerId: id,
          afterState: [] as unknown as LayerData,
        },
      ],
      historyIndex: -1,
    });
    useCanvasStore.getState().redo();
    expect(useCanvasStore.getState().layers.find((l) => l.id === id)!.name).toBe('Stable');
  });
});

// ── silent helpers (used by undo/redo) targeting different surface ─────────────

describe('silent undo/redo helpers across surfaces', () => {
  it('silentAdd targets the correct surface even when it is not the active one', () => {
    // Set up two surfaces, active = front
    const surfaces: DesignerSurface[] = [
      { id: 1, slug: 'front', name: 'Front', mockupImage: '', canvasWidth: 400, canvasHeight: 400, printAreaX: 0, printAreaY: 0, printAreaWidth: 400, printAreaHeight: 400, printDpi: 72, displayOrder: 0 },
      { id: 2, slug: 'back', name: 'Back', mockupImage: '', canvasWidth: 400, canvasHeight: 400, printAreaX: 0, printAreaY: 0, printAreaWidth: 400, printAreaHeight: 400, printDpi: 72, displayOrder: 1 },
    ];
    useCanvasStore.getState().setSurfaces(surfaces);
    // active = front; add a layer on 'back' by faking a history entry
    const backLayer: LayerData = {
      id: 'back-layer-1', type: 'text', name: 'Back Layer',
      visible: true, locked: false, opacity: 1,
      left: 0, top: 0, scaleX: 1, scaleY: 1, angle: 0,
      data: {}, zIndex: 0, createdAt: new Date(), updatedAt: new Date(),
    };
    useCanvasStore.setState({
      history: [{ id: 'hb1', action: 'add', surface: 'back', timestamp: new Date(), layerId: 'back-layer-1', afterState: backLayer }],
      historyIndex: 0,
    });
    // undo the add on 'back' surface — silentRemove should target 'back'
    useCanvasStore.getState().undo();
    // 'back' surface should still be empty (was empty before this undo)
    expect(useCanvasStore.getState().layersBySurface['back'] ?? []).toHaveLength(0);
    // active surface 'front' should be unaffected
    expect(useCanvasStore.getState().layers).toHaveLength(0);
  });

  it('silentReplace targets the correct surface', () => {
    const surfaces: DesignerSurface[] = [
      { id: 1, slug: 'front', name: 'Front', mockupImage: '', canvasWidth: 400, canvasHeight: 400, printAreaX: 0, printAreaY: 0, printAreaWidth: 400, printAreaHeight: 400, printDpi: 72, displayOrder: 0 },
      { id: 2, slug: 'back', name: 'Back', mockupImage: '', canvasWidth: 400, canvasHeight: 400, printAreaX: 0, printAreaY: 0, printAreaWidth: 400, printAreaHeight: 400, printDpi: 72, displayOrder: 1 },
    ];
    useCanvasStore.getState().setSurfaces(surfaces);
    const originalLayer: LayerData = {
      id: 'b1', type: 'text', name: 'Original',
      visible: true, locked: false, opacity: 1,
      left: 0, top: 0, scaleX: 1, scaleY: 1, angle: 0,
      data: {}, zIndex: 0, createdAt: new Date(), updatedAt: new Date(),
    };
    const modifiedLayer: LayerData = { ...originalLayer, name: 'Modified' };
    // Seed back surface directly
    useCanvasStore.setState({
      layersBySurface: { front: [], back: [modifiedLayer] },
      history: [{
        id: 'hm1', action: 'modify', surface: 'back', timestamp: new Date(),
        layerId: 'b1', beforeState: originalLayer, afterState: modifiedLayer,
      }],
      historyIndex: 0,
    });
    // undo the modify on 'back' — silentReplace should restore originalLayer
    useCanvasStore.getState().undo();
    expect(useCanvasStore.getState().layersBySurface['back'][0].name).toBe('Original');
  });
});

// ── findLayerAcrossSurfaces export ────────────────────────────────────────────

describe('findLayerAcrossSurfaces', () => {
  it('finds a layer by id across multiple surfaces', () => {
    const layer1: LayerData = {
      id: 'l1', type: 'text', name: 'L1',
      visible: true, locked: false, opacity: 1,
      left: 0, top: 0, scaleX: 1, scaleY: 1, angle: 0,
      data: {}, zIndex: 0, createdAt: new Date(), updatedAt: new Date(),
    };
    const layer2: LayerData = {
      id: 'l2', type: 'image', name: 'L2',
      visible: true, locked: false, opacity: 1,
      left: 0, top: 0, scaleX: 1, scaleY: 1, angle: 0,
      data: {}, zIndex: 1, createdAt: new Date(), updatedAt: new Date(),
    };
    const store = { front: [layer1], back: [layer2] };
    expect(findLayerAcrossSurfaces(store, 'l1')).toEqual({ surface: 'front', layer: layer1 });
    expect(findLayerAcrossSurfaces(store, 'l2')).toEqual({ surface: 'back', layer: layer2 });
  });

  it('returns null when no layer matches', () => {
    const store = { front: [] };
    expect(findLayerAcrossSurfaces(store, 'nonexistent')).toBeNull();
  });
});

// ── importCanvasData edge cases ───────────────────────────────────────────────

describe('importCanvasData edge cases', () => {
  it('is a no-op when passed null/undefined', () => {
    seedSurface();
    useCanvasStore.getState().addLayer(makeLayerInput({ name: 'Existing' }));
    // @ts-expect-error — testing null guard
    useCanvasStore.getState().importCanvasData(null);
    expect(useCanvasStore.getState().layers).toHaveLength(1);
  });

  it('is a no-op when data lacks layersBySurface', () => {
    seedSurface();
    useCanvasStore.getState().addLayer(makeLayerInput());
    // @ts-expect-error — testing missing layersBySurface
    useCanvasStore.getState().importCanvasData({ designId: 'x', designName: 'y' });
    expect(useCanvasStore.getState().layers).toHaveLength(1);
  });

  it('falls back to state.productId when data has no productId', () => {
    seedSurface();
    useCanvasStore.setState({ productId: 77 });
    const data = {
      designId: 'test',
      designName: 'Test',
      layersBySurface: { front: [] },
      canvasSize: { width: 400, height: 400, dpi: 72 },
      exportedAt: '',
      version: '1.0',
    };
    useCanvasStore.getState().importCanvasData(data as unknown as import('@/lib/designer/types').ExportedDesignData);
    expect(useCanvasStore.getState().productId).toBe(77);
  });

  it('falls back to state.canvasSize when data has no canvasSize', () => {
    seedSurface();
    const defaultSize = { width: 800, height: 600, dpi: 72 };
    const data = {
      designId: 'test',
      designName: 'Test',
      layersBySurface: { front: [] },
      exportedAt: '',
      version: '1.0',
    };
    useCanvasStore.getState().importCanvasData(data as unknown as import('@/lib/designer/types').ExportedDesignData);
    expect(useCanvasStore.getState().canvasSize).toEqual(defaultSize);
  });

  it('uses state.activeSurface if already set when importing', () => {
    seedSurface('front');
    useCanvasStore.setState({ activeSurface: 'front' });
    const data = {
      designId: 'x',
      designName: 'X',
      layersBySurface: { front: [], back: [] },
      canvasSize: { width: 400, height: 400, dpi: 72 },
      exportedAt: '',
      version: '1.0',
    };
    useCanvasStore.getState().importCanvasData(data as unknown as import('@/lib/designer/types').ExportedDesignData);
    expect(useCanvasStore.getState().activeSurface).toBe('front');
  });

  it('falls back to state.mockupTint when data lacks both top-level and stashed tint', () => {
    seedSurface();
    useCanvasStore.setState({ mockupTint: '#existing-tint' });
    const data = {
      designId: 'x',
      designName: 'X',
      layersBySurface: { front: [] },
      canvasSize: { width: 400, height: 400, dpi: 72 },
      exportedAt: '',
      version: '1.0',
    };
    useCanvasStore.getState().importCanvasData(data as unknown as import('@/lib/designer/types').ExportedDesignData);
    expect(useCanvasStore.getState().mockupTint).toBe('#existing-tint');
  });

  it('converts ISO string dates to Date objects for imported layers', () => {
    seedSurface('front');
    const isoNow = new Date().toISOString();
    const data = {
      designId: 'x',
      designName: 'X',
      layersBySurface: {
        front: [{
          id: 'imp1', type: 'text', name: 'Imported',
          visible: true, locked: false, opacity: 1,
          left: 0, top: 0, scaleX: 1, scaleY: 1, angle: 0,
          data: {}, zIndex: 0,
          createdAt: isoNow, updatedAt: isoNow,
        }],
      },
      canvasSize: { width: 400, height: 400, dpi: 72 },
      exportedAt: '',
      version: '1.0',
    };
    useCanvasStore.getState().importCanvasData(data as unknown as import('@/lib/designer/types').ExportedDesignData);
    const layer = useCanvasStore.getState().layersBySurface['front'][0];
    expect(layer.createdAt).toBeInstanceOf(Date);
    expect(layer.updatedAt).toBeInstanceOf(Date);
  });

  it('uses new Date() when layer createdAt/updatedAt are absent', () => {
    seedSurface('front');
    const data = {
      designId: 'x',
      designName: 'X',
      layersBySurface: {
        front: [{
          id: 'imp2', type: 'text', name: 'NoDate',
          visible: true, locked: false, opacity: 1,
          left: 0, top: 0, scaleX: 1, scaleY: 1, angle: 0,
          data: {}, zIndex: 0,
          // no createdAt / updatedAt
        }],
      },
      canvasSize: { width: 400, height: 400, dpi: 72 },
      exportedAt: '',
      version: '1.0',
    };
    useCanvasStore.getState().importCanvasData(data as unknown as import('@/lib/designer/types').ExportedDesignData);
    const layer = useCanvasStore.getState().layersBySurface['front'][0];
    expect(layer.createdAt).toBeInstanceOf(Date);
  });
});

// ── mirrorActiveSurfaceTo edge cases ──────────────────────────────────────────

describe('mirrorActiveSurfaceTo edge cases', () => {
  it('is a no-op when active surface is empty string', () => {
    // activeSurface is '' (no surface seeded)
    expect(() => useCanvasStore.getState().mirrorActiveSurfaceTo('back')).not.toThrow();
  });

  it('is a no-op when targets list is empty (single-surface config, no targetSlug)', () => {
    // Only one surface — mirror to all others finds no targets
    seedSurface('front');
    useCanvasStore.getState().addLayer(makeLayerInput());
    expect(() => useCanvasStore.getState().mirrorActiveSurfaceTo()).not.toThrow();
    // layersBySurface should not have gained any new keys
    const keys = Object.keys(useCanvasStore.getState().layersBySurface);
    expect(keys).toEqual(['front']);
  });
});

// ── updateLayer — no surface guard ───────────────────────────────────────────

describe('updateLayer guard', () => {
  it('is a no-op when there is no active surface', () => {
    // activeSurface is '' — updateLayer should return early
    expect(() => useCanvasStore.getState().updateLayer('any-id', { name: 'X' })).not.toThrow();
  });
});

// ── duplicateLayer — no surface guard ────────────────────────────────────────

describe('duplicateLayer guard', () => {
  it('returns null when there is no active surface', () => {
    const result = useCanvasStore.getState().duplicateLayer('any-id');
    expect(result).toBeNull();
  });
});

// ── toggleLayerVisibility / toggleLayerLock — unknown id guards ───────────────

describe('toggle guards for unknown layer id', () => {
  it('toggleLayerVisibility is a no-op for unknown id', () => {
    seedSurface();
    expect(() => useCanvasStore.getState().toggleLayerVisibility('ghost')).not.toThrow();
  });

  it('toggleLayerLock is a no-op for unknown id', () => {
    seedSurface();
    expect(() => useCanvasStore.getState().toggleLayerLock('ghost')).not.toThrow();
  });
});

// ── batchUpdateLayers — no surface guard ─────────────────────────────────────

describe('batchUpdateLayers guard', () => {
  it('is a no-op when there is no active surface', () => {
    expect(() => useCanvasStore.getState().batchUpdateLayers({ opacity: 0.5 })).not.toThrow();
  });

  it('handles locked field update', () => {
    seedSurface();
    const id1 = useCanvasStore.getState().addLayer(makeLayerInput({ name: 'A' }));
    const id2 = useCanvasStore.getState().addLayer(makeLayerInput({ name: 'B' }));
    useCanvasStore.setState({
      layerSelection: {
        selectedLayerIds: [id1, id2],
        selectionMode: 'multiple',
        lastSelectedId: id2,
        canBatchEdit: true,
        batchEditableProperties: ['locked'],
      },
    });
    useCanvasStore.getState().batchUpdateLayers({ locked: true });
    const layers = useCanvasStore.getState().layers;
    expect(layers.find((l) => l.id === id1)!.locked).toBe(true);
    expect(layers.find((l) => l.id === id2)!.locked).toBe(true);
  });
});

// ── copySelectedLayers — object matched via top-level id ─────────────────────

describe('copySelectedLayers top-level id', () => {
  it('picks up layer via top-level id on fabric object (not data.id)', () => {
    seedSurface();
    const id = useCanvasStore.getState().addLayer(makeLayerInput({ name: 'TopId' }));
    // Simulate a FabricObject that stores id at the top level
    const fakeObj = { id } as unknown as import('fabric').FabricObject;
    useCanvasStore.setState({ selectedLayers: [fakeObj] });
    useCanvasStore.getState().copySelectedLayers();
    const clipboard = useCanvasStore.getState().clipboardLayers;
    expect(clipboard).toHaveLength(1);
    expect(clipboard[0].name).toBe('TopId');
  });

  it('skips fabric objects that have no id at all', () => {
    seedSurface();
    useCanvasStore.getState().addLayer(makeLayerInput());
    const fakeObj = {} as unknown as import('fabric').FabricObject;
    useCanvasStore.setState({ selectedLayers: [fakeObj] });
    useCanvasStore.getState().copySelectedLayers();
    expect(useCanvasStore.getState().clipboardLayers).toHaveLength(0);
  });
});

// ── addLayer default name ─────────────────────────────────────────────────────

describe('addLayer default name', () => {
  it('derives default name from type when no name is provided', () => {
    seedSurface();
    useCanvasStore.getState().addLayer({ type: 'image', data: {} });
    const layer = useCanvasStore.getState().layers[0];
    expect(layer.name).toBe('image Layer');
  });
});
