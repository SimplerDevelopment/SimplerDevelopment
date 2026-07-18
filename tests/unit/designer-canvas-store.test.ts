// @vitest-environment jsdom
/**
 * Unit tests for `lib/designer/canvasStore.ts`.
 *
 * Strategy:
 *   - Test the vanilla zustand store directly via `useCanvasStore.getState()`
 *     and `useCanvasStore.setState()` — no React render needed.
 *   - Mock `fabric` to supply a lightweight `Point` stand-in; every canvas-
 *     touching code path is guarded by `if (canvas)` so tests that don't set
 *     a canvas instance exercise the pure state logic without a real DOM canvas.
 *   - Mock `uuid` to return deterministic incrementing IDs.
 *   - Reset store to initial state before each test so tests are independent.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks (must precede store import) ────────────────────────────────────────

let uuidCounter = 0;
vi.mock('uuid', () => ({
  v4: () => `test-uuid-${++uuidCounter}`,
}));

// Provide a minimal Point stand-in so the import at the top of canvasStore.ts
// resolves without a real browser canvas.
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

import { useCanvasStore } from '@/lib/designer/canvasStore';
import type { DesignerSurface, LayerData } from '@/lib/designer/types';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Reset the store to its initial state before each test. */
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

/** Seed the store with an active surface so layer operations work. */
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

/** Minimal valid layer input. */
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

// ── Test Suite ───────────────────────────────────────────────────────────────

beforeEach(() => {
  resetStore();
});

// ── Design metadata ──────────────────────────────────────────────────────────

describe('design metadata', () => {
  it('setDesign updates designId, designName, productId, and marks dirty', () => {
    useCanvasStore.getState().setDesign('design-1', 'My Shirt', 42);
    const s = useCanvasStore.getState();
    expect(s.designId).toBe('design-1');
    expect(s.designName).toBe('My Shirt');
    expect(s.productId).toBe(42);
    expect(s.isDirty).toBe(true);
  });

  it('setDesignName updates name and marks dirty', () => {
    useCanvasStore.getState().setDesignName('Renamed');
    const s = useCanvasStore.getState();
    expect(s.designName).toBe('Renamed');
    expect(s.isDirty).toBe(true);
  });

  it('setStatus updates status without touching dirty flag', () => {
    useCanvasStore.getState().setStatus('finalized');
    expect(useCanvasStore.getState().status).toBe('finalized');
    expect(useCanvasStore.getState().isDirty).toBe(false);
  });
});

// ── Surfaces ─────────────────────────────────────────────────────────────────

describe('surfaces', () => {
  it('setSurfaces sorts by displayOrder and seeds layersBySurface', () => {
    const surfaces: DesignerSurface[] = [
      { id: 2, slug: 'back', name: 'Back', mockupImage: '', canvasWidth: 400, canvasHeight: 400, printAreaX: 0, printAreaY: 0, printAreaWidth: 400, printAreaHeight: 400, printDpi: 72, displayOrder: 1 },
      { id: 1, slug: 'front', name: 'Front', mockupImage: '', canvasWidth: 400, canvasHeight: 400, printAreaX: 0, printAreaY: 0, printAreaWidth: 400, printAreaHeight: 400, printDpi: 72, displayOrder: 0 },
    ];
    useCanvasStore.getState().setSurfaces(surfaces);
    const s = useCanvasStore.getState();
    expect(s.surfaces[0].slug).toBe('front');
    expect(s.surfaces[1].slug).toBe('back');
    expect(s.activeSurface).toBe('front');
    expect(s.layersBySurface['front']).toEqual([]);
    expect(s.layersBySurface['back']).toEqual([]);
  });

  it('setActiveSurface switches surface and updates layers', () => {
    seedSurface('front');
    useCanvasStore.getState().setActiveSurface('back'); // lazily created
    const s = useCanvasStore.getState();
    expect(s.activeSurface).toBe('back');
    expect(s.layers).toEqual([]);
    expect(s.layersBySurface['back']).toEqual([]);
  });

  it('setActiveSurface to existing surface loads its layers', () => {
    seedSurface('front');
    // Add a layer to front, then add back surface, then switch to front again.
    useCanvasStore.getState().addLayer(makeLayerInput());
    useCanvasStore.getState().setActiveSurface('back');
    useCanvasStore.getState().setActiveSurface('front');
    const s = useCanvasStore.getState();
    expect(s.layers).toHaveLength(1);
  });
});

// ── addLayer ─────────────────────────────────────────────────────────────────

describe('addLayer', () => {
  it('returns a uuid and adds the layer to the active surface', () => {
    seedSurface();
    const id = useCanvasStore.getState().addLayer(makeLayerInput());
    expect(id).toBe('test-uuid-1');
    const s = useCanvasStore.getState();
    expect(s.layers).toHaveLength(1);
    expect(s.layers[0].id).toBe('test-uuid-1');
    expect(s.layers[0].name).toBe('Test Layer');
  });

  it('assigns zIndex = 0 for the first layer, increments for subsequent', () => {
    seedSurface();
    useCanvasStore.getState().addLayer(makeLayerInput({ name: 'A' }));
    useCanvasStore.getState().addLayer(makeLayerInput({ name: 'B' }));
    const s = useCanvasStore.getState();
    expect(s.layers[0].zIndex).toBe(0);
    expect(s.layers[1].zIndex).toBe(1);
  });

  it('defaults visible=true, locked=false, opacity=1', () => {
    seedSurface();
    useCanvasStore.getState().addLayer({ type: 'text', data: {} });
    const layer = useCanvasStore.getState().layers[0];
    expect(layer.visible).toBe(true);
    expect(layer.locked).toBe(false);
    expect(layer.opacity).toBe(1);
  });

  it('accepts a caller-supplied id', () => {
    seedSurface();
    useCanvasStore.getState().addLayer({ ...makeLayerInput(), id: 'my-custom-id' });
    expect(useCanvasStore.getState().layers[0].id).toBe('my-custom-id');
  });

  it('sets activeLayerId to the new layer id', () => {
    seedSurface();
    const id = useCanvasStore.getState().addLayer(makeLayerInput());
    expect(useCanvasStore.getState().activeLayerId).toBe(id);
  });

  it('marks store as dirty', () => {
    seedSurface();
    useCanvasStore.getState().addLayer(makeLayerInput());
    expect(useCanvasStore.getState().isDirty).toBe(true);
  });

  it('does nothing (returns id) when no active surface is set', () => {
    // activeSurface is '' — no surface seeded
    const id = useCanvasStore.getState().addLayer(makeLayerInput());
    expect(useCanvasStore.getState().layers).toHaveLength(0);
    expect(id).toBeTruthy(); // still returns uuid
  });

  it('pushes a history entry for the add', () => {
    seedSurface();
    useCanvasStore.getState().addLayer(makeLayerInput());
    const s = useCanvasStore.getState();
    expect(s.history).toHaveLength(1);
    expect(s.history[0].action).toBe('add');
    expect(s.historyIndex).toBe(0);
  });
});

// ── updateLayer ───────────────────────────────────────────────────────────────

describe('updateLayer', () => {
  it('updates a field and marks dirty', () => {
    seedSurface();
    const id = useCanvasStore.getState().addLayer(makeLayerInput({ name: 'Old' }));
    useCanvasStore.getState().updateLayer(id, { name: 'New', opacity: 0.5 });
    const layer = useCanvasStore.getState().layers.find(l => l.id === id)!;
    expect(layer.name).toBe('New');
    expect(layer.opacity).toBe(0.5);
    expect(useCanvasStore.getState().isDirty).toBe(true);
  });

  it('is a no-op for unknown layerId', () => {
    seedSurface();
    useCanvasStore.getState().addLayer(makeLayerInput());
    const before = useCanvasStore.getState().layers[0].name;
    useCanvasStore.getState().updateLayer('nonexistent', { name: 'Changed' });
    expect(useCanvasStore.getState().layers[0].name).toBe(before);
  });

  it('pushes a modify history entry with before/after states', () => {
    seedSurface();
    const id = useCanvasStore.getState().addLayer(makeLayerInput({ name: 'A' }));
    useCanvasStore.getState().updateLayer(id, { name: 'B' });
    const histEntry = useCanvasStore.getState().history.find(h => h.action === 'modify');
    expect(histEntry).toBeDefined();
    expect((histEntry!.beforeState as LayerData).name).toBe('A');
    expect((histEntry!.afterState as LayerData).name).toBe('B');
  });
});

// ── removeLayer ───────────────────────────────────────────────────────────────

describe('removeLayer', () => {
  it('removes the layer from the surface', () => {
    seedSurface();
    const id = useCanvasStore.getState().addLayer(makeLayerInput());
    useCanvasStore.getState().removeLayer(id);
    expect(useCanvasStore.getState().layers).toHaveLength(0);
  });

  it('clears activeLayerId when the active layer is removed', () => {
    seedSurface();
    const id = useCanvasStore.getState().addLayer(makeLayerInput());
    expect(useCanvasStore.getState().activeLayerId).toBe(id);
    useCanvasStore.getState().removeLayer(id);
    expect(useCanvasStore.getState().activeLayerId).toBeNull();
  });

  it('preserves activeLayerId when a different layer is removed', () => {
    seedSurface();
    const id1 = useCanvasStore.getState().addLayer(makeLayerInput({ name: 'A' }));
    const id2 = useCanvasStore.getState().addLayer(makeLayerInput({ name: 'B' }));
    // Manually set active to id1
    useCanvasStore.getState().setActiveLayer(id1);
    useCanvasStore.getState().removeLayer(id2);
    expect(useCanvasStore.getState().activeLayerId).toBe(id1);
  });

  it('is a no-op for unknown layerId', () => {
    seedSurface();
    useCanvasStore.getState().addLayer(makeLayerInput());
    useCanvasStore.getState().removeLayer('ghost');
    expect(useCanvasStore.getState().layers).toHaveLength(1);
  });

  it('pushes a remove history entry', () => {
    seedSurface();
    const id = useCanvasStore.getState().addLayer(makeLayerInput());
    useCanvasStore.getState().removeLayer(id);
    const entry = useCanvasStore.getState().history.find(h => h.action === 'remove');
    expect(entry).toBeDefined();
    expect(entry!.layerId).toBe(id);
  });
});

// ── duplicateLayer ────────────────────────────────────────────────────────────

describe('duplicateLayer', () => {
  it('creates a copy with a new id, offset position, and " Copy" suffix', () => {
    seedSurface();
    const id = useCanvasStore.getState().addLayer(makeLayerInput({ left: 100, top: 50, name: 'Original' }));
    const copyId = useCanvasStore.getState().duplicateLayer(id);
    expect(copyId).toBeTruthy();
    expect(copyId).not.toBe(id);
    const layers = useCanvasStore.getState().layers;
    const copy = layers.find(l => l.id === copyId)!;
    expect(copy.name).toBe('Original Copy');
    expect(copy.left).toBe(120);
    expect(copy.top).toBe(70);
  });

  it('returns null for unknown layer', () => {
    seedSurface();
    const result = useCanvasStore.getState().duplicateLayer('no-such-id');
    expect(result).toBeNull();
  });

  it('sets the duplicate as the active layer', () => {
    seedSurface();
    const id = useCanvasStore.getState().addLayer(makeLayerInput());
    const copyId = useCanvasStore.getState().duplicateLayer(id)!;
    expect(useCanvasStore.getState().activeLayerId).toBe(copyId);
  });
});

// ── reorderLayers ─────────────────────────────────────────────────────────────

describe('reorderLayers', () => {
  it('reassigns zIndex based on orderedIds array (first id → highest z)', () => {
    seedSurface();
    const id1 = useCanvasStore.getState().addLayer(makeLayerInput({ name: 'A' }));
    const id2 = useCanvasStore.getState().addLayer(makeLayerInput({ name: 'B' }));
    const id3 = useCanvasStore.getState().addLayer(makeLayerInput({ name: 'C' }));
    // Reverse order: C on top
    useCanvasStore.getState().reorderLayers([id3, id2, id1]);
    const layers = useCanvasStore.getState().layers;
    const byId = Object.fromEntries(layers.map(l => [l.id, l.zIndex]));
    expect(byId[id3]).toBe(2); // first in array → zIndex = (len-1 - 0) = 2
    expect(byId[id2]).toBe(1);
    expect(byId[id1]).toBe(0);
  });
});

// ── reorderLayer ──────────────────────────────────────────────────────────────

describe('reorderLayer', () => {
  it('moves a layer up', () => {
    seedSurface();
    const id1 = useCanvasStore.getState().addLayer(makeLayerInput({ name: 'A' }));
    const id2 = useCanvasStore.getState().addLayer(makeLayerInput({ name: 'B' }));
    // sorted desc by zIndex: [B(1), A(0)]; B is at idx 0, A at idx 1
    // move A (idx 1) up → idx 0
    useCanvasStore.getState().reorderLayer(id1, 'up');
    const layers = useCanvasStore.getState().layers;
    const byId = Object.fromEntries(layers.map(l => [l.id, l.zIndex]));
    // After move, A should have higher zIndex than B
    expect(byId[id1]).toBeGreaterThan(byId[id2]);
  });

  it('moves a layer down', () => {
    seedSurface();
    const id1 = useCanvasStore.getState().addLayer(makeLayerInput({ name: 'A' }));
    const id2 = useCanvasStore.getState().addLayer(makeLayerInput({ name: 'B' }));
    // B has higher zIndex; move B down
    useCanvasStore.getState().reorderLayer(id2, 'down');
    const layers = useCanvasStore.getState().layers;
    const byId = Object.fromEntries(layers.map(l => [l.id, l.zIndex]));
    expect(byId[id1]).toBeGreaterThan(byId[id2]);
  });

  it('is a no-op when already at boundary', () => {
    seedSurface();
    const id1 = useCanvasStore.getState().addLayer(makeLayerInput({ name: 'A' }));
    const before = useCanvasStore.getState().layers.find(l => l.id === id1)!.zIndex;
    // single layer, moving up is at boundary
    useCanvasStore.getState().reorderLayer(id1, 'up');
    const after = useCanvasStore.getState().layers.find(l => l.id === id1)!.zIndex;
    expect(after).toBe(before);
  });
});

// ── clearLayers ───────────────────────────────────────────────────────────────

describe('clearLayers', () => {
  it('removes all layers from the active surface', () => {
    seedSurface();
    useCanvasStore.getState().addLayer(makeLayerInput());
    useCanvasStore.getState().addLayer(makeLayerInput());
    useCanvasStore.getState().clearLayers();
    expect(useCanvasStore.getState().layers).toHaveLength(0);
    expect(useCanvasStore.getState().activeLayerId).toBeNull();
    expect(useCanvasStore.getState().isDirty).toBe(true);
  });

  it('resets selection', () => {
    seedSurface();
    useCanvasStore.getState().addLayer(makeLayerInput());
    useCanvasStore.getState().clearLayers();
    expect(useCanvasStore.getState().layerSelection.selectedLayerIds).toEqual([]);
  });
});

// ── mirrorActiveSurfaceTo ─────────────────────────────────────────────────────

describe('mirrorActiveSurfaceTo', () => {
  it('copies active surface layers to a target surface with fresh ids', () => {
    // Set up two surfaces
    const surfaces: DesignerSurface[] = [
      { id: 1, slug: 'front', name: 'Front', mockupImage: '', canvasWidth: 400, canvasHeight: 400, printAreaX: 0, printAreaY: 0, printAreaWidth: 400, printAreaHeight: 400, printDpi: 72, displayOrder: 0 },
      { id: 2, slug: 'back', name: 'Back', mockupImage: '', canvasWidth: 400, canvasHeight: 400, printAreaX: 0, printAreaY: 0, printAreaWidth: 400, printAreaHeight: 400, printDpi: 72, displayOrder: 1 },
    ];
    useCanvasStore.getState().setSurfaces(surfaces);
    const origId = useCanvasStore.getState().addLayer(makeLayerInput({ name: 'Logo' }));
    useCanvasStore.getState().mirrorActiveSurfaceTo('back');
    const backLayers = useCanvasStore.getState().layersBySurface['back'];
    expect(backLayers).toHaveLength(1);
    expect(backLayers[0].name).toBe('Logo');
    // Fresh id — not the same as the original
    expect(backLayers[0].id).not.toBe(origId);
  });

  it('mirrors to all other surfaces when no targetSlug given', () => {
    const surfaces: DesignerSurface[] = [
      { id: 1, slug: 'front', name: 'Front', mockupImage: '', canvasWidth: 400, canvasHeight: 400, printAreaX: 0, printAreaY: 0, printAreaWidth: 400, printAreaHeight: 400, printDpi: 72, displayOrder: 0 },
      { id: 2, slug: 'back', name: 'Back', mockupImage: '', canvasWidth: 400, canvasHeight: 400, printAreaX: 0, printAreaY: 0, printAreaWidth: 400, printAreaHeight: 400, printDpi: 72, displayOrder: 1 },
      { id: 3, slug: 'left', name: 'Left', mockupImage: '', canvasWidth: 400, canvasHeight: 400, printAreaX: 0, printAreaY: 0, printAreaWidth: 400, printAreaHeight: 400, printDpi: 72, displayOrder: 2 },
    ];
    useCanvasStore.getState().setSurfaces(surfaces);
    useCanvasStore.getState().addLayer(makeLayerInput({ name: 'X' }));
    useCanvasStore.getState().mirrorActiveSurfaceTo(); // no arg → all other surfaces
    expect(useCanvasStore.getState().layersBySurface['back']).toHaveLength(1);
    expect(useCanvasStore.getState().layersBySurface['left']).toHaveLength(1);
  });

  it('does nothing when source surface has no layers', () => {
    seedSurface('front');
    useCanvasStore.getState().mirrorActiveSurfaceTo('back');
    expect(useCanvasStore.getState().layersBySurface['back']).toBeUndefined();
  });
});

// ── selection ─────────────────────────────────────────────────────────────────

describe('selection', () => {
  it('setActiveLayer updates activeLayerId', () => {
    seedSurface();
    useCanvasStore.getState().setActiveLayer('some-id');
    expect(useCanvasStore.getState().activeLayerId).toBe('some-id');
  });

  it('setSelectedLayers with one object sets single selection mode and activeLayerId', () => {
    seedSurface();
    const id = useCanvasStore.getState().addLayer(makeLayerInput());
    // Simulate a FabricObject with data.id
    const fakeObj = { data: { id } } as unknown as import('fabric').FabricObject;
    useCanvasStore.getState().setSelectedLayers([fakeObj]);
    const s = useCanvasStore.getState();
    expect(s.layerSelection.selectedLayerIds).toEqual([id]);
    expect(s.layerSelection.selectionMode).toBe('single');
    expect(s.activeLayerId).toBe(id);
  });

  it('setSelectedLayers with two objects sets multiple mode, canBatchEdit=true when unlocked', () => {
    seedSurface();
    const id1 = useCanvasStore.getState().addLayer(makeLayerInput({ name: 'A' }));
    const id2 = useCanvasStore.getState().addLayer(makeLayerInput({ name: 'B' }));
    const objs = [
      { data: { id: id1 } },
      { data: { id: id2 } },
    ] as unknown as import('fabric').FabricObject[];
    useCanvasStore.getState().setSelectedLayers(objs);
    const sel = useCanvasStore.getState().layerSelection;
    expect(sel.selectionMode).toBe('multiple');
    expect(sel.canBatchEdit).toBe(true);
    expect(sel.selectedLayerIds).toEqual([id1, id2]);
    // activeLayerId is null for multi-selection
    expect(useCanvasStore.getState().activeLayerId).toBeNull();
  });

  it('setSelectedLayers with two text layers adds color to batchEditableProperties', () => {
    seedSurface();
    const id1 = useCanvasStore.getState().addLayer({ type: 'text', data: {} });
    const id2 = useCanvasStore.getState().addLayer({ type: 'text', data: {} });
    const objs = [{ data: { id: id1 } }, { data: { id: id2 } }] as unknown as import('fabric').FabricObject[];
    useCanvasStore.getState().setSelectedLayers(objs);
    expect(useCanvasStore.getState().layerSelection.batchEditableProperties).toContain('color');
  });

  it('setSelectedLayers with mixed types does not add color', () => {
    seedSurface();
    const id1 = useCanvasStore.getState().addLayer({ type: 'text', data: {} });
    const id2 = useCanvasStore.getState().addLayer({ type: 'image', data: {} });
    const objs = [{ data: { id: id1 } }, { data: { id: id2 } }] as unknown as import('fabric').FabricObject[];
    useCanvasStore.getState().setSelectedLayers(objs);
    expect(useCanvasStore.getState().layerSelection.batchEditableProperties).not.toContain('color');
  });

  it('deselectAllLayers resets selection state', () => {
    seedSurface();
    const id = useCanvasStore.getState().addLayer(makeLayerInput());
    useCanvasStore.getState().setActiveLayer(id);
    useCanvasStore.getState().deselectAllLayers();
    const s = useCanvasStore.getState();
    expect(s.activeLayerId).toBeNull();
    expect(s.layerSelection.selectedLayerIds).toEqual([]);
    expect(s.selectedLayers).toEqual([]);
  });

  it('getSelectedLayerIds returns selected layer ids', () => {
    seedSurface();
    useCanvasStore.setState({
      layerSelection: {
        selectedLayerIds: ['a', 'b'],
        selectionMode: 'multiple',
        lastSelectedId: 'b',
        canBatchEdit: true,
        batchEditableProperties: ['opacity'],
      },
    });
    expect(useCanvasStore.getState().getSelectedLayerIds()).toEqual(['a', 'b']);
  });

  it('isLayerSelected returns true/false correctly', () => {
    seedSurface();
    useCanvasStore.setState({
      layerSelection: {
        selectedLayerIds: ['layer-x'],
        selectionMode: 'single',
        lastSelectedId: 'layer-x',
        canBatchEdit: false,
        batchEditableProperties: [],
      },
    });
    expect(useCanvasStore.getState().isLayerSelected('layer-x')).toBe(true);
    expect(useCanvasStore.getState().isLayerSelected('layer-y')).toBe(false);
  });

  it('selectAllLayers selects only visible+unlocked layers', () => {
    seedSurface();
    const id1 = useCanvasStore.getState().addLayer(makeLayerInput({ name: 'Visible' }));
    const id2 = useCanvasStore.getState().addLayer(makeLayerInput({ name: 'Hidden', visible: false }));
    const id3 = useCanvasStore.getState().addLayer(makeLayerInput({ name: 'Locked', locked: true }));
    useCanvasStore.getState().selectAllLayers();
    const ids = useCanvasStore.getState().layerSelection.selectedLayerIds;
    expect(ids).toContain(id1);
    expect(ids).not.toContain(id2);
    expect(ids).not.toContain(id3);
  });

  it('toggleLayerSelection adds then removes a layer id', () => {
    seedSurface();
    const id1 = useCanvasStore.getState().addLayer(makeLayerInput());
    const id2 = useCanvasStore.getState().addLayer(makeLayerInput());
    // Toggle id1 in
    useCanvasStore.getState().toggleLayerSelection(id1);
    expect(useCanvasStore.getState().layerSelection.selectedLayerIds).toContain(id1);
    // Toggle id2 in
    useCanvasStore.getState().toggleLayerSelection(id2);
    expect(useCanvasStore.getState().layerSelection.selectedLayerIds).toContain(id2);
    // Toggle id1 out
    useCanvasStore.getState().toggleLayerSelection(id1);
    expect(useCanvasStore.getState().layerSelection.selectedLayerIds).not.toContain(id1);
    expect(useCanvasStore.getState().layerSelection.selectedLayerIds).toContain(id2);
  });
});

// ── batch edit ────────────────────────────────────────────────────────────────

describe('batchUpdateLayers', () => {
  it('updates opacity and visible for all selected layers', () => {
    seedSurface();
    const id1 = useCanvasStore.getState().addLayer(makeLayerInput({ name: 'A' }));
    const id2 = useCanvasStore.getState().addLayer(makeLayerInput({ name: 'B' }));
    const objs = [{ data: { id: id1 } }, { data: { id: id2 } }] as unknown as import('fabric').FabricObject[];
    useCanvasStore.getState().setSelectedLayers(objs);
    useCanvasStore.getState().batchUpdateLayers({ opacity: 0.3, visible: false });
    const layers = useCanvasStore.getState().layers;
    const a = layers.find(l => l.id === id1)!;
    const b = layers.find(l => l.id === id2)!;
    expect(a.opacity).toBe(0.3);
    expect(a.visible).toBe(false);
    expect(b.opacity).toBe(0.3);
    expect(b.visible).toBe(false);
  });

  it('writes color to data.color for text/icon layers (no tint key)', () => {
    seedSurface();
    const id = useCanvasStore.getState().addLayer({ type: 'text', data: { fill: '#000' } });
    useCanvasStore.getState().setSelectedLayers([{ data: { id } }] as unknown as import('fabric').FabricObject[]);
    useCanvasStore.getState().batchUpdateLayers({ color: '#ff0000' });
    const layer = useCanvasStore.getState().layers.find(l => l.id === id)!;
    const d = layer.data as Record<string, unknown>;
    expect(d['color']).toBe('#ff0000');
    expect(d['fill']).toBe('#ff0000');
  });

  it('writes color into fillByTint when colorTintKey is set', () => {
    seedSurface();
    const id = useCanvasStore.getState().addLayer({ type: 'text', data: {} });
    useCanvasStore.getState().setSelectedLayers([{ data: { id } }] as unknown as import('fabric').FabricObject[]);
    useCanvasStore.getState().batchUpdateLayers({ color: '#blue', colorTintKey: '#1f2a44' });
    const layer = useCanvasStore.getState().layers.find(l => l.id === id)!;
    const d = layer.data as { fillByTint?: Record<string, string> };
    expect(d.fillByTint?.['#1f2a44']).toBe('#blue');
  });

  it('does not write color on image layers', () => {
    seedSurface();
    const id = useCanvasStore.getState().addLayer({ type: 'image', data: { url: '/x.png' } });
    useCanvasStore.getState().setSelectedLayers([{ data: { id } }] as unknown as import('fabric').FabricObject[]);
    useCanvasStore.getState().batchUpdateLayers({ color: '#red' });
    const layer = useCanvasStore.getState().layers.find(l => l.id === id)!;
    const d = layer.data as Record<string, unknown>;
    expect(d['color']).toBeUndefined();
  });
});

describe('canBatchEdit', () => {
  it('returns false when fewer than 2 layers are selected', () => {
    seedSurface();
    const id = useCanvasStore.getState().addLayer(makeLayerInput());
    useCanvasStore.getState().setActiveLayer(id);
    useCanvasStore.getState().setState?.({ layerSelection: { selectedLayerIds: [id], selectionMode: 'single', lastSelectedId: id, canBatchEdit: false, batchEditableProperties: [] } });
    // Reset selection to single
    useCanvasStore.setState({ layerSelection: { selectedLayerIds: [id], selectionMode: 'single', lastSelectedId: id, canBatchEdit: false, batchEditableProperties: [] } });
    expect(useCanvasStore.getState().canBatchEdit()).toBe(false);
  });

  it('returns false when any selected layer is locked', () => {
    seedSurface();
    const id1 = useCanvasStore.getState().addLayer(makeLayerInput());
    const id2 = useCanvasStore.getState().addLayer(makeLayerInput({ locked: true }));
    useCanvasStore.setState({ layerSelection: { selectedLayerIds: [id1, id2], selectionMode: 'multiple', lastSelectedId: id2, canBatchEdit: false, batchEditableProperties: [] } });
    expect(useCanvasStore.getState().canBatchEdit()).toBe(false);
  });

  it('returns true when 2+ unlocked layers are selected', () => {
    seedSurface();
    const id1 = useCanvasStore.getState().addLayer(makeLayerInput());
    const id2 = useCanvasStore.getState().addLayer(makeLayerInput());
    useCanvasStore.setState({ layerSelection: { selectedLayerIds: [id1, id2], selectionMode: 'multiple', lastSelectedId: id2, canBatchEdit: true, batchEditableProperties: [] } });
    expect(useCanvasStore.getState().canBatchEdit()).toBe(true);
  });
});

describe('getBatchEditableProperties', () => {
  it('returns empty array when no layers selected', () => {
    seedSurface();
    expect(useCanvasStore.getState().getBatchEditableProperties()).toEqual([]);
  });

  it('includes color for text-only selection', () => {
    seedSurface();
    const id1 = useCanvasStore.getState().addLayer({ type: 'text', data: {} });
    const id2 = useCanvasStore.getState().addLayer({ type: 'text', data: {} });
    useCanvasStore.setState({ layerSelection: { selectedLayerIds: [id1, id2], selectionMode: 'multiple', lastSelectedId: id2, canBatchEdit: true, batchEditableProperties: [] } });
    const props = useCanvasStore.getState().getBatchEditableProperties();
    expect(props).toContain('opacity');
    expect(props).toContain('color');
  });

  it('omits color for mixed-type selection', () => {
    seedSurface();
    const id1 = useCanvasStore.getState().addLayer({ type: 'text', data: {} });
    const id2 = useCanvasStore.getState().addLayer({ type: 'image', data: {} });
    useCanvasStore.setState({ layerSelection: { selectedLayerIds: [id1, id2], selectionMode: 'multiple', lastSelectedId: id2, canBatchEdit: true, batchEditableProperties: [] } });
    const props = useCanvasStore.getState().getBatchEditableProperties();
    expect(props).not.toContain('color');
  });
});

describe('deleteSelectedLayers', () => {
  it('removes all selected layers and clears selection', () => {
    seedSurface();
    const id1 = useCanvasStore.getState().addLayer(makeLayerInput({ name: 'A' }));
    const id2 = useCanvasStore.getState().addLayer(makeLayerInput({ name: 'B' }));
    const id3 = useCanvasStore.getState().addLayer(makeLayerInput({ name: 'C' }));
    useCanvasStore.setState({ layerSelection: { selectedLayerIds: [id1, id2], selectionMode: 'multiple', lastSelectedId: id2, canBatchEdit: true, batchEditableProperties: [] } });
    useCanvasStore.getState().deleteSelectedLayers();
    const ids = useCanvasStore.getState().layers.map(l => l.id);
    expect(ids).not.toContain(id1);
    expect(ids).not.toContain(id2);
    expect(ids).toContain(id3);
    expect(useCanvasStore.getState().layerSelection.selectedLayerIds).toEqual([]);
  });
});

// ── visibility / lock ─────────────────────────────────────────────────────────

describe('visibility and lock toggles', () => {
  it('setLayerVisible sets visible to false', () => {
    seedSurface();
    const id = useCanvasStore.getState().addLayer(makeLayerInput({ visible: true }));
    useCanvasStore.getState().setLayerVisible(id, false);
    expect(useCanvasStore.getState().layers.find(l => l.id === id)!.visible).toBe(false);
  });

  it('setLayerLocked sets locked to true', () => {
    seedSurface();
    const id = useCanvasStore.getState().addLayer(makeLayerInput({ locked: false }));
    useCanvasStore.getState().setLayerLocked(id, true);
    expect(useCanvasStore.getState().layers.find(l => l.id === id)!.locked).toBe(true);
  });

  it('toggleLayerVisibility flips visible', () => {
    seedSurface();
    const id = useCanvasStore.getState().addLayer(makeLayerInput({ visible: true }));
    useCanvasStore.getState().toggleLayerVisibility(id);
    expect(useCanvasStore.getState().layers.find(l => l.id === id)!.visible).toBe(false);
    useCanvasStore.getState().toggleLayerVisibility(id);
    expect(useCanvasStore.getState().layers.find(l => l.id === id)!.visible).toBe(true);
  });

  it('toggleLayerLock flips locked', () => {
    seedSurface();
    const id = useCanvasStore.getState().addLayer(makeLayerInput({ locked: false }));
    useCanvasStore.getState().toggleLayerLock(id);
    expect(useCanvasStore.getState().layers.find(l => l.id === id)!.locked).toBe(true);
    useCanvasStore.getState().toggleLayerLock(id);
    expect(useCanvasStore.getState().layers.find(l => l.id === id)!.locked).toBe(false);
  });
});

// ── print area / grid ─────────────────────────────────────────────────────────

describe('print area and grid', () => {
  it('setShowPrintArea sets showPrintArea', () => {
    useCanvasStore.getState().setShowPrintArea(false);
    expect(useCanvasStore.getState().showPrintArea).toBe(false);
    useCanvasStore.getState().setShowPrintArea(true);
    expect(useCanvasStore.getState().showPrintArea).toBe(true);
  });

  it('togglePrintArea flips showPrintArea', () => {
    expect(useCanvasStore.getState().showPrintArea).toBe(true);
    useCanvasStore.getState().togglePrintArea();
    expect(useCanvasStore.getState().showPrintArea).toBe(false);
    useCanvasStore.getState().togglePrintArea();
    expect(useCanvasStore.getState().showPrintArea).toBe(true);
  });

  it('toggleGrid flips showGrid', () => {
    expect(useCanvasStore.getState().showGrid).toBe(false);
    useCanvasStore.getState().toggleGrid();
    expect(useCanvasStore.getState().showGrid).toBe(true);
    useCanvasStore.getState().toggleGrid();
    expect(useCanvasStore.getState().showGrid).toBe(false);
  });
});

// ── brand state ───────────────────────────────────────────────────────────────

describe('brand state setters', () => {
  it('setMockupTint sets hex and marks dirty', () => {
    useCanvasStore.getState().setMockupTint('#ff0000');
    expect(useCanvasStore.getState().mockupTint).toBe('#ff0000');
    expect(useCanvasStore.getState().isDirty).toBe(true);
  });

  it('setMockupTint accepts null', () => {
    useCanvasStore.getState().setMockupTint('#ff0000');
    useCanvasStore.getState().setMockupTint(null);
    expect(useCanvasStore.getState().mockupTint).toBeNull();
  });

  it('setBrandColors sets brand palette', () => {
    useCanvasStore.getState().setBrandColors(['#abc', '#def']);
    expect(useCanvasStore.getState().brandColors).toEqual(['#abc', '#def']);
  });

  it('setBrandLogoUrl sets url', () => {
    useCanvasStore.getState().setBrandLogoUrl('https://example.com/logo.png');
    expect(useCanvasStore.getState().brandLogoUrl).toBe('https://example.com/logo.png');
  });

  it('setBrandFonts sets font config', () => {
    useCanvasStore.getState().setBrandFonts({ heading: 'Inter', body: 'Roboto' });
    expect(useCanvasStore.getState().brandFonts).toEqual({ heading: 'Inter', body: 'Roboto' });
  });
});

// ── zoom / pan (no-canvas path) ───────────────────────────────────────────────

describe('zoom and pan (no canvas)', () => {
  it('setZoom clamps to [0.1, 5]', () => {
    useCanvasStore.getState().setZoom(0.001);
    expect(useCanvasStore.getState().zoom).toBe(0.1);
    useCanvasStore.getState().setZoom(999);
    expect(useCanvasStore.getState().zoom).toBe(5);
    useCanvasStore.getState().setZoom(1.5);
    expect(useCanvasStore.getState().zoom).toBe(1.5);
  });

  it('zoomIn increases zoom', () => {
    useCanvasStore.getState().setZoom(1);
    useCanvasStore.getState().zoomIn();
    expect(useCanvasStore.getState().zoom).toBeCloseTo(1.25);
  });

  it('zoomOut decreases zoom', () => {
    useCanvasStore.getState().setZoom(1);
    useCanvasStore.getState().zoomOut();
    expect(useCanvasStore.getState().zoom).toBeCloseTo(0.8);
  });

  it('setPan updates panX, panY, and hasManuallyPanned', () => {
    useCanvasStore.getState().setPan(50, -30);
    const s = useCanvasStore.getState();
    expect(s.panX).toBe(50);
    expect(s.panY).toBe(-30);
    expect(s.hasManuallyPanned).toBe(true);
  });

  it('resetView restores initial zoom and pan and clears hasManuallyPanned', () => {
    useCanvasStore.getState().setZoom(3);
    useCanvasStore.getState().setPan(100, 200);
    useCanvasStore.getState().resetView();
    const s = useCanvasStore.getState();
    expect(s.zoom).toBe(0.64);
    expect(s.panX).toBe(0);
    expect(s.panY).toBe(0);
    expect(s.hasManuallyPanned).toBe(false);
  });
});

// ── history (pushHistory / undo / redo) ───────────────────────────────────────

describe('history', () => {
  it('canUndo returns false when historyIndex < 0', () => {
    expect(useCanvasStore.getState().canUndo()).toBe(false);
  });

  it('canRedo returns false when at the latest entry', () => {
    seedSurface();
    useCanvasStore.getState().addLayer(makeLayerInput());
    expect(useCanvasStore.getState().canRedo()).toBe(false);
  });

  it('canUndo returns true after an action', () => {
    seedSurface();
    useCanvasStore.getState().addLayer(makeLayerInput());
    expect(useCanvasStore.getState().canUndo()).toBe(true);
  });

  it('undo an add removes the layer', () => {
    seedSurface();
    useCanvasStore.getState().addLayer(makeLayerInput());
    expect(useCanvasStore.getState().layers).toHaveLength(1);
    useCanvasStore.getState().undo();
    expect(useCanvasStore.getState().layers).toHaveLength(0);
    expect(useCanvasStore.getState().historyIndex).toBe(-1);
  });

  it('redo after undo restores the layer', () => {
    seedSurface();
    useCanvasStore.getState().addLayer(makeLayerInput());
    useCanvasStore.getState().undo();
    expect(useCanvasStore.getState().layers).toHaveLength(0);
    useCanvasStore.getState().redo();
    expect(useCanvasStore.getState().layers).toHaveLength(1);
  });

  it('undo a remove restores the layer', () => {
    seedSurface();
    const id = useCanvasStore.getState().addLayer(makeLayerInput({ name: 'Keep Me' }));
    useCanvasStore.getState().removeLayer(id);
    expect(useCanvasStore.getState().layers).toHaveLength(0);
    useCanvasStore.getState().undo(); // undo the remove
    expect(useCanvasStore.getState().layers).toHaveLength(1);
    expect(useCanvasStore.getState().layers[0].name).toBe('Keep Me');
  });

  it('undo a modify restores the before state', () => {
    seedSurface();
    const id = useCanvasStore.getState().addLayer(makeLayerInput({ name: 'Before' }));
    useCanvasStore.getState().updateLayer(id, { name: 'After' });
    useCanvasStore.getState().undo(); // undo modify
    expect(useCanvasStore.getState().layers.find(l => l.id === id)!.name).toBe('Before');
  });

  it('undo is a no-op when historyIndex < 0', () => {
    seedSurface();
    useCanvasStore.getState().undo(); // no-op
    expect(useCanvasStore.getState().historyIndex).toBe(-1);
  });

  it('redo is a no-op when at the latest entry', () => {
    seedSurface();
    useCanvasStore.getState().addLayer(makeLayerInput());
    const idxBefore = useCanvasStore.getState().historyIndex;
    useCanvasStore.getState().redo(); // no-op
    expect(useCanvasStore.getState().historyIndex).toBe(idxBefore);
  });

  it('branching: new action after undo truncates the redo stack', () => {
    seedSurface();
    useCanvasStore.getState().addLayer(makeLayerInput({ name: 'A' }));
    useCanvasStore.getState().addLayer(makeLayerInput({ name: 'B' }));
    useCanvasStore.getState().undo(); // B removed from history
    useCanvasStore.getState().addLayer(makeLayerInput({ name: 'C' })); // branches
    expect(useCanvasStore.getState().canRedo()).toBe(false);
  });

  it('clearHistory empties history and resets index', () => {
    seedSurface();
    useCanvasStore.getState().addLayer(makeLayerInput());
    useCanvasStore.getState().clearHistory();
    expect(useCanvasStore.getState().history).toHaveLength(0);
    expect(useCanvasStore.getState().historyIndex).toBe(-1);
  });

  it('history is capped at maxHistorySize entries', () => {
    seedSurface();
    useCanvasStore.setState({ maxHistorySize: 3 });
    for (let i = 0; i < 5; i++) {
      useCanvasStore.getState().addLayer(makeLayerInput());
    }
    expect(useCanvasStore.getState().history.length).toBeLessThanOrEqual(3);
  });
});

// ── clipboard ─────────────────────────────────────────────────────────────────

describe('clipboard', () => {
  it('copySelectedLayers populates clipboardLayers', () => {
    seedSurface();
    const id = useCanvasStore.getState().addLayer(makeLayerInput({ name: 'Copy Me' }));
    const fakeObj = { data: { id } } as unknown as import('fabric').FabricObject;
    useCanvasStore.getState().setSelectedLayers([fakeObj]);
    useCanvasStore.getState().copySelectedLayers();
    const clipboard = useCanvasStore.getState().clipboardLayers;
    expect(clipboard).toHaveLength(1);
    expect(clipboard[0].name).toBe('Copy Me');
  });

  it('pasteLayersFromClipboard adds offset copies with " Copy" suffix', () => {
    seedSurface();
    const id = useCanvasStore.getState().addLayer(makeLayerInput({ name: 'Original', left: 10, top: 20 }));
    const fakeObj = { data: { id } } as unknown as import('fabric').FabricObject;
    useCanvasStore.getState().setSelectedLayers([fakeObj]);
    useCanvasStore.getState().copySelectedLayers();
    useCanvasStore.getState().pasteLayersFromClipboard();
    const layers = useCanvasStore.getState().layers;
    expect(layers).toHaveLength(2);
    const pasted = layers[1];
    expect(pasted.name).toBe('Original Copy');
    expect(pasted.left).toBe(30);
    expect(pasted.top).toBe(40);
    expect(pasted.id).not.toBe(id);
  });

  it('pasteLayersFromClipboard is a no-op when clipboard is empty', () => {
    seedSurface();
    useCanvasStore.getState().pasteLayersFromClipboard();
    expect(useCanvasStore.getState().layers).toHaveLength(0);
  });
});

// ── dirty / save tracking ─────────────────────────────────────────────────────

describe('dirty / save tracking', () => {
  it('markDirty sets isDirty=true', () => {
    useCanvasStore.getState().markDirty();
    expect(useCanvasStore.getState().isDirty).toBe(true);
  });

  it('markSaved clears isDirty and sets lastSaved', () => {
    useCanvasStore.getState().markDirty();
    useCanvasStore.getState().markSaved();
    const s = useCanvasStore.getState();
    expect(s.isDirty).toBe(false);
    expect(s.lastSaved).toBeInstanceOf(Date);
  });

  it('setLoading updates isLoading', () => {
    useCanvasStore.getState().setLoading(true);
    expect(useCanvasStore.getState().isLoading).toBe(true);
    useCanvasStore.getState().setLoading(false);
    expect(useCanvasStore.getState().isLoading).toBe(false);
  });
});

// ── export / import ───────────────────────────────────────────────────────────

describe('exportCanvasData', () => {
  it('returns a snapshot of the current design state', () => {
    seedSurface();
    useCanvasStore.getState().setDesign('d1', 'My Design', 7);
    useCanvasStore.getState().addLayer(makeLayerInput({ name: 'Layer 1' }));
    const exported = useCanvasStore.getState().exportCanvasData();
    expect(exported.designId).toBe('d1');
    expect(exported.designName).toBe('My Design');
    expect(exported.productId).toBe(7);
    expect(exported.layersBySurface['front']).toHaveLength(1);
    expect(exported.version).toBe('1.0');
    expect(typeof exported.exportedAt).toBe('string');
  });

  it('stashes mockupTint inside canvasSize for DB round-trip', () => {
    useCanvasStore.getState().setMockupTint('#navy');
    const exported = useCanvasStore.getState().exportCanvasData();
    expect(exported.mockupTint).toBe('#navy');
    expect((exported.canvasSize as Record<string, unknown>)['mockupTint']).toBe('#navy');
  });
});

describe('importCanvasData', () => {
  it('loads layers, designId, designName, productId from ExportedDesignData', () => {
    seedSurface('front');
    const data = {
      designId: 'imported-id',
      designName: 'Imported Design',
      productId: 99,
      layersBySurface: {
        front: [
          {
            id: 'l1', type: 'text' as const, name: 'Imported Layer',
            visible: true, locked: false, opacity: 1,
            left: 10, top: 10, scaleX: 1, scaleY: 1, angle: 0,
            data: {}, zIndex: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      },
      canvasSize: { width: 600, height: 400, dpi: 72 },
      mockupTint: '#red',
      exportedAt: new Date().toISOString(),
      version: '1.0',
    };
    useCanvasStore.getState().importCanvasData(data as unknown as import('@/lib/designer/types').ExportedDesignData);
    const s = useCanvasStore.getState();
    expect(s.designId).toBe('imported-id');
    expect(s.designName).toBe('Imported Design');
    expect(s.productId).toBe(99);
    expect(s.mockupTint).toBe('#red');
    expect(s.isDirty).toBe(false);
    expect(s.layersBySurface['front']).toHaveLength(1);
    expect(s.layersBySurface['front'][0].createdAt).toBeInstanceOf(Date);
  });

  it('reads designId from DesignDoc `id` field', () => {
    seedSurface('front');
    const doc = {
      id: 'doc-id',
      name: 'Doc Name',
      productId: 5,
      layersBySurface: { front: [] },
      canvasSize: { width: 400, height: 400, dpi: 72 },
      status: 'draft' as const,
    };
    useCanvasStore.getState().importCanvasData(doc);
    expect(useCanvasStore.getState().designId).toBe('doc-id');
    expect(useCanvasStore.getState().designName).toBe('Doc Name');
  });

  it('reads stashed mockupTint from canvasSize when top-level is absent', () => {
    seedSurface('front');
    const data = {
      designId: null,
      designName: 'X',
      productId: 1,
      layersBySurface: { front: [] },
      canvasSize: { width: 400, height: 400, dpi: 72, mockupTint: '#stashed' },
      exportedAt: '',
      version: '1.0',
    };
    useCanvasStore.getState().importCanvasData(data as unknown as import('@/lib/designer/types').ExportedDesignData);
    expect(useCanvasStore.getState().mockupTint).toBe('#stashed');
  });

  it('loadDesign delegates to importCanvasData', () => {
    seedSurface('front');
    const doc = {
      id: 'ld-id',
      name: 'Load Design',
      productId: 3,
      layersBySurface: { front: [] },
      canvasSize: { width: 400, height: 400, dpi: 72 },
      status: 'draft' as const,
    };
    useCanvasStore.getState().loadDesign(doc);
    expect(useCanvasStore.getState().designId).toBe('ld-id');
  });
});

// ── getCurrentSurfaceLayers ───────────────────────────────────────────────────

describe('getCurrentSurfaceLayers', () => {
  it('returns current surface layers', () => {
    seedSurface();
    useCanvasStore.getState().addLayer(makeLayerInput({ name: 'X' }));
    const layers = useCanvasStore.getState().getCurrentSurfaceLayers();
    expect(layers).toHaveLength(1);
    expect(layers[0].name).toBe('X');
  });

  it('returns empty array when no active surface', () => {
    expect(useCanvasStore.getState().getCurrentSurfaceLayers()).toEqual([]);
  });
});

// ── setCanvas ─────────────────────────────────────────────────────────────────

describe('setCanvas', () => {
  it('stores and retrieves the canvas reference', () => {
    const fakeCanvas = { getObjects: vi.fn(() => []) } as unknown as import('fabric').Canvas;
    useCanvasStore.getState().setCanvas(fakeCanvas);
    expect(useCanvasStore.getState().canvas).toBe(fakeCanvas);
    useCanvasStore.getState().setCanvas(null);
    expect(useCanvasStore.getState().canvas).toBeNull();
  });
});
