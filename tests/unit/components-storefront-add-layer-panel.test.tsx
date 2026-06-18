// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Fabric — only type imports in the component; no runtime use needed.
vi.mock('fabric', () => ({}));

// layerFactory — createFabricText and createFabricIcon return a minimal stub.
const mockFabricText = {
  left: 400,
  top: 300,
  scaleX: 1,
  scaleY: 1,
  data: {} as Record<string, unknown>,
};
const mockFabricIcon = {
  left: 400,
  top: 300,
  scaleX: 1,
  scaleY: 1,
  data: {} as Record<string, unknown>,
};

vi.mock('@/lib/designer/layerFactory', () => ({
  createFabricText: vi.fn(() => mockFabricText),
  createFabricIcon: vi.fn(() => mockFabricIcon),
  createFabricImage: vi.fn(),
}));

// fontVirtualizer — loadGoogleFont resolves immediately.
vi.mock('@/lib/designer/fontVirtualizer', () => ({
  loadGoogleFont: vi.fn().mockResolvedValue(undefined),
}));

// contrastInk — default returns null (no tint ink override). Tests that need a
// different return value call vi.mocked(contrastInk.contrastingInkForTint).mockReturnValueOnce.
vi.mock('@/lib/designer/contrastInk', () => ({
  contrastingInkForTint: vi.fn(() => null),
}));

// aiPromptBuilder — only provides a type; the mock just needs to export it.
vi.mock('@/lib/designer/aiPromptBuilder', () => ({}));

// ---------------------------------------------------------------------------
// Canvas store stub
// ---------------------------------------------------------------------------
const mockAddLayer = vi.fn(() => 'new-layer-id');
const mockSetSelectedLayers = vi.fn();

let canvasStoreState: {
  canvas: {
    getWidth: ReturnType<typeof vi.fn>;
    getHeight: ReturnType<typeof vi.fn>;
    add: ReturnType<typeof vi.fn>;
    setActiveObject: ReturnType<typeof vi.fn>;
    renderAll: ReturnType<typeof vi.fn>;
  } | null;
  addLayer: ReturnType<typeof vi.fn>;
  setSelectedLayers: ReturnType<typeof vi.fn>;
  brandLogoUrl: string;
} = {
  canvas: null,
  addLayer: mockAddLayer,
  setSelectedLayers: mockSetSelectedLayers,
  brandLogoUrl: '',
};

// Also expose getState so handleAddText can read mockupTint.
const mockGetState = vi.fn(() => ({ mockupTint: null }));

vi.mock('@/lib/designer/canvasStore', () => ({
  useCanvasStore: (selector: (s: typeof canvasStoreState) => unknown) =>
    selector(canvasStoreState),
  // Provide getState on the mock for direct store accesses inside handlers.
  get useCanvasStore() {
    const fn = (selector: (s: typeof canvasStoreState) => unknown) =>
      selector(canvasStoreState);
    fn.getState = mockGetState;
    return fn;
  },
}));

// ---------------------------------------------------------------------------
// useAddImageLayer hook stub
// ---------------------------------------------------------------------------
const mockAddFromResult = vi.fn().mockResolvedValue('img-layer-id');
const mockAddImageLayerFn = vi.fn().mockResolvedValue(undefined) as ReturnType<
  typeof vi.fn
> & { addFromResult: ReturnType<typeof vi.fn> };
mockAddImageLayerFn.addFromResult = mockAddFromResult;

vi.mock('@/lib/designer/hooks/useAddImageLayer', () => ({
  useAddImageLayer: vi.fn(() => mockAddImageLayerFn),
}));

// ---------------------------------------------------------------------------
// Component under test
// ---------------------------------------------------------------------------
import AddLayerPanel from '@/components/storefront/designer/AddLayerPanel';
import * as contrastInk from '@/lib/designer/contrastInk';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const makeCanvas = () => ({
  getWidth: vi.fn(() => 800),
  getHeight: vi.fn(() => 600),
  add: vi.fn(),
  setActiveObject: vi.fn(),
  renderAll: vi.fn(),
});

const baseProps = {
  onUploadImage: vi.fn().mockResolvedValue({ url: 'https://example.com/img.png', width: 100, height: 100 }),
  onLayerAdded: vi.fn(),
  onClose: vi.fn(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('AddLayerPanel', () => {
  beforeEach(() => {
    canvasStoreState = {
      canvas: null,
      addLayer: mockAddLayer,
      setSelectedLayers: mockSetSelectedLayers,
      brandLogoUrl: '',
    };
    mockAddLayer.mockClear();
    mockSetSelectedLayers.mockClear();
    mockAddFromResult.mockClear();
    mockAddImageLayerFn.mockClear();
    baseProps.onLayerAdded.mockClear();
    baseProps.onClose.mockClear();
    mockGetState.mockReturnValue({ mockupTint: null });
  });

  // ── Basic render ──────────────────────────────────────────────────────────

  it('renders the "Add Layer" heading', () => {
    render(<AddLayerPanel {...baseProps} />);
    expect(screen.getByText('Add Layer')).toBeInTheDocument();
  });

  it('renders the Text, Upload image buttons', () => {
    render(<AddLayerPanel {...baseProps} />);
    expect(screen.getByText('Text')).toBeInTheDocument();
    expect(screen.getByText('Upload image')).toBeInTheDocument();
  });

  it('renders the Icons section with all 9 icons', () => {
    render(<AddLayerPanel {...baseProps} />);
    expect(screen.getByText('Icons')).toBeInTheDocument();
    expect(screen.getByLabelText(/add star/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/add heart/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/add circle/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/add square/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/add triangle/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/add diamond/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/add arrow/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/add check/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/add bolt/i)).toBeInTheDocument();
  });

  it('renders Text presets section with all 6 presets', () => {
    render(<AddLayerPanel {...baseProps} />);
    expect(screen.getByText('Text presets')).toBeInTheDocument();
    expect(screen.getByLabelText(/add headline text preset/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/add script text preset/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/add vintage text preset/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/add pink text preset/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/add mono text preset/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/add quote text preset/i)).toBeInTheDocument();
  });

  // ── Close button ──────────────────────────────────────────────────────────

  it('renders a close button when onClose is provided', () => {
    render(<AddLayerPanel {...baseProps} />);
    expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
  });

  it('calls onClose when the close button is clicked', () => {
    render(<AddLayerPanel {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(baseProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('does not render a close button when onClose is absent', () => {
    const { onClose: _removed, ...propsNoClose } = baseProps;
    render(<AddLayerPanel {...propsNoClose} />);
    // Without onClose there should be no button named "Close"
    expect(screen.queryByRole('button', { name: /^close$/i })).toBeNull();
  });

  // ── Text layer button ─────────────────────────────────────────────────────

  it('does not call addLayer when canvas is null and Text is clicked', () => {
    canvasStoreState.canvas = null;
    render(<AddLayerPanel {...baseProps} />);
    fireEvent.click(screen.getByText('Text'));
    expect(mockAddLayer).not.toHaveBeenCalled();
  });

  it('calls addLayer with type=text when Text button is clicked', () => {
    canvasStoreState.canvas = makeCanvas();
    render(<AddLayerPanel {...baseProps} />);
    fireEvent.click(screen.getByText('Text'));
    expect(mockAddLayer).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'text' }),
    );
  });

  it('calls onLayerAdded("text") when Text button is clicked', () => {
    canvasStoreState.canvas = makeCanvas();
    render(<AddLayerPanel {...baseProps} />);
    fireEvent.click(screen.getByText('Text'));
    expect(baseProps.onLayerAdded).toHaveBeenCalledWith('text');
  });

  // ── Icon layer buttons ────────────────────────────────────────────────────

  it('calls addLayer with type=icon when star icon is clicked', () => {
    canvasStoreState.canvas = makeCanvas();
    render(<AddLayerPanel {...baseProps} />);
    fireEvent.click(screen.getByLabelText(/add star/i));
    expect(mockAddLayer).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'icon' }),
    );
  });

  it('calls onLayerAdded("icon") when an icon button is clicked', () => {
    canvasStoreState.canvas = makeCanvas();
    render(<AddLayerPanel {...baseProps} />);
    fireEvent.click(screen.getByLabelText(/add heart/i));
    expect(baseProps.onLayerAdded).toHaveBeenCalledWith('icon');
  });

  it('does not call addLayer when canvas is null and an icon is clicked', () => {
    canvasStoreState.canvas = null;
    render(<AddLayerPanel {...baseProps} />);
    fireEvent.click(screen.getByLabelText(/add star/i));
    expect(mockAddLayer).not.toHaveBeenCalled();
  });

  // ── Text preset buttons ───────────────────────────────────────────────────

  it('clicking a text preset calls addLayer with type=text', async () => {
    canvasStoreState.canvas = makeCanvas();
    render(<AddLayerPanel {...baseProps} />);
    fireEvent.click(screen.getByLabelText(/add headline text preset/i));
    await waitFor(() => {
      expect(mockAddLayer).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'text' }),
      );
    });
  });

  it('clicking a text preset calls onLayerAdded("text")', async () => {
    canvasStoreState.canvas = makeCanvas();
    render(<AddLayerPanel {...baseProps} />);
    fireEvent.click(screen.getByLabelText(/add script text preset/i));
    await waitFor(() => {
      expect(baseProps.onLayerAdded).toHaveBeenCalledWith('text');
    });
  });

  // ── Brand logo button (conditional) ──────────────────────────────────────

  it('does not render "Use my logo" when brandLogoUrl is empty', () => {
    canvasStoreState.brandLogoUrl = '';
    render(<AddLayerPanel {...baseProps} />);
    expect(screen.queryByText(/use my logo/i)).toBeNull();
  });

  it('renders "Use my logo" when brandLogoUrl is set', () => {
    canvasStoreState.brandLogoUrl = 'https://example.com/logo.png';
    render(<AddLayerPanel {...baseProps} />);
    expect(screen.getByText(/use my logo/i)).toBeInTheDocument();
  });

  it('clicking "Use my logo" calls addFromResult and onLayerAdded("image")', async () => {
    canvasStoreState.brandLogoUrl = 'https://example.com/logo.png';
    canvasStoreState.canvas = makeCanvas();

    // Stub window.Image so the logo dimension loading resolves.
    const originalImage = window.Image;
    class MockImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 120;
      naturalHeight = 80;
      crossOrigin = '';
      set src(_url: string) {
        Promise.resolve().then(() => this.onload?.());
      }
    }
    // @ts-expect-error — replacing global Image with a lightweight stub
    window.Image = MockImage;

    render(<AddLayerPanel {...baseProps} />);
    fireEvent.click(screen.getByText(/use my logo/i));

    await waitFor(() => {
      expect(mockAddFromResult).toHaveBeenCalledWith(
        expect.objectContaining({ url: 'https://example.com/logo.png' }),
        'Brand logo',
      );
      expect(baseProps.onLayerAdded).toHaveBeenCalledWith('image');
    });

    window.Image = originalImage;
  });

  // ── Generate with AI button (conditional) ─────────────────────────────────

  it('does not render "Generate with AI" when onGenerateAiImage is absent', () => {
    render(<AddLayerPanel {...baseProps} />);
    expect(screen.queryByText(/generate with ai/i)).toBeNull();
  });

  it('renders "Generate with AI" when onGenerateAiImage is provided', () => {
    render(<AddLayerPanel {...baseProps} onGenerateAiImage={vi.fn()} />);
    expect(screen.getByText(/generate with ai/i)).toBeInTheDocument();
  });

  it('clicking "Generate with AI" dispatches designer:open-ai-modal event', () => {
    const handler = vi.fn();
    window.addEventListener('designer:open-ai-modal', handler);

    render(<AddLayerPanel {...baseProps} onGenerateAiImage={vi.fn()} />);
    fireEvent.click(screen.getByText(/generate with ai/i));

    expect(handler).toHaveBeenCalledTimes(1);
    window.removeEventListener('designer:open-ai-modal', handler);
  });

  // ── File input (Upload image path) ────────────────────────────────────────

  it('file input is hidden', () => {
    const { container } = render(<AddLayerPanel {...baseProps} />);
    const fileInput = container.querySelector('input[type="file"]');
    expect(fileInput).toBeInTheDocument();
    expect(fileInput).toHaveClass('hidden');
  });

  it('changing file input with a non-image file does not call addImageLayer', () => {
    const { container } = render(<AddLayerPanel {...baseProps} />);
    const fileInput = container.querySelector('input[type="file"]')!;
    const nonImageFile = new File(['data'], 'doc.pdf', { type: 'application/pdf' });
    Object.defineProperty(fileInput, 'files', { value: [nonImageFile], configurable: true });
    fireEvent.change(fileInput);
    expect(mockAddImageLayerFn).not.toHaveBeenCalled();
  });

  it('changing file input with an image file calls addImageLayer', async () => {
    const { container } = render(<AddLayerPanel {...baseProps} />);
    const fileInput = container.querySelector('input[type="file"]')!;
    const imageFile = new File(['pixels'], 'photo.png', { type: 'image/png' });
    Object.defineProperty(fileInput, 'files', { value: [imageFile], configurable: true });
    fireEvent.change(fileInput);
    await waitFor(() => {
      expect(mockAddImageLayerFn).toHaveBeenCalledWith(imageFile);
    });
  });

  it('calls onLayerAdded("image") after a successful file upload', async () => {
    const { container } = render(<AddLayerPanel {...baseProps} />);
    const fileInput = container.querySelector('input[type="file"]')!;
    const imageFile = new File(['pixels'], 'photo.png', { type: 'image/png' });
    Object.defineProperty(fileInput, 'files', { value: [imageFile], configurable: true });
    fireEvent.change(fileInput);
    await waitFor(() => {
      expect(baseProps.onLayerAdded).toHaveBeenCalledWith('image');
    });
  });

  // ── Tint-aware icon layer data ────────────────────────────────────────────

  it('includes fillByTint in icon layer data when mockupTint is a dark color', () => {
    canvasStoreState.canvas = makeCanvas();
    // Dark tint → contrastingInkForTint returns '#ffffff'
    vi.mocked(contrastInk.contrastingInkForTint).mockReturnValueOnce('#ffffff');
    mockGetState.mockReturnValueOnce({ mockupTint: '#000000' });

    render(<AddLayerPanel {...baseProps} />);
    fireEvent.click(screen.getByLabelText(/add star/i));

    expect(mockAddLayer).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ fillByTint: { '#000000': '#ffffff' } }),
      }),
    );
  });

  // ── className prop forwarded ──────────────────────────────────────────────

  it('applies the className prop to the root element', () => {
    const { container } = render(
      <AddLayerPanel {...baseProps} className="custom-class" />,
    );
    expect(container.firstChild).toHaveClass('custom-class');
  });
});
