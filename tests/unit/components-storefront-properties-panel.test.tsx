// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mock fabric — only filters are used at runtime; types are stripped
// ---------------------------------------------------------------------------
vi.mock('fabric', () => ({
  filters: {
    Brightness: class { constructor(p: any) { Object.assign(this, p); } },
    Contrast:   class { constructor(p: any) { Object.assign(this, p); } },
    Saturation: class { constructor(p: any) { Object.assign(this, p); } },
    Blur:       class { constructor(p: any) { Object.assign(this, p); } },
  },
}));

// ---------------------------------------------------------------------------
// Mock sibling designer components so they don't pull in heavy deps
// ---------------------------------------------------------------------------
vi.mock('@/components/storefront/designer/BatchPropertiesPanel', () => ({
  default: ({ selectedLayerIds, layerTypes }: any) =>
    React.createElement('div', { 'data-testid': 'batch-panel' },
      `Batch: ${selectedLayerIds.join(',')} types:${layerTypes.join(',')}`),
}));

vi.mock('@/components/storefront/designer/ColorPicker', () => ({
  default: ({ label, value, onChange }: any) =>
    React.createElement('div', { 'data-testid': 'color-picker' },
      React.createElement('span', null, label),
      React.createElement('button', { onClick: () => onChange('#ff0000') }, 'set-color'),
    ),
}));

vi.mock('@/components/storefront/designer/FontPicker', () => ({
  default: ({ value, onChange }: any) =>
    React.createElement('button', {
      'data-testid': 'font-picker',
      onClick: () => onChange('Roboto'),
    }, `font:${value}`),
}));

// ---------------------------------------------------------------------------
// Mock lib/designer helpers
// ---------------------------------------------------------------------------
vi.mock('@/lib/designer/contrastInk', () => ({
  contrastingInkForTint: (hex: string) => (hex === '#ffffff' ? null : '#ffffff'),
}));

vi.mock('@/lib/designer/fillResolver', () => ({
  resolveLayerFill: (_layer: any, _tint: any) => '#000000',
  tintKey: (tint: string | null) => (tint ? tint.toLowerCase() : 'none'),
}));

const mockAssessPrintQuality = vi.fn(() => null);
vi.mock('@/lib/designer/printQuality', () => ({
  assessPrintQuality: (...args: any[]) => mockAssessPrintQuality(...args),
}));

// ---------------------------------------------------------------------------
// Mock canvasStore — state is controlled per test via storeState
// ---------------------------------------------------------------------------
let storeState: Record<string, any> = {};

vi.mock('@/lib/designer/canvasStore', () => ({
  useCanvasStore: (selector: (s: any) => any) => selector(storeState),
}));

// ---------------------------------------------------------------------------
// Import component under test (after all vi.mock declarations)
// ---------------------------------------------------------------------------
import PropertiesPanel from '@/components/storefront/designer/PropertiesPanel';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a full LayerData object. The `id` must match the fabricObject's
 * `data.id` for the component's `primaryLayer` look-up to succeed.
 */
function makeLayer(overrides: Partial<any> = {}): any {
  return {
    id: 'layer-1',
    type: 'text',
    name: 'My Layer',
    visible: true,
    locked: false,
    opacity: 1,
    left: 10,
    top: 20,
    width: 100,
    height: 50,
    scaleX: 1,
    scaleY: 1,
    angle: 0,
    zIndex: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    data: {
      text: 'Hello',
      fontFamily: 'Arial',
      fontSize: 24,
      fontWeight: 'normal',
      fontStyle: 'normal',
      fill: '#000000',
      textAlign: 'left',
      lineHeight: 1.2,
      charSpacing: 0,
    },
    ...overrides,
  };
}

/**
 * Build a mock FabricObject that implements the subset of the Fabric API
 * that PropertiesPanel touches. The `data.id` field must match the
 * corresponding LayerData.id so the component's `primaryLayer` look-up works.
 */
function makeFabricObject(id = 'layer-1', overrides: Partial<any> = {}): any {
  return {
    // Fabric properties read by useEffect
    left: 10,
    top: 20,
    scaleX: 1,
    scaleY: 1,
    angle: 0,
    opacity: 1,
    visible: true,
    selectable: true,
    // Component resolves primary layer id via primary.data?.id || primary.id
    data: { id },
    getBoundingRect: () => ({ left: 10, top: 20, width: 100, height: 50 }),
    set: vi.fn(),
    setCoords: vi.fn(),
    canvas: { renderAll: vi.fn(), fire: vi.fn(), requestRenderAll: vi.fn() },
    ...overrides,
  };
}

function buildStore(overrides: Partial<any> = {}) {
  return {
    canvas: null,
    selectedLayers: [],
    layers: [],
    updateLayer: vi.fn(),
    getSelectedLayerIds: vi.fn(() => []),
    getBatchEditableProperties: vi.fn(() => []),
    batchUpdateLayers: vi.fn(),
    mockupTint: null,
    setMockupTint: vi.fn(),
    surfaces: [],
    activeSurface: 'front',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PropertiesPanel', () => {
  beforeEach(() => {
    storeState = buildStore();
    mockAssessPrintQuality.mockReturnValue(null);
  });

  // -------------------------------------------------------------------------
  // Empty-selection branch
  // -------------------------------------------------------------------------
  describe('no selection', () => {
    it('renders the empty-state message', () => {
      storeState = buildStore({ selectedLayers: [] });
      render(<PropertiesPanel />);
      expect(screen.getByText(/Select a layer to edit/i)).toBeInTheDocument();
    });

    it('applies a custom className when provided', () => {
      storeState = buildStore({ selectedLayers: [] });
      const { container } = render(<PropertiesPanel className="my-custom" />);
      expect(container.firstChild).toHaveClass('my-custom');
    });

    it('renders the tune icon in empty state', () => {
      storeState = buildStore({ selectedLayers: [] });
      const { container } = render(<PropertiesPanel />);
      const icon = container.querySelector('.material-icons');
      expect(icon?.textContent).toBe('tune');
    });
  });

  // -------------------------------------------------------------------------
  // Multi-selection branch (BatchPropertiesPanel)
  // -------------------------------------------------------------------------
  describe('multi selection', () => {
    it('renders BatchPropertiesPanel with the selected layer ids', () => {
      const layer1 = makeLayer({ id: 'layer-1', type: 'text' });
      const layer2 = makeLayer({ id: 'layer-2', type: 'icon' });

      storeState = buildStore({
        selectedLayers: [makeFabricObject('layer-1'), makeFabricObject('layer-2')],
        layers: [layer1, layer2],
        getSelectedLayerIds: vi.fn(() => ['layer-1', 'layer-2']),
        getBatchEditableProperties: vi.fn(() => ['opacity']),
      });

      render(<PropertiesPanel />);
      const batchPanel = screen.getByTestId('batch-panel');
      expect(batchPanel).toBeInTheDocument();
      expect(batchPanel.textContent).toContain('Batch:');
    });

    it('shows the "Batch Properties" header', () => {
      storeState = buildStore({
        selectedLayers: [makeFabricObject('layer-1'), makeFabricObject('layer-2')],
        layers: [makeLayer({ id: 'layer-1' }), makeLayer({ id: 'layer-2', type: 'icon' })],
        getSelectedLayerIds: vi.fn(() => ['layer-1', 'layer-2']),
        getBatchEditableProperties: vi.fn(() => []),
      });
      render(<PropertiesPanel />);
      expect(screen.getByText('Batch Properties')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Single selection — General Properties
  // -------------------------------------------------------------------------
  describe('single selection — general properties', () => {
    it('shows the layer name and type in the header', () => {
      const layer = makeLayer({ name: 'Title Text', type: 'text' });
      const fObj = makeFabricObject('layer-1');
      storeState = buildStore({ selectedLayers: [fObj], layers: [layer] });
      render(<PropertiesPanel />);
      expect(screen.getByText('Title Text')).toBeInTheDocument();
      expect(screen.getByText('(text)')).toBeInTheDocument();
    });

    it('renders Position, Scale and Rotation sections', () => {
      const fObj = makeFabricObject('layer-1');
      storeState = buildStore({ selectedLayers: [fObj], layers: [makeLayer()] });
      render(<PropertiesPanel />);
      expect(screen.getByText('Position')).toBeInTheDocument();
      expect(screen.getByText('Scale')).toBeInTheDocument();
      expect(screen.getByText('Rotation')).toBeInTheDocument();
    });

    it('renders the Opacity label', () => {
      const fObj = makeFabricObject('layer-1');
      storeState = buildStore({ selectedLayers: [fObj], layers: [makeLayer()] });
      render(<PropertiesPanel />);
      expect(screen.getByText(/Opacity:/)).toBeInTheDocument();
    });

    it('renders Visible and Locked checkboxes', () => {
      const fObj = makeFabricObject('layer-1');
      storeState = buildStore({ selectedLayers: [fObj], layers: [makeLayer()] });
      render(<PropertiesPanel />);
      expect(screen.getByLabelText(/Visible/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Locked/i)).toBeInTheDocument();
    });

    it('toggles Visible checkbox and calls set + updateLayer', () => {
      const updateLayer = vi.fn();
      const layer = makeLayer();
      const fObj = makeFabricObject('layer-1');
      storeState = buildStore({ selectedLayers: [fObj], layers: [layer], updateLayer });
      render(<PropertiesPanel />);
      const checkbox = screen.getByLabelText(/Visible/i) as HTMLInputElement;
      expect(checkbox.checked).toBe(true);
      fireEvent.click(checkbox);
      expect(fObj.set).toHaveBeenCalledWith({ visible: false });
      expect(updateLayer).toHaveBeenCalledWith('layer-1', expect.objectContaining({ visible: false }));
    });

    it('toggles Locked checkbox and calls set + updateLayer', () => {
      const updateLayer = vi.fn();
      const fObj = makeFabricObject('layer-1');
      storeState = buildStore({ selectedLayers: [fObj], layers: [makeLayer()], updateLayer });
      render(<PropertiesPanel />);
      const checkbox = screen.getByLabelText(/Locked/i) as HTMLInputElement;
      fireEvent.click(checkbox);
      expect(fObj.set).toHaveBeenCalledWith({ selectable: false, evented: false });
      expect(updateLayer).toHaveBeenCalledWith('layer-1', expect.objectContaining({ locked: true }));
    });

    it('aspect ratio lock button starts locked and toggles on click', () => {
      const fObj = makeFabricObject('layer-1');
      storeState = buildStore({ selectedLayers: [fObj], layers: [makeLayer()] });
      render(<PropertiesPanel />);
      const lockBtn = screen.getByLabelText(/Unlock aspect ratio/i);
      expect(lockBtn).toHaveAttribute('aria-pressed', 'true');
      fireEvent.click(lockBtn);
      expect(screen.getByLabelText(/Lock aspect ratio/i)).toHaveAttribute('aria-pressed', 'false');
    });

    it('center-on-print-area button renders and fires without throwing', () => {
      const fObj = makeFabricObject('layer-1');
      const surface = { slug: 'front', printAreaX: 50, printAreaY: 50, printAreaWidth: 200, printAreaHeight: 200 };
      storeState = buildStore({ selectedLayers: [fObj], layers: [makeLayer()], surfaces: [surface], activeSurface: 'front' });
      render(<PropertiesPanel />);
      const btn = screen.getByLabelText('Center on print area');
      fireEvent.click(btn); // should not throw
      expect(btn).toBeInTheDocument();
    });

    it('fit-to-print-area button renders and fires without throwing', () => {
      const fObj = makeFabricObject('layer-1');
      const surface = { slug: 'front', printAreaX: 50, printAreaY: 50, printAreaWidth: 200, printAreaHeight: 200 };
      storeState = buildStore({ selectedLayers: [fObj], layers: [makeLayer()], surfaces: [surface], activeSurface: 'front' });
      render(<PropertiesPanel />);
      fireEvent.click(screen.getByLabelText('Fit to print area'));
    });

    it('rotation range slider fires handleChange for angle', () => {
      const updateLayer = vi.fn();
      const fObj = makeFabricObject('layer-1');
      storeState = buildStore({ selectedLayers: [fObj], layers: [makeLayer()], updateLayer });
      render(<PropertiesPanel />);
      const sliders = screen.getAllByRole('slider');
      const rotationSlider = sliders.find((s) => s.getAttribute('max') === '360');
      expect(rotationSlider).toBeDefined();
      fireEvent.change(rotationSlider!, { target: { value: '45' } });
      expect(fObj.set).toHaveBeenCalledWith({ angle: 45 });
    });

    it('opacity slider fires handleChange for opacity', () => {
      const updateLayer = vi.fn();
      const fObj = makeFabricObject('layer-1');
      storeState = buildStore({ selectedLayers: [fObj], layers: [makeLayer()], updateLayer });
      render(<PropertiesPanel />);
      const sliders = screen.getAllByRole('slider');
      const opacitySlider = sliders.find((s) => s.getAttribute('max') === '1');
      expect(opacitySlider).toBeDefined();
      fireEvent.change(opacitySlider!, { target: { value: '0.5' } });
      expect(fObj.set).toHaveBeenCalledWith({ opacity: 0.5 });
    });
  });

  // -------------------------------------------------------------------------
  // Single selection — Text type sub-panel
  // -------------------------------------------------------------------------
  describe('single selection — text layer', () => {
    function setup(layerOverrides: Partial<any> = {}, storeOverrides: Partial<any> = {}) {
      const layer = makeLayer({ type: 'text', ...layerOverrides });
      const fObj = makeFabricObject('layer-1');
      storeState = buildStore({ selectedLayers: [fObj], layers: [layer], ...storeOverrides });
      return { layer, fObj };
    }

    it('renders the Text sub-panel with a textarea', () => {
      setup();
      render(<PropertiesPanel />);
      const textarea = screen.getByRole('textbox');
      expect(textarea).toBeInTheDocument();
      expect((textarea as HTMLTextAreaElement).value).toBe('Hello');
    });

    it('calls updateLayer when text textarea changes', () => {
      const updateLayer = vi.fn();
      setup({}, { updateLayer });
      render(<PropertiesPanel />);
      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: 'New text' } });
      expect(updateLayer).toHaveBeenCalledWith('layer-1', expect.objectContaining({
        data: expect.objectContaining({ text: 'New text' }),
      }));
    });

    it('shows Bold/Italic/Underline/Align style toggles', () => {
      setup();
      render(<PropertiesPanel />);
      expect(screen.getByLabelText('Bold')).toBeInTheDocument();
      expect(screen.getByLabelText('Italic')).toBeInTheDocument();
      expect(screen.getByLabelText('Underline')).toBeInTheDocument();
      expect(screen.getByLabelText('Align left')).toBeInTheDocument();
      expect(screen.getByLabelText('Align center')).toBeInTheDocument();
      expect(screen.getByLabelText('Align right')).toBeInTheDocument();
    });

    it('Bold toggle is not pressed when fontWeight is normal', () => {
      setup();
      render(<PropertiesPanel />);
      expect(screen.getByLabelText('Bold')).toHaveAttribute('aria-pressed', 'false');
    });

    it('Bold toggle is pressed when fontWeight is bold', () => {
      setup({ data: { text: 'hi', fontFamily: 'Arial', fontSize: 24, fontWeight: 'bold', fontStyle: 'normal', fill: '#000', textAlign: 'left', lineHeight: 1.2, charSpacing: 0 } });
      render(<PropertiesPanel />);
      expect(screen.getByLabelText('Bold')).toHaveAttribute('aria-pressed', 'true');
    });

    it('Bold toggle is pressed when fontWeight is numeric >= 600', () => {
      setup({ data: { text: 'hi', fontFamily: 'Arial', fontSize: 24, fontWeight: 700, fontStyle: 'normal', fill: '#000', textAlign: 'left', lineHeight: 1.2, charSpacing: 0 } });
      render(<PropertiesPanel />);
      expect(screen.getByLabelText('Bold')).toHaveAttribute('aria-pressed', 'true');
    });

    it('clicking Bold on normal text sets fontWeight to bold', () => {
      const updateLayer = vi.fn();
      setup({}, { updateLayer });
      render(<PropertiesPanel />);
      fireEvent.click(screen.getByLabelText('Bold'));
      expect(updateLayer).toHaveBeenCalledWith('layer-1', expect.objectContaining({
        data: expect.objectContaining({ fontWeight: 'bold' }),
      }));
    });

    it('clicking Bold on bold text sets fontWeight to normal', () => {
      const updateLayer = vi.fn();
      setup({ data: { text: 'hi', fontFamily: 'Arial', fontSize: 24, fontWeight: 'bold', fontStyle: 'normal', fill: '#000', textAlign: 'left', lineHeight: 1.2, charSpacing: 0 } }, { updateLayer });
      render(<PropertiesPanel />);
      fireEvent.click(screen.getByLabelText('Bold'));
      expect(updateLayer).toHaveBeenCalledWith('layer-1', expect.objectContaining({
        data: expect.objectContaining({ fontWeight: 'normal' }),
      }));
    });

    it('clicking Italic on normal text sets fontStyle to italic', () => {
      const updateLayer = vi.fn();
      setup({}, { updateLayer });
      render(<PropertiesPanel />);
      fireEvent.click(screen.getByLabelText('Italic'));
      expect(updateLayer).toHaveBeenCalledWith('layer-1', expect.objectContaining({
        data: expect.objectContaining({ fontStyle: 'italic' }),
      }));
    });

    it('clicking Italic on italic text sets fontStyle to normal', () => {
      const updateLayer = vi.fn();
      setup({ data: { text: 'hi', fontFamily: 'Arial', fontSize: 24, fontWeight: 'normal', fontStyle: 'italic', fill: '#000', textAlign: 'left', lineHeight: 1.2, charSpacing: 0 } }, { updateLayer });
      render(<PropertiesPanel />);
      fireEvent.click(screen.getByLabelText('Italic'));
      expect(updateLayer).toHaveBeenCalledWith('layer-1', expect.objectContaining({
        data: expect.objectContaining({ fontStyle: 'normal' }),
      }));
    });

    it('clicking Underline toggles underline to true', () => {
      const updateLayer = vi.fn();
      setup({ data: { text: 'hi', fontFamily: 'Arial', fontSize: 24, fontWeight: 'normal', fontStyle: 'normal', fill: '#000', textAlign: 'left', lineHeight: 1.2, charSpacing: 0, underline: false } }, { updateLayer });
      render(<PropertiesPanel />);
      fireEvent.click(screen.getByLabelText('Underline'));
      expect(updateLayer).toHaveBeenCalledWith('layer-1', expect.objectContaining({
        data: expect.objectContaining({ underline: true }),
      }));
    });

    it('clicking Align right sets textAlign to right', () => {
      const updateLayer = vi.fn();
      setup({}, { updateLayer });
      render(<PropertiesPanel />);
      fireEvent.click(screen.getByLabelText('Align right'));
      expect(updateLayer).toHaveBeenCalledWith('layer-1', expect.objectContaining({
        data: expect.objectContaining({ textAlign: 'right' }),
      }));
    });

    it('clicking Align center sets textAlign to center', () => {
      const updateLayer = vi.fn();
      setup({}, { updateLayer });
      render(<PropertiesPanel />);
      fireEvent.click(screen.getByLabelText('Align center'));
      expect(updateLayer).toHaveBeenCalledWith('layer-1', expect.objectContaining({
        data: expect.objectContaining({ textAlign: 'center' }),
      }));
    });

    it('does NOT show AI button when onGenerateAiText is not provided', () => {
      setup();
      render(<PropertiesPanel />);
      expect(screen.queryByText(/AI ideas/i)).not.toBeInTheDocument();
    });

    it('shows AI ideas button when onGenerateAiText prop is provided', () => {
      setup();
      render(<PropertiesPanel onGenerateAiText={vi.fn().mockResolvedValue({ suggestions: [] })} />);
      expect(screen.getByText(/AI ideas/i)).toBeInTheDocument();
    });

    it('opens the AI panel when the AI ideas button is clicked', () => {
      setup();
      render(<PropertiesPanel onGenerateAiText={vi.fn().mockResolvedValue({ suggestions: [] })} />);
      fireEvent.click(screen.getByText(/AI ideas/i));
      // The AI prompt input has id="ai-text-prompt"
      const input = document.getElementById('ai-text-prompt');
      expect(input).toBeInTheDocument();
    });

    it('shows validation error when Enter is pressed with empty prompt', async () => {
      const onGenerateAiText = vi.fn().mockResolvedValue({ suggestions: [] });
      setup();
      render(<PropertiesPanel onGenerateAiText={onGenerateAiText} />);
      fireEvent.click(screen.getByText(/AI ideas/i));
      // AI prompt input must be visible (panel opened)
      const input = document.getElementById('ai-text-prompt') as HTMLInputElement;
      expect(input).toBeInTheDocument();
      // Press Enter with empty prompt — this calls handleSuggest which checks for empty
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
      // Error message appears — need to wait a tick for state update
      await new Promise((r) => setTimeout(r, 10));
      expect(screen.getByText(/Tell us the vibe/i)).toBeInTheDocument();
      expect(onGenerateAiText).not.toHaveBeenCalled();
    });

    it('calls onGenerateAiText when Suggest is clicked with a non-empty prompt', () => {
      const onGenerateAiText = vi.fn().mockResolvedValue({ suggestions: ['Cool tagline'] });
      setup();
      render(<PropertiesPanel onGenerateAiText={onGenerateAiText} productName="Rad Shirt" />);
      fireEvent.click(screen.getByText(/AI ideas/i));
      const input = document.getElementById('ai-text-prompt') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'punny dog dad' } });
      fireEvent.click(screen.getByText('Suggest'));
      expect(onGenerateAiText).toHaveBeenCalledWith(expect.objectContaining({
        prompt: 'punny dog dad',
        productName: 'Rad Shirt',
        n: 4,
      }));
    });

    it('renders AI suggestions after they resolve and patches text on click', async () => {
      const updateLayer = vi.fn();
      const onGenerateAiText = vi.fn().mockResolvedValue({ suggestions: ['Tagline A', 'Tagline B'] });
      setup({}, { updateLayer });
      const { findByText } = render(<PropertiesPanel onGenerateAiText={onGenerateAiText} />);
      fireEvent.click(screen.getByText(/AI ideas/i));
      const input = document.getElementById('ai-text-prompt') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'catchy' } });
      fireEvent.click(screen.getByText('Suggest'));
      const taglineBtn = await findByText('Tagline A');
      expect(taglineBtn).toBeInTheDocument();
      fireEvent.click(taglineBtn);
      expect(updateLayer).toHaveBeenCalledWith('layer-1', expect.objectContaining({
        data: expect.objectContaining({ text: 'Tagline A' }),
      }));
    });

    it('shows AI error when onGenerateAiText rejects', async () => {
      const onGenerateAiText = vi.fn().mockRejectedValue(new Error('API failure'));
      setup();
      const { findByText } = render(<PropertiesPanel onGenerateAiText={onGenerateAiText} />);
      fireEvent.click(screen.getByText(/AI ideas/i));
      const input = document.getElementById('ai-text-prompt') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'catchy' } });
      fireEvent.click(screen.getByText('Suggest'));
      const errMsg = await findByText('API failure');
      expect(errMsg).toBeInTheDocument();
    });

    it('hides AI panel when Hide AI is clicked', () => {
      setup();
      render(<PropertiesPanel onGenerateAiText={vi.fn().mockResolvedValue({ suggestions: [] })} />);
      fireEvent.click(screen.getByText(/AI ideas/i));
      expect(document.getElementById('ai-text-prompt')).toBeInTheDocument();
      fireEvent.click(screen.getByText(/Hide AI/i));
      expect(document.getElementById('ai-text-prompt')).not.toBeInTheDocument();
    });

    it('renders FontPicker with current fontFamily value', () => {
      setup();
      render(<PropertiesPanel />);
      expect(screen.getByTestId('font-picker')).toBeInTheDocument();
      expect(screen.getByText('font:Arial')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Single selection — Icon type sub-panel
  // -------------------------------------------------------------------------
  describe('single selection — icon layer', () => {
    function makeIconLayer(dataOverrides: Partial<any> = {}) {
      return makeLayer({
        type: 'icon',
        data: { iconName: 'star', fill: '#ff0000', color: '#ff0000', size: 48, ...dataOverrides },
      });
    }

    it('renders the icon name input with current value', () => {
      const fObj = makeFabricObject('layer-1');
      storeState = buildStore({ selectedLayers: [fObj], layers: [makeIconLayer()] });
      render(<PropertiesPanel />);
      const iconInput = screen.getByDisplayValue('star');
      expect(iconInput).toBeInTheDocument();
    });

    it('calls updateLayer when icon name input changes', () => {
      const updateLayer = vi.fn();
      const fObj = makeFabricObject('layer-1');
      storeState = buildStore({ selectedLayers: [fObj], layers: [makeIconLayer()], updateLayer });
      render(<PropertiesPanel />);
      fireEvent.change(screen.getByDisplayValue('star'), { target: { value: 'home' } });
      expect(updateLayer).toHaveBeenCalledWith('layer-1', expect.objectContaining({
        data: expect.objectContaining({ iconName: 'home' }),
      }));
    });

    it('renders Size field with default value 48 for icon', () => {
      const fObj = makeFabricObject('layer-1');
      storeState = buildStore({ selectedLayers: [fObj], layers: [makeIconLayer()] });
      render(<PropertiesPanel />);
      expect(screen.getByDisplayValue('48')).toBeInTheDocument();
    });

    it('renders a ColorPicker for icon fill', () => {
      const fObj = makeFabricObject('layer-1');
      storeState = buildStore({ selectedLayers: [fObj], layers: [makeIconLayer()] });
      render(<PropertiesPanel />);
      expect(screen.getByTestId('color-picker')).toBeInTheDocument();
    });

    it('does NOT render textarea (text content editor) for icon layers', () => {
      const fObj = makeFabricObject('layer-1');
      storeState = buildStore({ selectedLayers: [fObj], layers: [makeIconLayer()] });
      render(<PropertiesPanel />);
      // textarea role = "textbox" with rows attribute; icon name input has role="textbox" too
      // but there should be no <textarea> element
      expect(document.querySelector('textarea')).not.toBeInTheDocument();
    });

    it('renders the Icon name label', () => {
      const fObj = makeFabricObject('layer-1');
      storeState = buildStore({ selectedLayers: [fObj], layers: [makeIconLayer()] });
      render(<PropertiesPanel />);
      expect(screen.getByText('Icon name')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Single selection — Image type sub-panel
  // -------------------------------------------------------------------------
  describe('single selection — image layer', () => {
    function makeImageLayer(dataOverrides: Partial<any> = {}) {
      return makeLayer({
        type: 'image',
        data: {
          url: 'https://example.com/img.png',
          originalWidth: 800,
          filters: { brightness: 0, contrast: 0, saturation: 0, blur: 0 },
          ...dataOverrides,
        },
      });
    }

    it('renders Filters section with Brightness, Contrast, Saturation, Blur labels', () => {
      const fObj = makeFabricObject('layer-1');
      storeState = buildStore({ selectedLayers: [fObj], layers: [makeImageLayer()] });
      render(<PropertiesPanel />);
      expect(screen.getByText('Brightness')).toBeInTheDocument();
      expect(screen.getByText('Contrast')).toBeInTheDocument();
      expect(screen.getByText('Saturation')).toBeInTheDocument();
      expect(screen.getByText('Blur')).toBeInTheDocument();
    });

    it('renders a Reset button for filters', () => {
      const fObj = makeFabricObject('layer-1');
      storeState = buildStore({ selectedLayers: [fObj], layers: [makeImageLayer()] });
      render(<PropertiesPanel />);
      expect(screen.getByText('Reset')).toBeInTheDocument();
    });

    it('clicking Reset calls updateLayer with default filter values', () => {
      const updateLayer = vi.fn();
      const fObj = makeFabricObject('layer-1');
      storeState = buildStore({
        selectedLayers: [fObj],
        layers: [makeImageLayer({ filters: { brightness: 0.5, contrast: 0.3, saturation: 0.1, blur: 0.0 } })],
        updateLayer,
      });
      render(<PropertiesPanel />);
      fireEvent.click(screen.getByText('Reset'));
      expect(updateLayer).toHaveBeenCalledWith('layer-1', expect.objectContaining({
        data: expect.objectContaining({
          filters: { brightness: 0, contrast: 0, saturation: 0, blur: 0 },
        }),
      }));
    });

    it('shows AI generation metadata block when data.ai is set', () => {
      const fObj = makeFabricObject('layer-1');
      storeState = buildStore({
        selectedLayers: [fObj],
        layers: [makeImageLayer({ ai: { prompt: 'a happy dog', style: 'illustration', transparent: true } })],
      });
      render(<PropertiesPanel />);
      expect(screen.getByText(/a happy dog/i)).toBeInTheDocument();
      expect(screen.getByText(/Regenerate/i)).toBeInTheDocument();
    });

    it('dispatches designer:request-ai-regenerate event when Regenerate is clicked', () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
      const fObj = makeFabricObject('layer-1');
      storeState = buildStore({
        selectedLayers: [fObj],
        layers: [makeImageLayer({ ai: { prompt: 'a happy dog', style: 'illustration', transparent: true } })],
      });
      render(<PropertiesPanel />);
      fireEvent.click(screen.getByText(/Regenerate/i));
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'designer:request-ai-regenerate' }),
      );
      dispatchSpy.mockRestore();
    });

    it('does NOT show Regenerate when data.ai is absent', () => {
      const fObj = makeFabricObject('layer-1');
      storeState = buildStore({ selectedLayers: [fObj], layers: [makeImageLayer()] });
      render(<PropertiesPanel />);
      expect(screen.queryByText(/Regenerate/i)).not.toBeInTheDocument();
    });

    it('shows print quality block when assessPrintQuality returns a result', () => {
      mockAssessPrintQuality.mockReturnValue({ level: 'poor', reason: 'Too small', detailRatio: 0.3 });
      const fObj = makeFabricObject('layer-1');
      storeState = buildStore({ selectedLayers: [fObj], layers: [makeImageLayer()] });
      render(<PropertiesPanel />);
      expect(screen.getByText(/Print quality:/i)).toBeInTheDocument();
      expect(screen.getByText(/Poor/i)).toBeInTheDocument();
    });

    it('shows "great" print quality level text', () => {
      mockAssessPrintQuality.mockReturnValue({ level: 'great', reason: 'High res', detailRatio: 2.0 });
      const fObj = makeFabricObject('layer-1');
      storeState = buildStore({ selectedLayers: [fObj], layers: [makeImageLayer()] });
      render(<PropertiesPanel />);
      expect(screen.getByText(/Great/)).toBeInTheDocument();
    });

    it('shows "okay" print quality level text', () => {
      mockAssessPrintQuality.mockReturnValue({ level: 'okay', reason: 'Borderline', detailRatio: 0.9 });
      const fObj = makeFabricObject('layer-1');
      storeState = buildStore({ selectedLayers: [fObj], layers: [makeImageLayer()] });
      render(<PropertiesPanel />);
      expect(screen.getByText(/Okay/)).toBeInTheDocument();
    });

    it('does NOT render textarea for image layers', () => {
      const fObj = makeFabricObject('layer-1');
      storeState = buildStore({ selectedLayers: [fObj], layers: [makeImageLayer()] });
      render(<PropertiesPanel />);
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // TintAwareColorPicker / PerTintColorGrid (exercised via text layer)
  // -------------------------------------------------------------------------
  describe('PerTintColorGrid and TintAwareColorPicker', () => {
    it('renders Per-shirt colour label in text layer panel', () => {
      const fObj = makeFabricObject('layer-1');
      storeState = buildStore({ selectedLayers: [fObj], layers: [makeLayer({ type: 'text' })], mockupTint: null });
      render(<PropertiesPanel />);
      expect(screen.getByText(/Per-shirt colour/i)).toBeInTheDocument();
    });

    it('clicking No tint swatch calls setMockupTint(null)', () => {
      const setMockupTint = vi.fn();
      const fObj = makeFabricObject('layer-1');
      storeState = buildStore({ selectedLayers: [fObj], layers: [makeLayer({ type: 'text' })], mockupTint: null, setMockupTint });
      render(<PropertiesPanel />);
      fireEvent.click(screen.getByLabelText(/No tint → base color/i));
      expect(setMockupTint).toHaveBeenCalledWith(null);
    });

    it('clicking Navy swatch calls setMockupTint with #1f2a44', () => {
      const setMockupTint = vi.fn();
      const fObj = makeFabricObject('layer-1');
      storeState = buildStore({ selectedLayers: [fObj], layers: [makeLayer({ type: 'text' })], mockupTint: null, setMockupTint });
      render(<PropertiesPanel />);
      // Match aria-label with "Navy" prefix
      const navyBtn = screen.getAllByRole('button').find((b) => b.getAttribute('aria-label')?.startsWith('Navy'));
      expect(navyBtn).toBeDefined();
      fireEvent.click(navyBtn!);
      expect(setMockupTint).toHaveBeenCalledWith('#1f2a44');
    });

    it('shows "Pick a colour to override" when mockupTint active and no override', () => {
      const fObj = makeFabricObject('layer-1');
      storeState = buildStore({ selectedLayers: [fObj], layers: [makeLayer({ type: 'text' })], mockupTint: '#1f2a44' });
      render(<PropertiesPanel />);
      expect(screen.getByText(/Pick a colour to override/i)).toBeInTheDocument();
    });

    it('shows "Override active" and "reset to base" when tint override exists', () => {
      const fObj = makeFabricObject('layer-1');
      const layer = makeLayer({
        type: 'text',
        data: {
          text: 'hi', fontFamily: 'Arial', fontSize: 24, fontWeight: 'normal',
          fontStyle: 'normal', fill: '#000000', textAlign: 'left', lineHeight: 1.2,
          charSpacing: 0, fillByTint: { '#1f2a44': '#ffffff' },
        },
      });
      storeState = buildStore({ selectedLayers: [fObj], layers: [layer], mockupTint: '#1f2a44' });
      render(<PropertiesPanel />);
      expect(screen.getByText(/Override active/i)).toBeInTheDocument();
      expect(screen.getByText(/reset to base/i)).toBeInTheDocument();
    });

    it('clicking reset to base removes the per-tint override', () => {
      const updateLayer = vi.fn();
      const fObj = makeFabricObject('layer-1');
      const layer = makeLayer({
        type: 'text',
        data: {
          text: 'hi', fontFamily: 'Arial', fontSize: 24, fontWeight: 'normal',
          fontStyle: 'normal', fill: '#000000', textAlign: 'left', lineHeight: 1.2,
          charSpacing: 0, fillByTint: { '#1f2a44': '#ffffff' },
        },
      });
      storeState = buildStore({ selectedLayers: [fObj], layers: [layer], mockupTint: '#1f2a44', updateLayer });
      render(<PropertiesPanel />);
      fireEvent.click(screen.getByText(/reset to base/i));
      expect(updateLayer).toHaveBeenCalledWith('layer-1', expect.objectContaining({
        data: expect.objectContaining({ fillByTint: undefined }),
      }));
    });

    it('renders Auto-contrast all tints button', () => {
      const fObj = makeFabricObject('layer-1');
      storeState = buildStore({ selectedLayers: [fObj], layers: [makeLayer({ type: 'text' })] });
      render(<PropertiesPanel />);
      expect(screen.getByText(/Auto-contrast all tints/i)).toBeInTheDocument();
    });

    it('clicking Auto-contrast all tints calls updateLayer with fillByTint overrides', () => {
      const updateLayer = vi.fn();
      const fObj = makeFabricObject('layer-1');
      storeState = buildStore({ selectedLayers: [fObj], layers: [makeLayer({ type: 'text' })], updateLayer });
      render(<PropertiesPanel />);
      fireEvent.click(screen.getByText(/Auto-contrast all tints/i));
      expect(updateLayer).toHaveBeenCalledWith('layer-1', expect.objectContaining({
        data: expect.objectContaining({ fillByTint: expect.anything() }),
      }));
    });

    it('shows Clear all button when overrides exist', () => {
      const fObj = makeFabricObject('layer-1');
      const layer = makeLayer({
        type: 'text',
        data: {
          text: 'hi', fontFamily: 'Arial', fontSize: 24, fontWeight: 'normal',
          fontStyle: 'normal', fill: '#000000', textAlign: 'left', lineHeight: 1.2,
          charSpacing: 0, fillByTint: { '#111111': '#ffffff' },
        },
      });
      storeState = buildStore({ selectedLayers: [fObj], layers: [layer] });
      render(<PropertiesPanel />);
      expect(screen.getByText(/Clear all/i)).toBeInTheDocument();
    });

    it('clicking Clear all removes all per-tint overrides', () => {
      const updateLayer = vi.fn();
      const fObj = makeFabricObject('layer-1');
      const layer = makeLayer({
        type: 'text',
        data: {
          text: 'hi', fontFamily: 'Arial', fontSize: 24, fontWeight: 'normal',
          fontStyle: 'normal', fill: '#000000', textAlign: 'left', lineHeight: 1.2,
          charSpacing: 0, fillByTint: { '#111111': '#ffffff' },
        },
      });
      storeState = buildStore({ selectedLayers: [fObj], layers: [layer], updateLayer });
      render(<PropertiesPanel />);
      fireEvent.click(screen.getByText(/Clear all/i));
      expect(updateLayer).toHaveBeenCalledWith('layer-1', expect.objectContaining({
        data: expect.objectContaining({ fillByTint: undefined }),
      }));
    });

    it('does NOT render Clear all button when no overrides exist', () => {
      const fObj = makeFabricObject('layer-1');
      storeState = buildStore({ selectedLayers: [fObj], layers: [makeLayer({ type: 'text' })] });
      render(<PropertiesPanel />);
      expect(screen.queryByText(/Clear all/i)).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Fallback — primaryLayer not found in the layers store
  // -------------------------------------------------------------------------
  describe('primaryLayer not in layers store', () => {
    it('shows "Properties" as the header title when layer is not found', () => {
      const fObj = makeFabricObject('unknown-id');
      storeState = buildStore({
        selectedLayers: [fObj],
        layers: [], // layer-1 not present
      });
      render(<PropertiesPanel />);
      expect(screen.getByText('Properties')).toBeInTheDocument();
      expect(screen.getByText('(unknown)')).toBeInTheDocument();
    });

    it('renders general property controls even without a matching layer', () => {
      const fObj = makeFabricObject('unknown-id');
      storeState = buildStore({ selectedLayers: [fObj], layers: [] });
      render(<PropertiesPanel />);
      expect(screen.getByText('Position')).toBeInTheDocument();
    });
  });
});
