// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unit tests for `components/storefront/designer/LayersPanel.tsx`.
 *
 * Strategy:
 *   - Mock `@/lib/designer/canvasStore` with a selector-function pattern
 *     (same approach as designer-use-keyboard-shortcuts.test.tsx).
 *   - Mock `@dnd-kit/*` so drag-reorder infrastructure renders without a real
 *     pointer environment — DndContext/SortableContext become pass-throughs and
 *     useSortable returns a no-op style object.
 *   - Mock `fabric` to prevent Point import from blowing up in jsdom.
 *   - Mock `@/lib/designer/fillResolver` and `@/lib/designer/printAreaCheck`
 *     with simple implementations.
 *   - Tests cover: empty state, layer list rendering, filter input, selection
 *     callbacks, visibility/lock/delete/duplicate buttons, clear-all, print-
 *     area warning banner, per-tint override indicator, context-menu, name
 *     editing, and the "Add layer" button.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// fabric stub (prevents Point import crash)
// ---------------------------------------------------------------------------
vi.mock('fabric', () => ({
  Point: class Point {
    x: number;
    y: number;
    constructor(x: number, y: number) { this.x = x; this.y = y; }
  },
  Canvas: class Canvas {},
}));

// ---------------------------------------------------------------------------
// @dnd-kit stubs — render children as-is, return no-op drag state
// ---------------------------------------------------------------------------
vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PointerSensor: class {},
  KeyboardSensor: class {},
  useSensor: () => ({}),
  useSensors: (...args: any[]) => args,
  closestCenter: () => null,
}));

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  arrayMove: (arr: any[], from: number, to: number) => {
    const next = [...arr];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
  },
  sortableKeyboardCoordinates: () => ({ x: 0, y: 0 }),
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => {},
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
  verticalListSortingStrategy: {},
}));

vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => '' } },
}));

// ---------------------------------------------------------------------------
// printAreaCheck stub — all layers are 'inside' by default
// ---------------------------------------------------------------------------
vi.mock('@/lib/designer/printAreaCheck', () => ({
  classifyLayerPrintArea: vi.fn(() => 'inside' as const),
  computeFixOverflowPosition: vi.fn(() => null),
  countLayersOutsidePrintArea: vi.fn(() => ({ partial: 0, outside: 0 })),
}));

// ---------------------------------------------------------------------------
// fillResolver stub
// ---------------------------------------------------------------------------
vi.mock('@/lib/designer/fillResolver', () => ({
  tintKey: (tint: string | null | undefined) => (tint ? tint.toLowerCase() : 'none'),
}));

// ---------------------------------------------------------------------------
// canvasStore mock — mutable object, selector pattern
// ---------------------------------------------------------------------------
const mockStore = {
  canvas: null as any,
  layers: [] as any[],
  layerSelection: { selectionMode: 'single' as 'single' | 'multiple', selectedLayerIds: [] as string[] },
  activeLayerId: null as string | null,
  setActiveLayer: vi.fn(),
  removeLayer: vi.fn(),
  duplicateLayer: vi.fn(),
  toggleLayerVisibility: vi.fn(),
  toggleLayerLock: vi.fn(),
  selectMultipleLayers: vi.fn(),
  toggleLayerSelection: vi.fn(),
  reorderLayer: vi.fn(),
  reorderLayers: vi.fn(),
  clearLayers: vi.fn(),
  surfaces: [] as any[],
  activeSurface: 'front',
  updateLayer: vi.fn(),
  mockupTint: null as string | null,
};

vi.mock('@/lib/designer/canvasStore', () => ({
  useCanvasStore: (selector: (s: typeof mockStore) => unknown) => selector(mockStore),
}));

// ---------------------------------------------------------------------------
// Component under test (imported after all mocks)
// ---------------------------------------------------------------------------
import LayersPanel from '@/components/storefront/designer/LayersPanel';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeLayer(overrides: Partial<any> = {}): any {
  return {
    id: 'layer-1',
    name: 'Test Layer',
    type: 'text',
    zIndex: 0,
    visible: true,
    locked: false,
    left: 10,
    top: 10,
    width: 100,
    height: 50,
    data: { text: 'Hi', fontFamily: 'Arial', fill: '#333' },
    ...overrides,
  };
}

function resetStore() {
  mockStore.canvas = null;
  mockStore.layers = [];
  mockStore.layerSelection = { selectionMode: 'single', selectedLayerIds: [] };
  mockStore.activeLayerId = null;
  mockStore.surfaces = [];
  mockStore.activeSurface = 'front';
  mockStore.mockupTint = null;
  vi.clearAllMocks();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LayersPanel — empty state', () => {
  beforeEach(resetStore);

  it('renders the panel header with layer count 0', () => {
    render(<LayersPanel />);
    expect(screen.getByText(/Layers/)).toBeTruthy();
    expect(screen.getByText('(0)')).toBeTruthy();
  });

  it('shows the empty-state message when no layers exist', () => {
    render(<LayersPanel />);
    expect(screen.getByText('No layers yet')).toBeTruthy();
    expect(screen.getByText('Add content to get started')).toBeTruthy();
  });

  it('does NOT render the Clear button with 0 layers', () => {
    render(<LayersPanel />);
    expect(screen.queryByTitle('Remove every layer on this surface')).toBeNull();
  });

  it('does NOT render the Clear button with exactly 1 layer', () => {
    mockStore.layers = [makeLayer()];
    render(<LayersPanel />);
    expect(screen.queryByTitle('Remove every layer on this surface')).toBeNull();
  });
});

describe('LayersPanel — Add layer button', () => {
  beforeEach(resetStore);

  it('renders the Add layer button when onShowAddLayerPanel is provided', () => {
    const onShow = vi.fn();
    render(<LayersPanel onShowAddLayerPanel={onShow} />);
    expect(screen.getByText('Add layer')).toBeTruthy();
  });

  it('calls onShowAddLayerPanel when Add layer button is clicked', () => {
    const onShow = vi.fn();
    render(<LayersPanel onShowAddLayerPanel={onShow} />);
    fireEvent.click(screen.getByText('Add layer'));
    expect(onShow).toHaveBeenCalledTimes(1);
  });

  it('does NOT render the Add layer button when prop is omitted', () => {
    render(<LayersPanel />);
    expect(screen.queryByText('Add layer')).toBeNull();
  });
});

describe('LayersPanel — layer list rendering', () => {
  beforeEach(resetStore);

  it('renders a text layer row with its name', () => {
    mockStore.layers = [makeLayer({ name: 'My Text Layer', type: 'text' })];
    render(<LayersPanel />);
    expect(screen.getByText('My Text Layer')).toBeTruthy();
  });

  it('renders an icon layer row', () => {
    mockStore.layers = [makeLayer({ name: 'Star Icon', type: 'icon', data: { iconName: 'star', fill: '#f00' } })];
    render(<LayersPanel />);
    expect(screen.getByText('Star Icon')).toBeTruthy();
  });

  it('renders an image layer row with a thumbnail', () => {
    mockStore.layers = [makeLayer({ name: 'My Image', type: 'image', data: { url: 'https://example.com/img.png' } })];
    const { container } = render(<LayersPanel />);
    expect(screen.getByText('My Image')).toBeTruthy();
    // The img has aria-hidden so getByRole won't find it; use querySelector instead.
    const img = container.querySelector('img[src="https://example.com/img.png"]');
    expect(img).not.toBeNull();
  });

  it('renders layer count in header', () => {
    mockStore.layers = [makeLayer(), makeLayer({ id: 'layer-2', name: 'Layer 2', zIndex: 1 })];
    render(<LayersPanel />);
    expect(screen.getByText('(2)')).toBeTruthy();
  });

  it('renders the Clear button when >= 2 layers exist', () => {
    mockStore.layers = [
      makeLayer({ id: 'l1', zIndex: 0 }),
      makeLayer({ id: 'l2', zIndex: 1, name: 'Layer 2' }),
    ];
    render(<LayersPanel />);
    expect(screen.getByTitle('Remove every layer on this surface')).toBeTruthy();
  });

  it('marks the active layer row with border-primary class', () => {
    mockStore.layers = [makeLayer({ id: 'layer-1' })];
    mockStore.activeLayerId = 'layer-1';
    const { container } = render(<LayersPanel />);
    const row = container.querySelector('.border-primary');
    expect(row).not.toBeNull();
  });
});

describe('LayersPanel — layer action callbacks', () => {
  beforeEach(() => {
    resetStore();
    mockStore.layers = [makeLayer({ id: 'layer-1', name: 'Alpha' })];
    mockStore.activeLayerId = 'layer-1';
    mockStore.layerSelection = { selectionMode: 'single', selectedLayerIds: ['layer-1'] };
  });

  it('calls toggleLayerVisibility when Hide/Show button is clicked', () => {
    render(<LayersPanel />);
    const btn = screen.getByRole('button', { name: /Hide layer|Show layer/ });
    fireEvent.click(btn);
    expect(mockStore.toggleLayerVisibility).toHaveBeenCalledWith('layer-1');
  });

  it('calls toggleLayerLock when Lock/Unlock button is clicked', () => {
    render(<LayersPanel />);
    const btn = screen.getByRole('button', { name: /Lock layer|Unlock layer/ });
    fireEvent.click(btn);
    expect(mockStore.toggleLayerLock).toHaveBeenCalledWith('layer-1');
  });

  it('calls removeLayer when Delete button is clicked', () => {
    render(<LayersPanel />);
    const btn = screen.getByRole('button', { name: 'Delete layer' });
    fireEvent.click(btn);
    expect(mockStore.removeLayer).toHaveBeenCalledWith('layer-1');
  });

  it('calls duplicateLayer when Duplicate button is clicked', () => {
    render(<LayersPanel />);
    const btn = screen.getByRole('button', { name: 'Duplicate layer' });
    fireEvent.click(btn);
    expect(mockStore.duplicateLayer).toHaveBeenCalledWith('layer-1');
  });

  it('calls reorderLayer(up) when Move up button is clicked', () => {
    render(<LayersPanel />);
    const btn = screen.getByRole('button', { name: 'Move layer up' });
    fireEvent.click(btn);
    expect(mockStore.reorderLayer).toHaveBeenCalledWith('layer-1', 'up');
  });

  it('calls reorderLayer(down) when Move down button is clicked', () => {
    render(<LayersPanel />);
    const btn = screen.getByRole('button', { name: 'Move layer down' });
    fireEvent.click(btn);
    expect(mockStore.reorderLayer).toHaveBeenCalledWith('layer-1', 'down');
  });
});

describe('LayersPanel — selection', () => {
  beforeEach(() => {
    resetStore();
    mockStore.layers = [makeLayer({ id: 'layer-1', name: 'Alpha' })];
  });

  it('calls setActiveLayer and selectMultipleLayers on row click (no canvas)', () => {
    render(<LayersPanel />);
    const row = screen.getByText('Alpha').closest('[role="button"]')!;
    fireEvent.click(row);
    expect(mockStore.setActiveLayer).toHaveBeenCalledWith('layer-1');
    expect(mockStore.selectMultipleLayers).toHaveBeenCalledWith(['layer-1']);
  });

  it('calls toggleLayerSelection on Ctrl+click', () => {
    render(<LayersPanel />);
    const row = screen.getByText('Alpha').closest('[role="button"]')!;
    fireEvent.click(row, { ctrlKey: true });
    expect(mockStore.toggleLayerSelection).toHaveBeenCalledWith('layer-1');
  });

  it('calls toggleLayerSelection on Meta+click', () => {
    render(<LayersPanel />);
    const row = screen.getByText('Alpha').closest('[role="button"]')!;
    fireEvent.click(row, { metaKey: true });
    expect(mockStore.toggleLayerSelection).toHaveBeenCalledWith('layer-1');
  });

  it('shows multiple-selection indicator when in multiple mode', () => {
    mockStore.layerSelection = { selectionMode: 'multiple', selectedLayerIds: ['layer-1'] };
    render(<LayersPanel />);
    expect(screen.getByText('1 selected')).toBeTruthy();
  });
});

describe('LayersPanel — keyboard row activation', () => {
  beforeEach(() => {
    resetStore();
    mockStore.layers = [makeLayer({ id: 'layer-1', name: 'Alpha' })];
  });

  it('selects layer via Enter key on row', () => {
    render(<LayersPanel />);
    const row = screen.getByText('Alpha').closest('[role="button"]')!;
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(mockStore.setActiveLayer).toHaveBeenCalledWith('layer-1');
  });

  it('selects layer via Space key on row', () => {
    render(<LayersPanel />);
    const row = screen.getByText('Alpha').closest('[role="button"]')!;
    fireEvent.keyDown(row, { key: ' ' });
    expect(mockStore.setActiveLayer).toHaveBeenCalledWith('layer-1');
  });
});

describe('LayersPanel — clear all', () => {
  beforeEach(() => {
    resetStore();
    mockStore.layers = [
      makeLayer({ id: 'l1', zIndex: 0 }),
      makeLayer({ id: 'l2', zIndex: 1, name: 'Layer 2' }),
    ];
  });

  it('calls clearLayers when Clear button is clicked and user confirms', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<LayersPanel />);
    fireEvent.click(screen.getByTitle('Remove every layer on this surface'));
    expect(mockStore.clearLayers).toHaveBeenCalledTimes(1);
  });

  it('does NOT call clearLayers when user cancels the confirm dialog', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<LayersPanel />);
    fireEvent.click(screen.getByTitle('Remove every layer on this surface'));
    expect(mockStore.clearLayers).not.toHaveBeenCalled();
  });
});

describe('LayersPanel — filter input (>= 6 layers)', () => {
  beforeEach(() => {
    resetStore();
    mockStore.layers = Array.from({ length: 6 }, (_, i) =>
      makeLayer({ id: `l${i}`, name: i < 3 ? `Text Layer ${i}` : `Image Layer ${i}`, type: i < 3 ? 'text' : 'image', zIndex: i })
    );
  });

  it('renders the filter input when >= 6 layers', () => {
    render(<LayersPanel />);
    expect(screen.getByPlaceholderText('Filter layers')).toBeTruthy();
  });

  it('filters layers by name (case-insensitive)', () => {
    render(<LayersPanel />);
    const input = screen.getByPlaceholderText('Filter layers');
    fireEvent.change(input, { target: { value: 'image' } });
    expect(screen.queryByText('Text Layer 0')).toBeNull();
    expect(screen.getByText('Image Layer 3')).toBeTruthy();
  });

  it('filters layers by type keyword', () => {
    render(<LayersPanel />);
    const input = screen.getByPlaceholderText('Filter layers');
    fireEvent.change(input, { target: { value: 'text' } });
    expect(screen.getByText('Text Layer 0')).toBeTruthy();
    expect(screen.queryByText('Image Layer 3')).toBeNull();
  });

  it('shows "no match" message when filter matches nothing', () => {
    render(<LayersPanel />);
    const input = screen.getByPlaceholderText('Filter layers');
    fireEvent.change(input, { target: { value: 'zzznomatch' } });
    expect(screen.getByText(/No layers match/)).toBeTruthy();
  });

  it('shows a clear-filter button when filter is non-empty and clears on click', () => {
    render(<LayersPanel />);
    const input = screen.getByPlaceholderText('Filter layers');
    fireEvent.change(input, { target: { value: 'text' } });
    const clearBtn = screen.getByRole('button', { name: 'Clear filter' });
    expect(clearBtn).toBeTruthy();
    fireEvent.click(clearBtn);
    // After clearing, all layers visible again
    expect(screen.getByText('Text Layer 0')).toBeTruthy();
  });

  it('does NOT render filter input when < 6 layers', () => {
    mockStore.layers = mockStore.layers.slice(0, 5);
    render(<LayersPanel />);
    expect(screen.queryByPlaceholderText('Filter layers')).toBeNull();
  });
});

describe('LayersPanel — print-area overflow banner', () => {
  beforeEach(() => {
    resetStore();
    mockStore.layers = [makeLayer({ id: 'l1' })];
    mockStore.surfaces = [{
      slug: 'front',
      printAreaX: 0, printAreaY: 0,
      printAreaWidth: 200, printAreaHeight: 200,
    }];
    mockStore.activeSurface = 'front';
  });

  it('shows overflow banner when countLayersOutsidePrintArea returns partial > 0', async () => {
    const { countLayersOutsidePrintArea } = await import('@/lib/designer/printAreaCheck');
    (countLayersOutsidePrintArea as ReturnType<typeof vi.fn>).mockReturnValueOnce({ partial: 1, outside: 0 });
    render(<LayersPanel />);
    expect(screen.getByText(/will be clipped/)).toBeTruthy();
  });

  it('shows overflow banner when countLayersOutsidePrintArea returns outside > 0', async () => {
    const { countLayersOutsidePrintArea } = await import('@/lib/designer/printAreaCheck');
    (countLayersOutsidePrintArea as ReturnType<typeof vi.fn>).mockReturnValueOnce({ partial: 0, outside: 2 });
    render(<LayersPanel />);
    expect(screen.getByText(/outside print area/)).toBeTruthy();
  });

  it('does NOT show overflow banner when all layers are inside', () => {
    render(<LayersPanel />);
    expect(screen.queryByText(/outside print area/)).toBeNull();
    expect(screen.queryByText(/will be clipped/)).toBeNull();
  });
});

describe('LayersPanel — per-tint override indicator', () => {
  beforeEach(resetStore);

  it('shows the per-tint color dot when a tint override exists for the active tint', () => {
    mockStore.mockupTint = '#ff0000';
    mockStore.activeLayerId = 'layer-1';
    mockStore.layerSelection = { selectionMode: 'single', selectedLayerIds: ['layer-1'] };
    mockStore.layers = [makeLayer({
      id: 'layer-1',
      type: 'text',
      data: {
        text: 'Hi',
        fill: '#333',
        fillByTint: { '#ff0000': '#0000ff' },
      },
    })];
    render(<LayersPanel />);
    const indicator = screen.getByLabelText('Per-tint colour override active for this shirt colour');
    expect(indicator).toBeTruthy();
  });

  it('does NOT show tint dot when there is no active tint (mockupTint is null)', () => {
    mockStore.mockupTint = null;
    mockStore.layers = [makeLayer({
      id: 'layer-1',
      type: 'text',
      data: { text: 'Hi', fill: '#333', fillByTint: { '#ff0000': '#0000ff' } },
    })];
    render(<LayersPanel />);
    expect(screen.queryByLabelText('Per-tint colour override active for this shirt colour')).toBeNull();
  });
});

describe('LayersPanel — print-area status icons on layer rows', () => {
  beforeEach(() => {
    resetStore();
    mockStore.surfaces = [{
      slug: 'front',
      printAreaX: 0, printAreaY: 0,
      printAreaWidth: 200, printAreaHeight: 200,
    }];
    mockStore.activeSurface = 'front';
    mockStore.activeLayerId = 'layer-1';
    mockStore.layerSelection = { selectionMode: 'single', selectedLayerIds: ['layer-1'] };
  });

  it('shows the outside-print-area button when classifyLayerPrintArea returns outside', async () => {
    const { classifyLayerPrintArea } = await import('@/lib/designer/printAreaCheck');
    (classifyLayerPrintArea as ReturnType<typeof vi.fn>).mockReturnValue('outside');
    mockStore.layers = [makeLayer({ id: 'layer-1', visible: true })];
    render(<LayersPanel />);
    expect(
      screen.getByRole('button', { name: /Outside print area/ })
    ).toBeTruthy();
  });

  it('shows the partial-overflow button when classifyLayerPrintArea returns partial', async () => {
    const { classifyLayerPrintArea } = await import('@/lib/designer/printAreaCheck');
    (classifyLayerPrintArea as ReturnType<typeof vi.fn>).mockReturnValue('partial');
    mockStore.layers = [makeLayer({ id: 'layer-1', visible: true })];
    render(<LayersPanel />);
    expect(
      screen.getByRole('button', { name: /Partially outside/ })
    ).toBeTruthy();
  });
});

describe('LayersPanel — className prop', () => {
  beforeEach(resetStore);

  it('passes className to the outermost div', () => {
    const { container } = render(<LayersPanel className="my-custom-class" />);
    expect(container.firstElementChild?.className).toContain('my-custom-class');
  });
});

describe('LayersPanel — layer name editing (SortableLayerRow)', () => {
  beforeEach(() => {
    resetStore();
    mockStore.layers = [makeLayer({ id: 'layer-1', name: 'Old Name' })];
    mockStore.activeLayerId = 'layer-1';
    mockStore.layerSelection = { selectionMode: 'single', selectedLayerIds: ['layer-1'] };
  });

  it('enters edit mode on double-click of the name span', () => {
    render(<LayersPanel />);
    const nameSpan = screen.getByText('Old Name');
    fireEvent.dblClick(nameSpan);
    expect(screen.getByRole('textbox', { name: 'Rename layer' })).toBeTruthy();
  });

  it('commits the new name on Enter key', () => {
    render(<LayersPanel />);
    fireEvent.dblClick(screen.getByText('Old Name'));
    const input = screen.getByRole('textbox', { name: 'Rename layer' });
    fireEvent.change(input, { target: { value: 'New Name' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(mockStore.updateLayer).toHaveBeenCalledWith('layer-1', { name: 'New Name' });
  });

  it('cancels edit on Escape key without updating', () => {
    render(<LayersPanel />);
    fireEvent.dblClick(screen.getByText('Old Name'));
    const input = screen.getByRole('textbox', { name: 'Rename layer' });
    fireEvent.change(input, { target: { value: 'Abandoned Name' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(mockStore.updateLayer).not.toHaveBeenCalled();
  });

  it('commits name on blur', () => {
    render(<LayersPanel />);
    fireEvent.dblClick(screen.getByText('Old Name'));
    const input = screen.getByRole('textbox', { name: 'Rename layer' });
    fireEvent.change(input, { target: { value: 'Blur Name' } });
    fireEvent.blur(input);
    expect(mockStore.updateLayer).toHaveBeenCalledWith('layer-1', { name: 'Blur Name' });
  });
});

describe('LayersPanel — layer visibility display', () => {
  beforeEach(() => {
    resetStore();
  });

  it('applies line-through style when layer is hidden', () => {
    mockStore.layers = [makeLayer({ id: 'l1', visible: false })];
    mockStore.activeLayerId = 'l1';
    mockStore.layerSelection = { selectionMode: 'single', selectedLayerIds: ['l1'] };
    render(<LayersPanel />);
    const nameSpan = screen.getByText('Test Layer');
    expect(nameSpan.className).toContain('line-through');
  });

  it('does NOT apply line-through when layer is visible', () => {
    mockStore.layers = [makeLayer({ id: 'l1', visible: true })];
    mockStore.activeLayerId = 'l1';
    mockStore.layerSelection = { selectionMode: 'single', selectedLayerIds: ['l1'] };
    render(<LayersPanel />);
    const nameSpan = screen.getByText('Test Layer');
    expect(nameSpan.className).not.toContain('line-through');
  });
});

describe('LayersPanel — icon layer preview glyphs', () => {
  beforeEach(resetStore);

  it('renders a known icon glyph (heart → favorite) for icon layer', () => {
    mockStore.layers = [makeLayer({ id: 'l1', type: 'icon', data: { iconName: 'heart', fill: '#f00' } })];
    mockStore.activeLayerId = 'l1';
    mockStore.layerSelection = { selectionMode: 'single', selectedLayerIds: ['l1'] };
    const { container } = render(<LayersPanel />);
    // The preview span inside the row should contain the mapped glyph text
    const glyphs = container.querySelectorAll('.material-icons');
    const glyphTexts = Array.from(glyphs).map((el) => el.textContent);
    expect(glyphTexts).toContain('favorite');
  });

  it('falls back to star glyph for unknown icon name', () => {
    mockStore.layers = [makeLayer({ id: 'l1', type: 'icon', data: { iconName: 'unknown_glyph', fill: '#f00' } })];
    mockStore.activeLayerId = 'l1';
    mockStore.layerSelection = { selectionMode: 'single', selectedLayerIds: ['l1'] };
    const { container } = render(<LayersPanel />);
    const glyphs = container.querySelectorAll('.material-icons');
    const glyphTexts = Array.from(glyphs).map((el) => el.textContent);
    expect(glyphTexts).toContain('star');
  });
});
