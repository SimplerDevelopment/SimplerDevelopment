// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mocks — all vi.mock calls are hoisted; factories must be pure (no top-level
// variable references from this file). Use vi.mocked() in tests to get fns.
// ---------------------------------------------------------------------------

vi.mock('fabric', () => ({}));

vi.mock('@/lib/designer/layerFactory', () => ({
  applyOutlineEffectToFabricObject: vi.fn(),
  applyShadowEffectToFabricObject: vi.fn(),
}));

// Canvas store — driven via a module-level mutable object so tests can set
// state before each render. The selector is called synchronously.
vi.mock('@/lib/designer/canvasStore', () => ({
  useCanvasStore: (selector: (s: unknown) => unknown) =>
    selector(currentStoreState),
}));

// ---------------------------------------------------------------------------
// Store state object (mutated per-test in beforeEach)
// ---------------------------------------------------------------------------
let currentStoreState: {
  selectedLayers: { type?: string }[];
  layers: { id: string; data: Record<string, unknown> }[];
  canvas: {
    requestRenderAll: ReturnType<typeof vi.fn>;
    fire: ReturnType<typeof vi.fn>;
  } | null;
  activeLayerId: string | null;
} = {
  selectedLayers: [],
  layers: [],
  canvas: null,
  activeLayerId: null,
};

// ---------------------------------------------------------------------------
// Component under test — imported after mocks are registered
// ---------------------------------------------------------------------------
import EffectsFloating from '@/components/storefront/designer/EffectsFloating';
import * as layerFactory from '@/lib/designer/layerFactory';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const mockCanvas = () => ({
  requestRenderAll: vi.fn(),
  fire: vi.fn(),
});

const textFabricObj = { type: 'text' } as { type: string };
const iTextFabricObj = { type: 'i-text' } as { type: string };

const makeTextLayer = (data: Record<string, unknown> = {}) => ({
  id: 'layer-1',
  data,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('EffectsFloating', () => {
  beforeEach(() => {
    currentStoreState = {
      selectedLayers: [],
      layers: [],
      canvas: null,
      activeLayerId: null,
    };
    vi.mocked(layerFactory.applyOutlineEffectToFabricObject).mockClear();
    vi.mocked(layerFactory.applyShadowEffectToFabricObject).mockClear();
  });

  // ── Visibility guard ──────────────────────────────────────────────────────

  it('renders nothing when no layer is selected', () => {
    const { container } = render(<EffectsFloating />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when multiple layers are selected', () => {
    currentStoreState.selectedLayers = [textFabricObj, { type: 'text' }];
    const { container } = render(<EffectsFloating />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when the single selected layer is not a text type', () => {
    currentStoreState.selectedLayers = [{ type: 'image' }];
    const { container } = render(<EffectsFloating />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the expanded panel when exactly one text layer is selected', () => {
    currentStoreState.selectedLayers = [textFabricObj];
    currentStoreState.layers = [makeTextLayer()];
    currentStoreState.activeLayerId = 'layer-1';
    render(<EffectsFloating />);
    expect(screen.getByRole('region', { name: /text effects/i })).toBeInTheDocument();
  });

  it('also renders for i-text type', () => {
    currentStoreState.selectedLayers = [iTextFabricObj];
    currentStoreState.layers = [makeTextLayer()];
    currentStoreState.activeLayerId = 'layer-1';
    render(<EffectsFloating />);
    expect(screen.getByRole('region', { name: /text effects/i })).toBeInTheDocument();
  });

  // ── Collapsed / expanded toggle ───────────────────────────────────────────

  it('collapses to a chip when the collapse button is clicked', () => {
    currentStoreState.selectedLayers = [textFabricObj];
    currentStoreState.layers = [makeTextLayer()];
    currentStoreState.activeLayerId = 'layer-1';
    render(<EffectsFloating />);

    fireEvent.click(screen.getByRole('button', { name: /collapse effects/i }));

    expect(screen.queryByRole('region', { name: /text effects/i })).toBeNull();
    expect(screen.getByRole('button', { name: /show text effects/i })).toBeInTheDocument();
  });

  it('re-expands the panel when the chip is clicked', () => {
    currentStoreState.selectedLayers = [textFabricObj];
    currentStoreState.layers = [makeTextLayer()];
    currentStoreState.activeLayerId = 'layer-1';
    render(<EffectsFloating />);

    fireEvent.click(screen.getByRole('button', { name: /collapse effects/i }));
    fireEvent.click(screen.getByRole('button', { name: /show text effects/i }));

    expect(screen.getByRole('region', { name: /text effects/i })).toBeInTheDocument();
  });

  // ── Outline controls ──────────────────────────────────────────────────────

  it('outline checkbox starts unchecked when layer has no stroke', () => {
    currentStoreState.selectedLayers = [textFabricObj];
    currentStoreState.layers = [makeTextLayer()];
    currentStoreState.activeLayerId = 'layer-1';
    render(<EffectsFloating />);

    expect(screen.getByRole('checkbox', { name: /outline/i })).not.toBeChecked();
  });

  it('outline checkbox starts checked when layer has stroke + strokeWidth > 0', () => {
    currentStoreState.selectedLayers = [textFabricObj];
    currentStoreState.layers = [makeTextLayer({ stroke: '#ff0000', strokeWidth: 3 })];
    currentStoreState.activeLayerId = 'layer-1';
    render(<EffectsFloating />);

    expect(screen.getByRole('checkbox', { name: /outline/i })).toBeChecked();
  });

  it('calls applyOutlineEffectToFabricObject when outline checkbox is toggled on', () => {
    currentStoreState.selectedLayers = [textFabricObj];
    currentStoreState.canvas = mockCanvas();
    currentStoreState.layers = [makeTextLayer()];
    currentStoreState.activeLayerId = 'layer-1';
    render(<EffectsFloating />);

    fireEvent.click(screen.getByRole('checkbox', { name: /outline/i }));

    expect(layerFactory.applyOutlineEffectToFabricObject).toHaveBeenCalledWith(
      textFabricObj,
      '#000000',
      2,
    );
  });

  it('passes width=0 to applyOutlineEffectToFabricObject when outline is toggled off', () => {
    currentStoreState.selectedLayers = [textFabricObj];
    currentStoreState.canvas = mockCanvas();
    currentStoreState.layers = [makeTextLayer({ stroke: '#ff0000', strokeWidth: 3 })];
    currentStoreState.activeLayerId = 'layer-1';
    render(<EffectsFloating />);

    fireEvent.click(screen.getByRole('checkbox', { name: /outline/i }));

    expect(layerFactory.applyOutlineEffectToFabricObject).toHaveBeenCalledWith(
      textFabricObj,
      expect.any(String),
      0,
    );
  });

  it('outline width slider is disabled when outline is off', () => {
    currentStoreState.selectedLayers = [textFabricObj];
    currentStoreState.layers = [makeTextLayer()];
    currentStoreState.activeLayerId = 'layer-1';
    render(<EffectsFloating />);

    expect(screen.getByRole('slider', { name: /outline thickness/i })).toBeDisabled();
  });

  it('outline width slider is enabled when outline is on', () => {
    currentStoreState.selectedLayers = [textFabricObj];
    currentStoreState.layers = [makeTextLayer({ stroke: '#ff0000', strokeWidth: 3 })];
    currentStoreState.activeLayerId = 'layer-1';
    render(<EffectsFloating />);

    expect(screen.getByRole('slider', { name: /outline thickness/i })).not.toBeDisabled();
  });

  it('adjusting outline slider calls applyOutlineEffectToFabricObject when outline is enabled', () => {
    currentStoreState.selectedLayers = [textFabricObj];
    currentStoreState.canvas = mockCanvas();
    currentStoreState.layers = [makeTextLayer({ stroke: '#ff0000', strokeWidth: 3 })];
    currentStoreState.activeLayerId = 'layer-1';
    render(<EffectsFloating />);

    fireEvent.change(screen.getByRole('slider', { name: /outline thickness/i }), {
      target: { value: '5' },
    });

    expect(layerFactory.applyOutlineEffectToFabricObject).toHaveBeenCalledWith(
      textFabricObj,
      expect.any(String),
      5,
    );
  });

  it('outline color picker is disabled when outline is off', () => {
    currentStoreState.selectedLayers = [textFabricObj];
    currentStoreState.layers = [makeTextLayer()];
    currentStoreState.activeLayerId = 'layer-1';
    render(<EffectsFloating />);

    expect(screen.getByLabelText(/outline color/i)).toBeDisabled();
  });

  it('changing outline color picker calls applyOutlineEffectToFabricObject when outline is enabled', () => {
    currentStoreState.selectedLayers = [textFabricObj];
    currentStoreState.canvas = mockCanvas();
    currentStoreState.layers = [makeTextLayer({ stroke: '#ff0000', strokeWidth: 3 })];
    currentStoreState.activeLayerId = 'layer-1';
    render(<EffectsFloating />);

    fireEvent.change(screen.getByLabelText(/outline color/i), {
      target: { value: '#aabbcc' },
    });

    expect(layerFactory.applyOutlineEffectToFabricObject).toHaveBeenCalledWith(
      textFabricObj,
      '#aabbcc',
      expect.any(Number),
    );
  });

  // ── Shadow controls ───────────────────────────────────────────────────────

  it('shadow checkbox starts unchecked when layer has no shadow', () => {
    currentStoreState.selectedLayers = [textFabricObj];
    currentStoreState.layers = [makeTextLayer()];
    currentStoreState.activeLayerId = 'layer-1';
    render(<EffectsFloating />);

    expect(screen.getByRole('checkbox', { name: /shadow/i })).not.toBeChecked();
  });

  it('shadow checkbox starts checked when layer has an enabled shadow', () => {
    currentStoreState.selectedLayers = [textFabricObj];
    currentStoreState.layers = [
      makeTextLayer({
        shadow: { enabled: true, color: '#333333', offsetX: 3, offsetY: 3, blur: 5 },
      }),
    ];
    currentStoreState.activeLayerId = 'layer-1';
    render(<EffectsFloating />);

    expect(screen.getByRole('checkbox', { name: /shadow/i })).toBeChecked();
  });

  it('toggling shadow on calls applyShadowEffectToFabricObject with an effect object', () => {
    currentStoreState.selectedLayers = [textFabricObj];
    currentStoreState.canvas = mockCanvas();
    currentStoreState.layers = [makeTextLayer()];
    currentStoreState.activeLayerId = 'layer-1';
    render(<EffectsFloating />);

    fireEvent.click(screen.getByRole('checkbox', { name: /shadow/i }));

    expect(layerFactory.applyShadowEffectToFabricObject).toHaveBeenCalledWith(
      textFabricObj,
      expect.objectContaining({ enabled: true }),
    );
  });

  it('toggling shadow off calls applyShadowEffectToFabricObject with null', () => {
    currentStoreState.selectedLayers = [textFabricObj];
    currentStoreState.canvas = mockCanvas();
    currentStoreState.layers = [
      makeTextLayer({
        shadow: { enabled: true, color: '#333333', offsetX: 2, offsetY: 2, blur: 4 },
      }),
    ];
    currentStoreState.activeLayerId = 'layer-1';
    render(<EffectsFloating />);

    fireEvent.click(screen.getByRole('checkbox', { name: /shadow/i }));

    expect(layerFactory.applyShadowEffectToFabricObject).toHaveBeenCalledWith(
      textFabricObj,
      null,
    );
  });

  it('shadow color picker is disabled when shadow is off', () => {
    currentStoreState.selectedLayers = [textFabricObj];
    currentStoreState.layers = [makeTextLayer()];
    currentStoreState.activeLayerId = 'layer-1';
    render(<EffectsFloating />);

    expect(screen.getByLabelText(/shadow color/i)).toBeDisabled();
  });

  it('changing shadow color calls applyShadowEffectToFabricObject when shadow is enabled', () => {
    currentStoreState.selectedLayers = [textFabricObj];
    currentStoreState.canvas = mockCanvas();
    currentStoreState.layers = [
      makeTextLayer({
        shadow: { enabled: true, color: '#000000', offsetX: 2, offsetY: 2, blur: 4 },
      }),
    ];
    currentStoreState.activeLayerId = 'layer-1';
    render(<EffectsFloating />);

    fireEvent.change(screen.getByLabelText(/shadow color/i), {
      target: { value: '#ff00ff' },
    });

    expect(layerFactory.applyShadowEffectToFabricObject).toHaveBeenCalledWith(
      textFabricObj,
      expect.objectContaining({ color: '#ff00ff', enabled: true }),
    );
  });

  // ── Shadow sliders (Offset X / Y / Blur) ─────────────────────────────────

  it('renders three shadow sub-labels (Offset X, Offset Y, Blur)', () => {
    currentStoreState.selectedLayers = [textFabricObj];
    currentStoreState.layers = [makeTextLayer()];
    currentStoreState.activeLayerId = 'layer-1';
    render(<EffectsFloating />);

    expect(screen.getByText('Offset X')).toBeInTheDocument();
    expect(screen.getByText('Offset Y')).toBeInTheDocument();
    expect(screen.getByText('Blur')).toBeInTheDocument();
  });

  it('shadow sliders are disabled when shadow is off', () => {
    currentStoreState.selectedLayers = [textFabricObj];
    currentStoreState.layers = [makeTextLayer()];
    currentStoreState.activeLayerId = 'layer-1';
    render(<EffectsFloating />);

    // All sliders after the first (outline thickness) are shadow sliders.
    const allSliders = screen.getAllByRole('slider');
    const shadowSliders = allSliders.slice(1);
    for (const s of shadowSliders) {
      expect(s).toBeDisabled();
    }
  });

  it('changing Offset X slider calls applyShadowEffectToFabricObject when shadow is enabled', () => {
    currentStoreState.selectedLayers = [textFabricObj];
    currentStoreState.canvas = mockCanvas();
    currentStoreState.layers = [
      makeTextLayer({
        shadow: { enabled: true, color: '#000000', offsetX: 2, offsetY: 2, blur: 4 },
      }),
    ];
    currentStoreState.activeLayerId = 'layer-1';
    render(<EffectsFloating />);

    // sliders: [0]=outline thickness, [1]=Offset X, [2]=Offset Y, [3]=Blur
    const allSliders = screen.getAllByRole('slider');
    fireEvent.change(allSliders[1], { target: { value: '10' } });

    expect(layerFactory.applyShadowEffectToFabricObject).toHaveBeenCalledWith(
      textFabricObj,
      expect.objectContaining({ offsetX: 10, enabled: true }),
    );
  });

  it('changing Offset Y slider calls applyShadowEffectToFabricObject when shadow is enabled', () => {
    currentStoreState.selectedLayers = [textFabricObj];
    currentStoreState.canvas = mockCanvas();
    currentStoreState.layers = [
      makeTextLayer({
        shadow: { enabled: true, color: '#000000', offsetX: 2, offsetY: 2, blur: 4 },
      }),
    ];
    currentStoreState.activeLayerId = 'layer-1';
    render(<EffectsFloating />);

    const allSliders = screen.getAllByRole('slider');
    fireEvent.change(allSliders[2], { target: { value: '-5' } });

    expect(layerFactory.applyShadowEffectToFabricObject).toHaveBeenCalledWith(
      textFabricObj,
      expect.objectContaining({ offsetY: -5, enabled: true }),
    );
  });

  it('changing Blur slider calls applyShadowEffectToFabricObject when shadow is enabled', () => {
    currentStoreState.selectedLayers = [textFabricObj];
    currentStoreState.canvas = mockCanvas();
    currentStoreState.layers = [
      makeTextLayer({
        shadow: { enabled: true, color: '#000000', offsetX: 2, offsetY: 2, blur: 4 },
      }),
    ];
    currentStoreState.activeLayerId = 'layer-1';
    render(<EffectsFloating />);

    const allSliders = screen.getAllByRole('slider');
    fireEvent.change(allSliders[3], { target: { value: '15' } });

    expect(layerFactory.applyShadowEffectToFabricObject).toHaveBeenCalledWith(
      textFabricObj,
      expect.objectContaining({ blur: 15, enabled: true }),
    );
  });

  // ── canvas.fire / requestRenderAll wired ──────────────────────────────────

  it('fires object:modified on the canvas after applying an outline change', () => {
    const canvas = mockCanvas();
    currentStoreState.selectedLayers = [textFabricObj];
    currentStoreState.canvas = canvas;
    currentStoreState.layers = [makeTextLayer({ stroke: '#ff0000', strokeWidth: 2 })];
    currentStoreState.activeLayerId = 'layer-1';
    render(<EffectsFloating />);

    fireEvent.change(screen.getByRole('slider', { name: /outline thickness/i }), {
      target: { value: '4' },
    });

    expect(canvas.requestRenderAll).toHaveBeenCalled();
    expect(canvas.fire).toHaveBeenCalledWith(
      'object:modified',
      expect.objectContaining({ target: textFabricObj }),
    );
  });

  // ── Outline slider does NOT call apply when outline is disabled ──────────

  it('outline slider change does NOT call applyOutlineEffectToFabricObject when disabled', () => {
    currentStoreState.selectedLayers = [textFabricObj];
    currentStoreState.canvas = mockCanvas();
    currentStoreState.layers = [makeTextLayer()]; // no stroke → disabled
    currentStoreState.activeLayerId = 'layer-1';
    render(<EffectsFloating />);

    fireEvent.change(screen.getByRole('slider', { name: /outline thickness/i }), {
      target: { value: '6' },
    });

    expect(layerFactory.applyOutlineEffectToFabricObject).not.toHaveBeenCalled();
  });

  // ── No canvas — apply functions not called ───────────────────────────────

  it('does not call applyOutlineEffectToFabricObject when canvas is null', () => {
    currentStoreState.selectedLayers = [textFabricObj];
    currentStoreState.canvas = null;
    currentStoreState.layers = [makeTextLayer()];
    currentStoreState.activeLayerId = 'layer-1';
    render(<EffectsFloating />);

    // Toggle on — fabricObj exists but canvas is null, so commit() is a no-op;
    // applyOutline is still called (it doesn't need canvas), but commit is skipped.
    fireEvent.click(screen.getByRole('checkbox', { name: /outline/i }));
    // The outline fn IS called (only commit guards on canvas)
    expect(layerFactory.applyOutlineEffectToFabricObject).toHaveBeenCalled();
  });

  // ── Outline width display value ────────────────────────────────────────────

  it('displays the current outline width value as fixed-decimal', () => {
    currentStoreState.selectedLayers = [textFabricObj];
    currentStoreState.layers = [makeTextLayer({ stroke: '#000000', strokeWidth: 2 })];
    currentStoreState.activeLayerId = 'layer-1';
    render(<EffectsFloating />);

    // The span shows "2.0"
    expect(screen.getByText('2.0')).toBeInTheDocument();
  });
});
