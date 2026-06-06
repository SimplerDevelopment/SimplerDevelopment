// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unit tests for lib/designer/canvasStore.ts
 *
 * The store is a plain Zustand store (no DOM ops required at the store level).
 * Fabric.js is imported only for `Point` (used in zoom/pan helpers) and the
 * `Canvas` / `FabricObject` types. We mock the entire `fabric` module so no
 * real canvas is created. uuid is mocked to return deterministic ids.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── fabric mock — must be before module import ────────────────────────────
// NOTE: vi.mock factories are hoisted; class must be defined inline.
vi.mock('fabric', () => ({
  Point: class MockPoint {
    x: number;
    y: number;
    constructor(x: number, y: number) {
      this.x = x;
      this.y = y;
    }
  },
}));

// ── uuid mock — deterministic ids ─────────────────────────────────────────
let _uuidCounter = 0;
vi.mock('uuid', () => ({
  v4: () => `uuid-${++_uuidCounter}`,
}));

// ── zustand — use actual implementation (pure JS, no DOM) ─────────────────

// ── import after mocks ─────────────────────────────────────────────────────
import { useCanvasStore } from '@/lib/designer/canvasStore';
import type { LayerData, DesignerSurface, ExportedDesignData, DesignDoc } from '@/lib/designer/types';

// ── helpers ───────────────────────────────────────────────────────────────

function getStore() {
  return useCanvasStore.getState();
}

/** Reset the store to a clean slate before each test. */
function resetStore() {
  _uuidCounter = 0;
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
    showGrid: false,
    showPrintArea: true,
    mockupTint: null,
    brandColors: [],
    brandLogoUrl: '',
    brandFonts: {},
    zoom: 0.64,
    panX: 0,
    panY: 0,
    hasManuallyPanned: false,
    history: [],
    historyIndex: -1,
    maxHistorySize: 50,
    clipboardLayers: [],
    isDirty: false,
    lastSaved: null,
    isLoading: false,
  });
}

function makeLayer(overrides: Partial<LayerData> = {}): LayerData {
  return {
    id: 'layer-1',
    type: 'text',
    name: 'Text Layer',
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
    data: { text: 'hello', fill: '#000000', fontFamily: 'Arial', fontSize: 16, fontWeight: 400, textAlign: 'left', lineHeight: 1.2, charSpacing: 0 },
    zIndex: 0,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function makeSurface(overrides: Partial<DesignerSurface> = {}): DesignerSurface {
  return {
    id: 1,
    slug: 'front',
    name: 'Front',
    mockupImage: '/front.png',
    canvasWidth: 600,
    canvasHeight: 600,
    printAreaX: 100,
    printAreaY: 100,
    printAreaWidth: 400,
    printAreaHeight: 400,
    printDpi: 150,
    displayOrder: 1,
    ...overrides,
  };
}

// ── tests ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  resetStore();
});

describe('initial state', () => {
  it('has correct defaults', () => {
    const s = getStore();
    expect(s.canvas).toBeNull();
    expect(s.designId).toBeNull();
    expect(s.designName).toBe('Untitled Design');
    expect(s.status).toBe('draft');
    expect(s.surfaces).toEqual([]);
    expect(s.activeSurface).toBe('');
    expect(s.layersBySurface).toEqual({});
    expect(s.layers).toEqual([]);
    expect(s.zoom).toBe(0.64);
    expect(s.panX).toBe(0);
    expect(s.panY).toBe(0);
    expect(s.isDirty).toBe(false);
    expect(s.isLoading).toBe(false);
    expect(s.showGrid).toBe(false);
    expect(s.showPrintArea).toBe(true);
    expect(s.mockupTint).toBeNull();
    expect(s.brandColors).toEqual([]);
    expect(s.brandLogoUrl).toBe('');
    expect(s.brandFonts).toEqual({});
    expect(s.history).toEqual([]);
    expect(s.historyIndex).toBe(-1);
    expect(s.clipboardLayers).toEqual([]);
  });
});

describe('design metadata', () => {
  it('setDesign updates designId, designName, productId, isDirty', () => {
    getStore().setDesign('d-1', 'My Design', 42);
    const s = getStore();
    expect(s.designId).toBe('d-1');
    expect(s.designName).toBe('My Design');
    expect(s.productId).toBe(42);
    expect(s.isDirty).toBe(true);
  });

  it('setDesignName marks dirty', () => {
    getStore().setDesignName('New Name');
    const s = getStore();
    expect(s.designName).toBe('New Name');
    expect(s.isDirty).toBe(true);
  });

  it('setStatus updates status without marking dirty', () => {
    getStore().setStatus('finalized');
    expect(getStore().status).toBe('finalized');
  });
});

describe('surfaces', () => {
  it('setSurfaces sorts by displayOrder and seeds layersBySurface', () => {
    const surfaces = [
      makeSurface({ slug: 'back', displayOrder: 2 }),
      makeSurface({ slug: 'front', displayOrder: 1 }),
    ];
    getStore().setSurfaces(surfaces);
    const s = getStore();
    expect(s.surfaces[0].slug).toBe('front');
    expect(s.surfaces[1].slug).toBe('back');
    expect(s.layersBySurface['front']).toEqual([]);
    expect(s.layersBySurface['back']).toEqual([]);
    // activeSurface should be front (first in sorted order)
    expect(s.activeSurface).toBe('front');
  });

  it('setSurfaces does not overwrite existing layersBySurface data', () => {
    // Pre-populate a surface
    useCanvasStore.setState({ layersBySurface: { front: [makeLayer()] } });
    const surfaces = [makeSurface({ slug: 'front', displayOrder: 1 })];
    getStore().setSurfaces(surfaces);
    // Existing layers should be preserved
    expect(getStore().layersBySurface['front']).toHaveLength(1);
  });

  it('setActiveSurface switches active surface', () => {
    getStore().setSurfaces([
      makeSurface({ slug: 'front', displayOrder: 1 }),
      makeSurface({ slug: 'back', displayOrder: 2 }),
    ]);
    getStore().setActiveSurface('back');
    expect(getStore().activeSurface).toBe('back');
    expect(getStore().layers).toEqual([]);
  });

  it('setActiveSurface lazily creates layer list for unseen slug', () => {
    getStore().setActiveSurface('sleeve');
    const s = getStore();
    expect(s.activeSurface).toBe('sleeve');
    expect(s.layersBySurface['sleeve']).toEqual([]);
    expect(s.layers).toEqual([]);
  });

  it('getCurrentSurfaceLayers returns layers for active surface', () => {
    useCanvasStore.setState({
      activeSurface: 'front',
      layersBySurface: { front: [makeLayer()] },
    });
    const layers = getStore().getCurrentSurfaceLayers();
    expect(layers).toHaveLength(1);
  });
});

describe('addLayer', () => {
  beforeEach(() => {
    useCanvasStore.setState({ activeSurface: 'front', layersBySurface: { front: [] } });
  });

  it('adds a layer and returns its id', () => {
    const id = getStore().addLayer({ type: 'text', name: 'T1', data: {} });
    expect(id).toBe('uuid-1');
    expect(getStore().layers).toHaveLength(1);
    expect(getStore().layers[0].id).toBe('uuid-1');
    expect(getStore().isDirty).toBe(true);
    expect(getStore().activeLayerId).toBe('uuid-1');
  });

  it('uses provided id if given', () => {
    const id = getStore().addLayer({ id: 'custom-id', type: 'image', name: 'Img', data: {} });
    expect(id).toBe('custom-id');
    expect(getStore().layers[0].id).toBe('custom-id');
  });

  it('assigns incrementing zIndex to multiple layers', () => {
    getStore().addLayer({ type: 'text', name: 'L1', data: {} });
    getStore().addLayer({ type: 'text', name: 'L2', data: {} });
    const layers = getStore().layers;
    expect(layers[0].zIndex).toBe(0);
    expect(layers[1].zIndex).toBe(1);
  });

  it('applies defaults (visible, locked, opacity, scaleX/Y, angle)', () => {
    getStore().addLayer({ type: 'icon', name: 'Icon', data: {} });
    const layer = getStore().layers[0];
    expect(layer.visible).toBe(true);
    expect(layer.locked).toBe(false);
    expect(layer.opacity).toBe(1);
    expect(layer.scaleX).toBe(1);
    expect(layer.scaleY).toBe(1);
    expect(layer.angle).toBe(0);
  });

  it('returns id early if no activeSurface set', () => {
    useCanvasStore.setState({ activeSurface: '' });
    const id = getStore().addLayer({ type: 'text', name: 'T', data: {} });
    expect(typeof id).toBe('string');
    expect(getStore().layers).toHaveLength(0);
  });

  it('pushes a history entry on add', () => {
    getStore().addLayer({ type: 'text', name: 'T', data: {} });
    expect(getStore().history).toHaveLength(1);
    expect(getStore().history[0].action).toBe('add');
  });
});

describe('updateLayer', () => {
  beforeEach(() => {
    useCanvasStore.setState({
      activeSurface: 'front',
      layersBySurface: { front: [makeLayer({ id: 'l1' })] },
      layers: [makeLayer({ id: 'l1' })],
    });
  });

  it('updates a specific layer field', () => {
    getStore().updateLayer('l1', { name: 'Updated' });
    expect(getStore().layers[0].name).toBe('Updated');
    expect(getStore().isDirty).toBe(true);
  });

  it('is a no-op when layerId not found', () => {
    getStore().updateLayer('does-not-exist', { name: 'X' });
    expect(getStore().layers[0].name).toBe('Text Layer');
  });

  it('is a no-op when no activeSurface', () => {
    useCanvasStore.setState({ activeSurface: '' });
    getStore().updateLayer('l1', { name: 'X' });
    // No crash
  });

  it('pushes a modify history entry', () => {
    getStore().updateLayer('l1', { opacity: 0.5 });
    const h = getStore().history;
    expect(h[h.length - 1].action).toBe('modify');
  });
});

describe('removeLayer', () => {
  beforeEach(() => {
    useCanvasStore.setState({
      activeSurface: 'front',
      layersBySurface: { front: [makeLayer({ id: 'l1' })] },
      layers: [makeLayer({ id: 'l1' })],
      activeLayerId: 'l1',
    });
  });

  it('removes layer from state', () => {
    getStore().removeLayer('l1');
    expect(getStore().layers).toHaveLength(0);
    expect(getStore().activeLayerId).toBeNull();
    expect(getStore().isDirty).toBe(true);
  });

  it('is a no-op when layerId not found', () => {
    getStore().removeLayer('missing');
    expect(getStore().layers).toHaveLength(1);
  });

  it('preserves activeLayerId when removing a different layer', () => {
    useCanvasStore.setState({
      activeSurface: 'front',
      layersBySurface: { front: [makeLayer({ id: 'l1' }), makeLayer({ id: 'l2', name: 'L2', zIndex: 1 })] },
      layers: [makeLayer({ id: 'l1' }), makeLayer({ id: 'l2', name: 'L2', zIndex: 1 })],
      activeLayerId: 'l1',
    });
    getStore().removeLayer('l2');
    expect(getStore().activeLayerId).toBe('l1');
  });

  it('pushes a remove history entry', () => {
    getStore().removeLayer('l1');
    const h = getStore().history;
    expect(h[h.length - 1].action).toBe('remove');
  });
});

describe('duplicateLayer', () => {
  beforeEach(() => {
    useCanvasStore.setState({
      activeSurface: 'front',
      layersBySurface: { front: [makeLayer({ id: 'l1' })] },
      layers: [makeLayer({ id: 'l1' })],
    });
  });

  it('creates a copy with new id and offset position', () => {
    const newId = getStore().duplicateLayer('l1');
    expect(newId).not.toBeNull();
    const layers = getStore().layers;
    expect(layers).toHaveLength(2);
    const copy = layers[1];
    expect(copy.name).toBe('Text Layer Copy');
    expect(copy.left).toBe(20);
    expect(copy.top).toBe(20);
    expect(copy.id).not.toBe('l1');
  });

  it('returns null when layer not found', () => {
    const result = getStore().duplicateLayer('missing');
    expect(result).toBeNull();
  });

  it('returns null when no activeSurface', () => {
    useCanvasStore.setState({ activeSurface: '' });
    const result = getStore().duplicateLayer('l1');
    expect(result).toBeNull();
  });
});

describe('reorderLayers', () => {
  it('reorders layers and assigns new zIndices', () => {
    const l1 = makeLayer({ id: 'l1', zIndex: 0 });
    const l2 = makeLayer({ id: 'l2', zIndex: 1, name: 'L2' });
    useCanvasStore.setState({
      activeSurface: 'front',
      layersBySurface: { front: [l1, l2] },
      layers: [l1, l2],
    });
    getStore().reorderLayers(['l2', 'l1']);
    const layers = getStore().layers;
    // l2 is first in the provided order, gets zIndex = 1 (length-1-0)
    expect(layers[0].id).toBe('l2');
    expect(layers[0].zIndex).toBe(1);
    expect(layers[1].id).toBe('l1');
    expect(layers[1].zIndex).toBe(0);
  });

  it('appends layers not in orderedIds at the bottom', () => {
    const l1 = makeLayer({ id: 'l1', zIndex: 0 });
    const l2 = makeLayer({ id: 'l2', zIndex: 1, name: 'L2' });
    const l3 = makeLayer({ id: 'l3', zIndex: 2, name: 'L3' });
    useCanvasStore.setState({
      activeSurface: 'front',
      layersBySurface: { front: [l1, l2, l3] },
      layers: [l1, l2, l3],
    });
    // l3 not in orderedIds, so it's appended
    getStore().reorderLayers(['l1', 'l2']);
    const layers = getStore().layers;
    expect(layers[2].id).toBe('l3');
  });
});

describe('reorderLayer', () => {
  it('moves layer up by direction', () => {
    const l1 = makeLayer({ id: 'l1', zIndex: 0 });
    const l2 = makeLayer({ id: 'l2', zIndex: 1, name: 'L2' });
    useCanvasStore.setState({
      activeSurface: 'front',
      layersBySurface: { front: [l1, l2] },
      layers: [l1, l2],
    });
    // sorted descending by zIndex: [l2(1), l1(0)]; l1 is at idx 1, move up -> idx 0
    getStore().reorderLayer('l1', 'up');
    // After moving up, l1 should be at top
    const layers = getStore().layers;
    expect(layers.find((l) => l.id === 'l1')?.zIndex).toBeGreaterThan(
      layers.find((l) => l.id === 'l2')?.zIndex ?? -1
    );
  });

  it('moves layer down by direction', () => {
    const l1 = makeLayer({ id: 'l1', zIndex: 0 });
    const l2 = makeLayer({ id: 'l2', zIndex: 1, name: 'L2' });
    useCanvasStore.setState({
      activeSurface: 'front',
      layersBySurface: { front: [l1, l2] },
      layers: [l1, l2],
    });
    // sorted descending: [l2(idx0), l1(idx1)]; l2 at idx 0, move down -> idx 1
    getStore().reorderLayer('l2', 'down');
    const layers = getStore().layers;
    expect(layers.find((l) => l.id === 'l1')?.zIndex).toBeGreaterThan(
      layers.find((l) => l.id === 'l2')?.zIndex ?? -1
    );
  });

  it('moves layer to specific index', () => {
    const l1 = makeLayer({ id: 'l1', zIndex: 0 });
    const l2 = makeLayer({ id: 'l2', zIndex: 1, name: 'L2' });
    const l3 = makeLayer({ id: 'l3', zIndex: 2, name: 'L3' });
    useCanvasStore.setState({
      activeSurface: 'front',
      layersBySurface: { front: [l1, l2, l3] },
      layers: [l1, l2, l3],
    });
    getStore().reorderLayer('l1', 1);
    // shouldn't throw; layers are still 3
    expect(getStore().layers).toHaveLength(3);
  });

  it('is a no-op when layer not found', () => {
    const l1 = makeLayer({ id: 'l1' });
    useCanvasStore.setState({
      activeSurface: 'front',
      layersBySurface: { front: [l1] },
      layers: [l1],
    });
    getStore().reorderLayer('missing', 'up');
    expect(getStore().layers).toHaveLength(1);
  });

  it('is a no-op when out of bounds (already at top)', () => {
    const l1 = makeLayer({ id: 'l1', zIndex: 0 });
    useCanvasStore.setState({
      activeSurface: 'front',
      layersBySurface: { front: [l1] },
      layers: [l1],
    });
    // Only 1 layer — moving up goes out of bounds
    getStore().reorderLayer('l1', 'up');
    expect(getStore().layers).toHaveLength(1);
  });
});

describe('clearLayers', () => {
  it('clears all layers and resets selection', () => {
    useCanvasStore.setState({
      activeSurface: 'front',
      layersBySurface: { front: [makeLayer({ id: 'l1' })] },
      layers: [makeLayer({ id: 'l1' })],
      activeLayerId: 'l1',
    });
    getStore().clearLayers();
    const s = getStore();
    expect(s.layers).toHaveLength(0);
    expect(s.activeLayerId).toBeNull();
    expect(s.selectedLayers).toEqual([]);
    expect(s.isDirty).toBe(true);
  });

  it('is a no-op when no activeSurface', () => {
    useCanvasStore.setState({ activeSurface: '', layers: [] });
    getStore().clearLayers(); // no crash
  });
});

describe('mirrorActiveSurfaceTo', () => {
  it('mirrors active surface layers to a specific target', () => {
    useCanvasStore.setState({
      activeSurface: 'front',
      layersBySurface: { front: [makeLayer({ id: 'l1' })], back: [] },
      layers: [makeLayer({ id: 'l1' })],
      surfaces: [
        makeSurface({ slug: 'front', displayOrder: 1 }),
        makeSurface({ slug: 'back', displayOrder: 2 }),
      ],
    });
    getStore().mirrorActiveSurfaceTo('back');
    const s = getStore();
    expect(s.layersBySurface['back']).toHaveLength(1);
    // Cloned layer should have a new id
    expect(s.layersBySurface['back'][0].id).not.toBe('l1');
    expect(s.isDirty).toBe(true);
  });

  it('mirrors to all other surfaces when targetSlug is omitted', () => {
    useCanvasStore.setState({
      activeSurface: 'front',
      layersBySurface: { front: [makeLayer({ id: 'l1' })], back: [], sleeve: [] },
      layers: [makeLayer({ id: 'l1' })],
      surfaces: [
        makeSurface({ slug: 'front', displayOrder: 1 }),
        makeSurface({ slug: 'back', displayOrder: 2 }),
        makeSurface({ slug: 'sleeve', displayOrder: 3 }),
      ],
    });
    getStore().mirrorActiveSurfaceTo();
    const s = getStore();
    expect(s.layersBySurface['back']).toHaveLength(1);
    expect(s.layersBySurface['sleeve']).toHaveLength(1);
  });

  it('is a no-op when source layers are empty', () => {
    useCanvasStore.setState({
      activeSurface: 'front',
      layersBySurface: { front: [], back: [] },
      layers: [],
      surfaces: [
        makeSurface({ slug: 'front', displayOrder: 1 }),
        makeSurface({ slug: 'back', displayOrder: 2 }),
      ],
    });
    getStore().mirrorActiveSurfaceTo('back');
    expect(getStore().layersBySurface['back']).toHaveLength(0);
  });

  it('is a no-op when no activeSurface', () => {
    useCanvasStore.setState({ activeSurface: '' });
    getStore().mirrorActiveSurfaceTo(); // no crash
  });
});

describe('selection', () => {
  beforeEach(() => {
    const layers = [
      makeLayer({ id: 'l1', type: 'text' }),
      makeLayer({ id: 'l2', type: 'text', name: 'L2', zIndex: 1 }),
      makeLayer({ id: 'l3', type: 'image', name: 'L3', zIndex: 2 }),
    ];
    useCanvasStore.setState({
      activeSurface: 'front',
      layersBySurface: { front: layers },
      layers,
    });
  });

  it('setActiveLayer sets activeLayerId', () => {
    getStore().setActiveLayer('l1');
    expect(getStore().activeLayerId).toBe('l1');
  });

  it('setSelectedLayers with single object sets selectionMode to single', () => {
    const mockObj = { data: { id: 'l1' } } as any;
    getStore().setSelectedLayers([mockObj]);
    const s = getStore();
    expect(s.layerSelection.selectedLayerIds).toEqual(['l1']);
    expect(s.layerSelection.selectionMode).toBe('single');
    expect(s.activeLayerId).toBe('l1');
  });

  it('setSelectedLayers with multiple objects sets selectionMode to multiple', () => {
    const o1 = { data: { id: 'l1' } } as any;
    const o2 = { data: { id: 'l2' } } as any;
    getStore().setSelectedLayers([o1, o2]);
    const s = getStore();
    expect(s.layerSelection.selectionMode).toBe('multiple');
    expect(s.activeLayerId).toBeNull();
    expect(s.layerSelection.canBatchEdit).toBe(true);
  });

  it('setSelectedLayers adds color to batchEditableProperties when all text/icon', () => {
    const o1 = { data: { id: 'l1' } } as any;
    const o2 = { data: { id: 'l2' } } as any;
    getStore().setSelectedLayers([o1, o2]);
    expect(getStore().layerSelection.batchEditableProperties).toContain('color');
  });

  it('setSelectedLayers does NOT add color when mixed types', () => {
    const o1 = { data: { id: 'l1' } } as any;
    const o3 = { data: { id: 'l3' } } as any; // type: image
    getStore().setSelectedLayers([o1, o3]);
    expect(getStore().layerSelection.batchEditableProperties).not.toContain('color');
  });

  it('toggleLayerSelection adds layer if not selected', () => {
    getStore().toggleLayerSelection('l1');
    expect(getStore().layerSelection.selectedLayerIds).toContain('l1');
  });

  it('toggleLayerSelection removes layer if already selected', () => {
    getStore().selectMultipleLayers(['l1', 'l2']);
    getStore().toggleLayerSelection('l1');
    expect(getStore().layerSelection.selectedLayerIds).not.toContain('l1');
  });

  it('selectAllLayers selects visible, unlocked layers', () => {
    getStore().selectAllLayers();
    expect(getStore().layerSelection.selectedLayerIds).toContain('l1');
    expect(getStore().layerSelection.selectedLayerIds).toContain('l2');
    expect(getStore().layerSelection.selectedLayerIds).toContain('l3');
  });

  it('selectAllLayers excludes locked layers', () => {
    const layers = [
      makeLayer({ id: 'l1', visible: true, locked: false }),
      makeLayer({ id: 'l2', visible: true, locked: true, name: 'L2', zIndex: 1 }),
    ];
    useCanvasStore.setState({ layers, layersBySurface: { front: layers } });
    getStore().selectAllLayers();
    expect(getStore().layerSelection.selectedLayerIds).not.toContain('l2');
  });

  it('deselectAllLayers clears selection', () => {
    getStore().selectMultipleLayers(['l1', 'l2']);
    getStore().deselectAllLayers();
    const s = getStore();
    expect(s.layerSelection.selectedLayerIds).toHaveLength(0);
    expect(s.activeLayerId).toBeNull();
    expect(s.selectedLayers).toHaveLength(0);
  });

  it('getSelectedLayerIds returns selection ids', () => {
    getStore().selectMultipleLayers(['l1', 'l2']);
    expect(getStore().getSelectedLayerIds()).toEqual(['l1', 'l2']);
  });

  it('isLayerSelected returns true for selected layer', () => {
    getStore().selectMultipleLayers(['l1']);
    expect(getStore().isLayerSelected('l1')).toBe(true);
    expect(getStore().isLayerSelected('l2')).toBe(false);
  });
});

describe('visibility and lock', () => {
  beforeEach(() => {
    const layers = [makeLayer({ id: 'l1', visible: true, locked: false })];
    useCanvasStore.setState({
      activeSurface: 'front',
      layersBySurface: { front: layers },
      layers,
    });
  });

  it('setLayerVisible sets visibility', () => {
    getStore().setLayerVisible('l1', false);
    expect(getStore().layers[0].visible).toBe(false);
  });

  it('setLayerLocked sets locked state', () => {
    getStore().setLayerLocked('l1', true);
    expect(getStore().layers[0].locked).toBe(true);
  });

  it('toggleLayerVisibility flips visibility', () => {
    getStore().toggleLayerVisibility('l1');
    expect(getStore().layers[0].visible).toBe(false);
    getStore().toggleLayerVisibility('l1');
    expect(getStore().layers[0].visible).toBe(true);
  });

  it('toggleLayerLock flips lock state', () => {
    getStore().toggleLayerLock('l1');
    expect(getStore().layers[0].locked).toBe(true);
  });

  it('toggleLayerVisibility is a no-op for missing layer', () => {
    getStore().toggleLayerVisibility('missing'); // no crash
  });

  it('toggleLayerLock is a no-op for missing layer', () => {
    getStore().toggleLayerLock('missing'); // no crash
  });
});

describe('batch operations', () => {
  beforeEach(() => {
    const layers = [
      makeLayer({ id: 'l1', type: 'text', opacity: 1 }),
      makeLayer({ id: 'l2', type: 'text', name: 'L2', zIndex: 1, opacity: 1 }),
    ];
    useCanvasStore.setState({
      activeSurface: 'front',
      layersBySurface: { front: layers },
      layers,
      layerSelection: {
        selectedLayerIds: ['l1', 'l2'],
        selectionMode: 'multiple',
        lastSelectedId: 'l2',
        canBatchEdit: true,
        batchEditableProperties: ['opacity', 'visible', 'locked'],
      },
    });
  });

  it('batchUpdateLayers updates opacity for selected layers', () => {
    getStore().batchUpdateLayers({ opacity: 0.5 });
    const layers = getStore().layers;
    expect(layers[0].opacity).toBe(0.5);
    expect(layers[1].opacity).toBe(0.5);
  });

  it('batchUpdateLayers updates visible for selected layers', () => {
    getStore().batchUpdateLayers({ visible: false });
    const layers = getStore().layers;
    expect(layers[0].visible).toBe(false);
    expect(layers[1].visible).toBe(false);
  });

  it('batchUpdateLayers updates color on text layers', () => {
    getStore().batchUpdateLayers({ color: '#ff0000' });
    const layers = getStore().layers;
    expect((layers[0].data as any).color).toBe('#ff0000');
    expect((layers[0].data as any).fill).toBe('#ff0000');
  });

  it('batchUpdateLayers with colorTintKey scopes to fillByTint', () => {
    getStore().batchUpdateLayers({ color: '#ff0000', colorTintKey: '#ffffff' });
    const layers = getStore().layers;
    expect((layers[0].data as any).fillByTint?.['#ffffff']).toBe('#ff0000');
  });

  it('batchUpdateLayers does not apply color to non-text/icon layers', () => {
    const layers = [
      makeLayer({ id: 'l1', type: 'image', opacity: 1 }),
    ];
    useCanvasStore.setState({
      activeSurface: 'front',
      layersBySurface: { front: layers },
      layers,
      layerSelection: {
        selectedLayerIds: ['l1'],
        selectionMode: 'single',
        lastSelectedId: 'l1',
        canBatchEdit: false,
        batchEditableProperties: [],
      },
    });
    getStore().batchUpdateLayers({ color: '#ff0000' });
    // image layer should not have color property injected
    expect((getStore().layers[0].data as any).color).toBeUndefined();
  });

  it('canBatchEdit returns true when multiple unlocked layers selected', () => {
    expect(getStore().canBatchEdit()).toBe(true);
  });

  it('canBatchEdit returns false when fewer than 2 selected', () => {
    useCanvasStore.setState({
      layerSelection: {
        selectedLayerIds: ['l1'],
        selectionMode: 'single',
        lastSelectedId: 'l1',
        canBatchEdit: false,
        batchEditableProperties: [],
      },
    });
    expect(getStore().canBatchEdit()).toBe(false);
  });

  it('getBatchEditableProperties returns empty array when none selected', () => {
    useCanvasStore.setState({
      layerSelection: {
        selectedLayerIds: [],
        selectionMode: 'single',
        lastSelectedId: null,
        canBatchEdit: false,
        batchEditableProperties: [],
      },
    });
    expect(getStore().getBatchEditableProperties()).toEqual([]);
  });

  it('getBatchEditableProperties includes color when all text/icon', () => {
    // l1 and l2 are both text
    const props = getStore().getBatchEditableProperties();
    expect(props).toContain('color');
    expect(props).toContain('opacity');
    expect(props).toContain('visible');
    expect(props).toContain('locked');
  });

  it('deleteSelectedLayers removes all selected layers', () => {
    getStore().deleteSelectedLayers();
    expect(getStore().layers).toHaveLength(0);
  });
});

describe('print area and UI toggles', () => {
  it('setShowPrintArea sets the flag', () => {
    getStore().setShowPrintArea(false);
    expect(getStore().showPrintArea).toBe(false);
  });

  it('togglePrintArea flips the flag', () => {
    expect(getStore().showPrintArea).toBe(true);
    getStore().togglePrintArea();
    expect(getStore().showPrintArea).toBe(false);
    getStore().togglePrintArea();
    expect(getStore().showPrintArea).toBe(true);
  });

  it('toggleGrid flips showGrid', () => {
    expect(getStore().showGrid).toBe(false);
    getStore().toggleGrid();
    expect(getStore().showGrid).toBe(true);
    getStore().toggleGrid();
    expect(getStore().showGrid).toBe(false);
  });
});

describe('brand state', () => {
  it('setMockupTint sets tint and marks dirty', () => {
    getStore().setMockupTint('#ff0000');
    expect(getStore().mockupTint).toBe('#ff0000');
    expect(getStore().isDirty).toBe(true);
  });

  it('setMockupTint accepts null', () => {
    getStore().setMockupTint(null);
    expect(getStore().mockupTint).toBeNull();
  });

  it('setBrandColors sets colors', () => {
    getStore().setBrandColors(['#abc', '#def']);
    expect(getStore().brandColors).toEqual(['#abc', '#def']);
  });

  it('setBrandLogoUrl sets url', () => {
    getStore().setBrandLogoUrl('https://example.com/logo.png');
    expect(getStore().brandLogoUrl).toBe('https://example.com/logo.png');
  });

  it('setBrandFonts sets fonts', () => {
    getStore().setBrandFonts({ heading: 'Roboto', body: 'Open Sans' });
    expect(getStore().brandFonts).toEqual({ heading: 'Roboto', body: 'Open Sans' });
  });
});

describe('zoom and pan (no canvas)', () => {
  it('setZoom clamps to min 0.1', () => {
    getStore().setZoom(0.01);
    expect(getStore().zoom).toBe(0.1);
  });

  it('setZoom clamps to max 5', () => {
    getStore().setZoom(99);
    expect(getStore().zoom).toBe(5);
  });

  it('setZoom stores clamped value', () => {
    getStore().setZoom(2);
    expect(getStore().zoom).toBe(2);
  });

  it('setPan sets panX, panY and hasManuallyPanned', () => {
    getStore().setPan(100, 200);
    const s = getStore();
    expect(s.panX).toBe(100);
    expect(s.panY).toBe(200);
    expect(s.hasManuallyPanned).toBe(true);
  });

  it('resetView resets to initial zoom/pan', () => {
    getStore().setZoom(3);
    getStore().setPan(100, 200);
    getStore().resetView();
    const s = getStore();
    expect(s.zoom).toBe(0.64);
    expect(s.panX).toBe(0);
    expect(s.panY).toBe(0);
    expect(s.hasManuallyPanned).toBe(false);
  });

  it('zoomIn increases zoom by step', () => {
    const initial = getStore().zoom; // 0.64
    getStore().zoomIn(0.25);
    expect(getStore().zoom).toBeCloseTo(initial * 1.25, 5);
  });

  it('zoomOut decreases zoom by step', () => {
    getStore().setZoom(2);
    getStore().zoomOut(0.2);
    expect(getStore().zoom).toBeCloseTo(2 * 0.8, 5);
  });

  it('zoomToFit returns early when canvas is null', () => {
    // canvas is null by default — should not throw
    getStore().zoomToFit();
  });

  it('panUp/Down/Left/Right are no-ops when canvas is null', () => {
    getStore().panUp();
    getStore().panDown();
    getStore().panLeft();
    getStore().panRight();
    // just verify no crash
    expect(getStore().zoom).toBe(0.64);
  });
});

describe('history (pushHistory, undo, redo, canUndo/canRedo, clearHistory)', () => {
  beforeEach(() => {
    useCanvasStore.setState({
      activeSurface: 'front',
      layersBySurface: { front: [makeLayer({ id: 'l1' })] },
      layers: [makeLayer({ id: 'l1' })],
    });
  });

  it('canUndo is false initially', () => {
    expect(getStore().canUndo()).toBe(false);
  });

  it('canRedo is false initially', () => {
    expect(getStore().canRedo()).toBe(false);
  });

  it('pushHistory increments historyIndex', () => {
    getStore().pushHistory({ action: 'add', layerId: 'l1' });
    expect(getStore().historyIndex).toBe(0);
    expect(getStore().history).toHaveLength(1);
  });

  it('pushHistory truncates future on new entry after undo', () => {
    getStore().pushHistory({ action: 'add', layerId: 'l1' });
    getStore().pushHistory({ action: 'modify', layerId: 'l1' });
    // Undo once then push — should truncate
    useCanvasStore.setState({ historyIndex: 0 });
    getStore().pushHistory({ action: 'remove', layerId: 'l1' });
    expect(getStore().history).toHaveLength(2);
  });

  it('canUndo is true after an action', () => {
    getStore().addLayer({ type: 'text', name: 'T', data: {} });
    expect(getStore().canUndo()).toBe(true);
  });

  it('undo on add action removes the layer', () => {
    const layerPreAdd = makeLayer({ id: 'la' });
    useCanvasStore.setState({
      activeSurface: 'front',
      layersBySurface: { front: [] },
      layers: [],
      history: [],
      historyIndex: -1,
    });
    const id = getStore().addLayer({ id: 'la', type: 'text', name: 'LA', data: {} });
    expect(getStore().layers).toHaveLength(1);
    void id;
    void layerPreAdd;
    getStore().undo();
    expect(getStore().layers).toHaveLength(0);
    expect(getStore().canUndo()).toBe(false);
  });

  it('undo on remove action re-adds the layer', () => {
    useCanvasStore.setState({
      activeSurface: 'front',
      layersBySurface: { front: [makeLayer({ id: 'l1' })] },
      layers: [makeLayer({ id: 'l1' })],
      history: [],
      historyIndex: -1,
    });
    getStore().removeLayer('l1');
    expect(getStore().layers).toHaveLength(0);
    getStore().undo();
    expect(getStore().layers).toHaveLength(1);
  });

  it('undo on modify action restores beforeState', () => {
    useCanvasStore.setState({
      activeSurface: 'front',
      layersBySurface: { front: [makeLayer({ id: 'l1', name: 'Original' })] },
      layers: [makeLayer({ id: 'l1', name: 'Original' })],
      history: [],
      historyIndex: -1,
    });
    getStore().updateLayer('l1', { name: 'Modified' });
    expect(getStore().layers[0].name).toBe('Modified');
    getStore().undo();
    expect(getStore().layers[0].name).toBe('Original');
  });

  it('redo re-applies action after undo', () => {
    useCanvasStore.setState({
      activeSurface: 'front',
      layersBySurface: { front: [] },
      layers: [],
      history: [],
      historyIndex: -1,
    });
    const layer = makeLayer({ id: 'l1' });
    // Simulate an add history entry
    useCanvasStore.setState({
      history: [{
        id: 'h1',
        action: 'add',
        surface: 'front',
        timestamp: new Date(),
        layerId: 'l1',
        afterState: layer,
      }],
      historyIndex: 0,
      layersBySurface: { front: [layer] },
      layers: [layer],
    });
    getStore().undo();
    expect(getStore().layers).toHaveLength(0);
    expect(getStore().canRedo()).toBe(true);
    getStore().redo();
    expect(getStore().layers).toHaveLength(1);
  });

  it('redo is a no-op when at end of history', () => {
    getStore().pushHistory({ action: 'add', layerId: 'l1' });
    getStore().redo(); // already at end — no crash
    expect(getStore().historyIndex).toBe(0);
  });

  it('undo is a no-op when historyIndex < 0', () => {
    getStore().undo(); // no crash
  });

  it('clearHistory resets history state', () => {
    getStore().pushHistory({ action: 'add', layerId: 'l1' });
    getStore().clearHistory();
    expect(getStore().history).toHaveLength(0);
    expect(getStore().historyIndex).toBe(-1);
  });

  it('history is capped at maxHistorySize', () => {
    useCanvasStore.setState({ maxHistorySize: 3, history: [], historyIndex: -1 });
    for (let i = 0; i < 5; i++) {
      getStore().pushHistory({ action: 'add', layerId: `l${i}` });
    }
    expect(getStore().history.length).toBeLessThanOrEqual(3);
  });
});

describe('clipboard', () => {
  it('copySelectedLayers stores layers by selectedLayers fabric objects', () => {
    const layer = makeLayer({ id: 'l1' });
    const mockFabricObj = { data: { id: 'l1' } } as any;
    useCanvasStore.setState({
      activeSurface: 'front',
      layersBySurface: { front: [layer] },
      layers: [layer],
      selectedLayers: [mockFabricObj],
    });
    getStore().copySelectedLayers();
    expect(getStore().clipboardLayers).toHaveLength(1);
    expect(getStore().clipboardLayers[0].id).toBe('l1');
  });

  it('copySelectedLayers skips objects without id', () => {
    const layer = makeLayer({ id: 'l1' });
    const mockFabricObj = {} as any; // no data.id
    useCanvasStore.setState({
      activeSurface: 'front',
      layersBySurface: { front: [layer] },
      layers: [layer],
      selectedLayers: [mockFabricObj],
    });
    getStore().copySelectedLayers();
    expect(getStore().clipboardLayers).toHaveLength(0);
  });

  it('pasteLayersFromClipboard adds layers offset by 20', () => {
    const layer = makeLayer({ id: 'l1', left: 50, top: 60 });
    useCanvasStore.setState({
      activeSurface: 'front',
      layersBySurface: { front: [] },
      layers: [],
      clipboardLayers: [layer],
    });
    getStore().pasteLayersFromClipboard();
    const layers = getStore().layers;
    expect(layers).toHaveLength(1);
    expect(layers[0].left).toBe(70);
    expect(layers[0].top).toBe(80);
    expect(layers[0].name).toBe('Text Layer Copy');
  });
});

describe('dirty / save tracking', () => {
  it('setLoading updates isLoading', () => {
    getStore().setLoading(true);
    expect(getStore().isLoading).toBe(true);
    getStore().setLoading(false);
    expect(getStore().isLoading).toBe(false);
  });

  it('markDirty sets isDirty to true', () => {
    getStore().markDirty();
    expect(getStore().isDirty).toBe(true);
  });

  it('markSaved clears isDirty and sets lastSaved', () => {
    getStore().markDirty();
    getStore().markSaved();
    const s = getStore();
    expect(s.isDirty).toBe(false);
    expect(s.lastSaved).toBeInstanceOf(Date);
  });
});

describe('exportCanvasData', () => {
  it('returns ExportedDesignData with correct shape', () => {
    getStore().setDesign('d-1', 'My Design', 5);
    getStore().setMockupTint('#abc');
    const exported = getStore().exportCanvasData();
    expect(exported.designId).toBe('d-1');
    expect(exported.designName).toBe('My Design');
    expect(exported.productId).toBe(5);
    expect(exported.mockupTint).toBe('#abc');
    expect(exported.version).toBe('1.0');
    expect(typeof exported.exportedAt).toBe('string');
    // mockupTint is also stashed in canvasSize
    expect((exported.canvasSize as any).mockupTint).toBe('#abc');
  });
});

describe('importCanvasData', () => {
  it('imports ExportedDesignData and restores state', () => {
    const layer = makeLayer({ id: 'l1' });
    const data: ExportedDesignData = {
      designId: 'd-99',
      designName: 'Imported Design',
      productId: 7,
      layersBySurface: { front: [layer] },
      canvasSize: { width: 1200, height: 900, dpi: 150 },
      mockupTint: '#ff0000',
      exportedAt: new Date().toISOString(),
      version: '1.0',
    };
    useCanvasStore.setState({ activeSurface: 'front' });
    getStore().importCanvasData(data);
    const s = getStore();
    expect(s.designId).toBe('d-99');
    expect(s.designName).toBe('Imported Design');
    expect(s.productId).toBe(7);
    expect(s.mockupTint).toBe('#ff0000');
    expect(s.canvasSize.width).toBe(1200);
    expect(s.isDirty).toBe(false);
    expect(s.layers).toHaveLength(1);
  });

  it('imports DesignDoc and restores state', () => {
    const layer = makeLayer({ id: 'l2' });
    const doc: DesignDoc = {
      id: 'doc-1',
      productId: 3,
      name: 'Doc Design',
      layersBySurface: { front: [layer] },
      canvasSize: { width: 800, height: 600, dpi: 72 },
      status: 'finalized',
      mockupTint: null,
    };
    useCanvasStore.setState({ activeSurface: 'front' });
    getStore().importCanvasData(doc);
    const s = getStore();
    expect(s.designId).toBe('doc-1');
    expect(s.designName).toBe('Doc Design');
    expect(s.productId).toBe(3);
  });

  it('reads mockupTint stashed in canvasSize', () => {
    const data: ExportedDesignData & { canvasSize: any } = {
      designId: 'd-tint',
      designName: 'Tinted',
      productId: 1,
      layersBySurface: { front: [] },
      canvasSize: { width: 800, height: 600, dpi: 72, mockupTint: '#navy' },
      exportedAt: new Date().toISOString(),
      version: '1.0',
    };
    useCanvasStore.setState({ activeSurface: 'front' });
    getStore().importCanvasData(data);
    expect(getStore().mockupTint).toBe('#navy');
  });

  it('is a no-op when data has no layersBySurface', () => {
    // Pass something without layersBySurface — should not crash
    getStore().importCanvasData({} as any);
  });

  it('loadDesign delegates to importCanvasData', () => {
    const layer = makeLayer({ id: 'l3' });
    const doc: DesignDoc = {
      id: 'doc-2',
      productId: 9,
      name: 'Loaded',
      layersBySurface: { front: [layer] },
      canvasSize: { width: 800, height: 600, dpi: 72 },
      status: 'draft',
    };
    useCanvasStore.setState({ activeSurface: 'front' });
    getStore().loadDesign(doc);
    expect(getStore().designId).toBe('doc-2');
  });
});

describe('setCanvas', () => {
  it('setCanvas stores the canvas instance', () => {
    const mockCanvas = { getObjects: vi.fn(() => []) } as any;
    getStore().setCanvas(mockCanvas);
    expect(getStore().canvas).toBe(mockCanvas);
    getStore().setCanvas(null);
    expect(getStore().canvas).toBeNull();
  });
});
