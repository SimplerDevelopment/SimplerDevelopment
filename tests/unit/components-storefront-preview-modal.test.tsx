// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mock @/lib/designer/canvasStore — the component reads 5 slices from it.
// We expose mutable refs so individual tests can override values.
// ---------------------------------------------------------------------------
const mockCanvas = {
  getObjects: vi.fn(() => []),
  requestRenderAll: vi.fn(),
  toDataURL: vi.fn(() => 'data:image/png;base64,abc123'),
};

const storeState: {
  canvas: any;
  activeSurface: string;
  setActiveSurface: (s: string) => void;
  layersBySurface: Record<string, any[]>;
  mockupTint: string | null;
  setMockupTint: (t: string | null) => void;
} = {
  canvas: null,
  activeSurface: 'front',
  setActiveSurface: vi.fn((s) => { storeState.activeSurface = s; }),
  layersBySurface: {},
  mockupTint: null,
  setMockupTint: vi.fn((t) => { storeState.mockupTint = t; }),
};

vi.mock('@/lib/designer/canvasStore', () => ({
  useCanvasStore: (selector: (s: typeof storeState) => any) => selector(storeState),
}));

// ---------------------------------------------------------------------------
// Surfaces fixture
// ---------------------------------------------------------------------------
import type { DesignerSurface } from '@/lib/designer/types';

const SURFACES: DesignerSurface[] = [
  {
    id: 1,
    slug: 'front',
    name: 'Front',
    mockupImage: '/mockup-front.png',
    canvasWidth: 500,
    canvasHeight: 500,
    printAreaX: 100,
    printAreaY: 100,
    printAreaWidth: 300,
    printAreaHeight: 300,
    printDpi: 150,
    displayOrder: 0,
  },
  {
    id: 2,
    slug: 'back',
    name: 'Back',
    mockupImage: '/mockup-back.png',
    canvasWidth: 500,
    canvasHeight: 500,
    printAreaX: 100,
    printAreaY: 100,
    printAreaWidth: 300,
    printAreaHeight: 300,
    printDpi: 150,
    displayOrder: 1,
  },
];

// ---------------------------------------------------------------------------
// Import component under test (after mocks are registered)
// ---------------------------------------------------------------------------
import PreviewModal from '@/components/storefront/designer/PreviewModal';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function renderModal(props: Partial<React.ComponentProps<typeof PreviewModal>> = {}) {
  const defaults = {
    open: true,
    onClose: vi.fn(),
    surfaces: SURFACES,
    productName: 'T-Shirt',
    quantity: 10,
  };
  return render(<PreviewModal {...defaults} {...props} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  // Reset store state
  storeState.canvas = null;
  storeState.activeSurface = 'front';
  storeState.layersBySurface = {};
  storeState.mockupTint = null;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('PreviewModal', () => {
  // ---- closed state ---------------------------------------------------------
  describe('when closed (open=false)', () => {
    it('renders nothing', () => {
      const { container } = renderModal({ open: false });
      expect(container.firstChild).toBeNull();
    });
  });

  // ---- open state — dialog skeleton ----------------------------------------
  describe('when open', () => {
    it('renders the dialog with aria attributes', () => {
      renderModal();
      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAttribute('aria-label', 'Design preview');
    });

    it('shows the product name in the header', () => {
      renderModal({ productName: 'Hoodie' });
      expect(screen.getByText(/Preview your Hoodie/i)).toBeInTheDocument();
    });

    it('shows the subtitle about hidden print area', () => {
      renderModal();
      expect(
        screen.getByText(/print area, guides, and rulers are hidden/i),
      ).toBeInTheDocument();
    });

    it('renders a Close button', () => {
      renderModal();
      expect(screen.getByRole('button', { name: /close preview/i })).toBeInTheDocument();
    });

    it('renders a Keep editing button', () => {
      renderModal();
      expect(screen.getByRole('button', { name: /keep editing/i })).toBeInTheDocument();
    });
  });

  // ---- onClose wiring -------------------------------------------------------
  describe('close interactions', () => {
    it('calls onClose when the X button is clicked', () => {
      const onClose = vi.fn();
      renderModal({ onClose });
      fireEvent.click(screen.getByRole('button', { name: /close preview/i }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when the backdrop is clicked', () => {
      const onClose = vi.fn();
      const { container } = renderModal({ onClose });
      // backdrop is the absolute overlay div
      const backdrop = container.querySelector('.absolute.inset-0.bg-black\\/60');
      expect(backdrop).not.toBeNull();
      fireEvent.click(backdrop!);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when Keep editing is clicked', () => {
      const onClose = vi.fn();
      renderModal({ onClose });
      fireEvent.click(screen.getByRole('button', { name: /keep editing/i }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  // ---- totalLabel / quantity footer ----------------------------------------
  describe('footer pricing', () => {
    it('shows totalLabel and quantity when provided', () => {
      renderModal({ totalLabel: '$125.00', quantity: 12 });
      expect(screen.getByText('$125.00')).toBeInTheDocument();
      expect(screen.getByText(/for 12 pieces/i)).toBeInTheDocument();
    });

    it('shows "piece" (singular) when quantity is 1', () => {
      renderModal({ totalLabel: '$10.00', quantity: 1 });
      expect(screen.getByText(/for 1 piece/i)).toBeInTheDocument();
    });

    it('renders nothing for the price area when totalLabel is absent', () => {
      renderModal({ totalLabel: undefined, quantity: 5 });
      expect(screen.queryByText(/\$/)).toBeNull();
    });

    it('renders nothing for the price area when totalLabel is null', () => {
      renderModal({ totalLabel: null, quantity: 5 });
      expect(screen.queryByText(/\$/)).toBeNull();
    });
  });

  // ---- onConfirm / Add to cart button --------------------------------------
  describe('Add to cart button', () => {
    it('is not rendered when onConfirm is absent', () => {
      renderModal({ onConfirm: undefined });
      expect(screen.queryByRole('button', { name: /add to cart/i })).toBeNull();
    });

    it('is rendered when onConfirm is provided', () => {
      renderModal({ onConfirm: vi.fn() });
      expect(screen.getByText(/add to cart/i)).toBeInTheDocument();
    });

    it('calls onConfirm and onClose when Add to cart is clicked', () => {
      const onConfirm = vi.fn();
      const onClose = vi.fn();
      renderModal({ onConfirm, onClose });
      fireEvent.click(screen.getByText(/add to cart/i).closest('button')!);
      expect(onConfirm).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  // ---- tint swatch strip ---------------------------------------------------
  describe('tint swatch strip', () => {
    it('renders a "Shirt colour" label', () => {
      renderModal();
      expect(screen.getByText(/shirt colour/i)).toBeInTheDocument();
    });

    it('renders a swatch button for each TINT_OPTION', () => {
      renderModal();
      // The 10 tints from TINT_OPTIONS: None, White, Heather Grey, etc.
      expect(screen.getByRole('button', { name: 'None' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'White' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Black' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Mustard' })).toBeInTheDocument();
    });

    it('renders the "All colours" toggle button', () => {
      renderModal();
      expect(screen.getByRole('button', { name: /all colours/i })).toBeInTheDocument();
    });

    it('clicking a tint swatch calls setMockupTint', () => {
      renderModal();
      fireEvent.click(screen.getByRole('button', { name: 'White' }));
      expect(storeState.setMockupTint).toHaveBeenCalledWith('#ffffff');
    });

    it('clicking None swatch calls setMockupTint with null', () => {
      renderModal();
      fireEvent.click(screen.getByRole('button', { name: 'None' }));
      expect(storeState.setMockupTint).toHaveBeenCalledWith(null);
    });

    it('active swatch has aria-pressed=true in single mode', () => {
      // mockupTint is null → "None" should be active
      const { rerender } = render(
        <PreviewModal
          open
          onClose={vi.fn()}
          surfaces={SURFACES}
          productName="T-Shirt"
          quantity={1}
        />,
      );
      const noneBtn = screen.getByRole('button', { name: 'None' });
      expect(noneBtn).toHaveAttribute('aria-pressed', 'true');
      void rerender; // suppress unused-var
    });
  });

  // ---- "All colours" view mode toggle --------------------------------------
  describe('view mode toggle', () => {
    it('defaults to single view (surface cards visible)', () => {
      // In single mode the surface name cards are rendered
      renderModal();
      expect(screen.getByText('Front')).toBeInTheDocument();
    });

    it('clicking "All colours" button toggles to all view', () => {
      renderModal();
      const allBtn = screen.getByRole('button', { name: /all colours/i });
      fireEvent.click(allBtn);
      // In all-colours view the button gets aria-pressed=true
      expect(allBtn).toHaveAttribute('aria-pressed', 'true');
    });

    it('clicking "All colours" again toggles back to single view', () => {
      renderModal();
      const allBtn = screen.getByRole('button', { name: /all colours/i });
      fireEvent.click(allBtn); // → all
      fireEvent.click(allBtn); // → single
      expect(allBtn).toHaveAttribute('aria-pressed', 'false');
    });
  });

  // ---- single-view surface cards -------------------------------------------
  describe('single view — surface cards', () => {
    it('renders a card for each surface', () => {
      renderModal();
      expect(screen.getByText('Front')).toBeInTheDocument();
      expect(screen.getByText('Back')).toBeInTheDocument();
    });

    it('shows an Empty badge for a surface with no layers', () => {
      storeState.layersBySurface = { front: [], back: [] };
      renderModal();
      // Both surfaces are empty → "Empty" badge shown twice
      const badges = screen.getAllByText('Empty');
      expect(badges.length).toBeGreaterThanOrEqual(1);
    });

    it('shows a spinner (refresh icon) for a non-empty surface without a captured preview', () => {
      storeState.layersBySurface = { front: [{ id: 'layer-1' }], back: [] };
      renderModal();
      // canvas is null so no capture runs — spinner should be present
      const spinners = screen.getAllByText('refresh');
      expect(spinners.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ---- all-colours view — empty surface message ----------------------------
  describe('all-colours view — empty active surface', () => {
    it('shows the empty-surface message when the active surface has no layers', () => {
      storeState.activeSurface = 'front';
      storeState.layersBySurface = { front: [] };
      renderModal();
      // switch to all-colours view
      fireEvent.click(screen.getByRole('button', { name: /all colours/i }));
      expect(
        screen.getByText(/This surface is empty — add a layer/i),
      ).toBeInTheDocument();
    });
  });

  // ---- all-colours view — loading spinner for overlay ----------------------
  describe('all-colours view — loading spinner', () => {
    it('shows a capturing spinner when overlay has not yet been captured', () => {
      storeState.activeSurface = 'front';
      storeState.layersBySurface = { front: [{ id: 'layer-1' }] };
      renderModal();
      fireEvent.click(screen.getByRole('button', { name: /all colours/i }));
      // layersOverlay is empty (canvas is null, no capture) → spinner
      expect(screen.getByText(/capturing front on every colour/i)).toBeInTheDocument();
    });
  });

  // ---- body overflow effect ------------------------------------------------
  describe('body overflow side-effect', () => {
    it('sets body overflow to hidden while open', () => {
      renderModal({ open: true });
      expect(document.body.style.overflow).toBe('hidden');
    });

    it('restores body overflow when closed after being open', () => {
      document.body.style.overflow = '';
      const { rerender } = renderModal({ open: true });
      expect(document.body.style.overflow).toBe('hidden');
      act(() => {
        rerender(
          <PreviewModal
            open={false}
            onClose={vi.fn()}
            surfaces={SURFACES}
            productName="T-Shirt"
            quantity={1}
          />,
        );
      });
      expect(document.body.style.overflow).toBe('');
    });
  });

  // ---- surface-less edge case ----------------------------------------------
  describe('edge cases', () => {
    it('renders without crashing when surfaces array is empty', () => {
      renderModal({ surfaces: [] });
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('renders without crashing when only one surface provided', () => {
      renderModal({ surfaces: [SURFACES[0]] });
      expect(screen.getByText('Front')).toBeInTheDocument();
    });
  });
});

