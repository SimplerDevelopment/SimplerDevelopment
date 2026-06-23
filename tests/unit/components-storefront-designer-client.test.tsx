// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Router mock — must be declared before vi.mock calls reference the variables.
// ---------------------------------------------------------------------------
const mockRouterPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}));

// ---------------------------------------------------------------------------
// Heavy sub-component stubs — none of them are under test here.
// DesignerShell is a vi.fn() so individual tests can override it to capture
// prop callbacks (e.g. onAddToCart) while the default stub is a plain div.
// vi.hoisted() is required because vi.mock factories are hoisted to the top
// of the file before variable declarations run.
// ---------------------------------------------------------------------------
const { DesignerShellMock } = vi.hoisted(() => {
  const DesignerShellMock = vi.fn((props: any) =>
    React.createElement('div', {
      'data-testid': 'designer-shell',
      'data-product-id': props.productId,
      'data-staff-mode': String(!!props.staffMode),
    }),
  );
  return { DesignerShellMock };
});

vi.mock('@/components/storefront/designer/DesignerShell', () => ({
  DesignerShell: DesignerShellMock,
}));

vi.mock('@/components/storefront/designer/EffectsFloating', () => ({
  default: () => React.createElement('div', { 'data-testid': 'effects-floating' }),
}));

vi.mock('@/components/storefront/designer/ExportButton', () => ({
  default: () => React.createElement('div', { 'data-testid': 'export-button' }),
}));

vi.mock('@/components/storefront/designer/TemplatesDrawer', () => ({
  default: (props: any) =>
    React.createElement('div', {
      'data-testid': 'templates-drawer',
      'data-site-id': String(props.siteId),
      'data-product-id': String(props.productId),
    }),
}));

// ---------------------------------------------------------------------------
// canvasStore mock — expose controllable spies for the three setter calls.
// ---------------------------------------------------------------------------
const mockSetBrandColors = vi.fn();
const mockSetBrandLogoUrl = vi.fn();
const mockSetBrandFonts = vi.fn();
const mockSetDesign = vi.fn();
const mockGetDesignId = vi.fn<[], string | null>(() => null);

vi.mock('@/lib/designer/canvasStore', () => ({
  useCanvasStore: Object.assign(
    // The component calls `useCanvasStore.getState().*` — no hook call needed.
    () => ({}),
    {
      getState: () => ({
        setBrandColors: mockSetBrandColors,
        setBrandLogoUrl: mockSetBrandLogoUrl,
        setBrandFonts: mockSetBrandFonts,
        setDesign: mockSetDesign,
        get designId() {
          return mockGetDesignId();
        },
      }),
    },
  ),
}));

// ---------------------------------------------------------------------------
// Import component AFTER all mocks are declared.
// ---------------------------------------------------------------------------
import { DesignerClient } from '@/components/storefront/designer/DesignerClient';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFetchOk(body: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  });
}

function makeFetchFail(status = 404, body: unknown = { success: false }) {
  return Promise.resolve({
    ok: false,
    status,
    json: () => Promise.resolve(body),
  });
}

const defaultProduct = {
  id: 42,
  slug: 'custom-mug',
  name: 'Custom Mug',
  priceCents: 1999,
  currency: 'USD',
};

const defaultSurfaces = [{ slug: 'front', label: 'Front', widthIn: 4, heightIn: 4, dpi: 150 }];

function renderClient(overrides: Partial<React.ComponentProps<typeof DesignerClient>> = {}) {
  return render(
    <DesignerClient
      siteId={1}
      domain="example.com"
      product={defaultProduct}
      surfaces={defaultSurfaces}
      {...overrides}
    />,
  );
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockGetDesignId.mockReturnValue(null);

  // Default: designs list returns empty (no existing draft).
  global.fetch = vi.fn(() =>
    makeFetchOk({ success: true, data: [] }),
  ) as any;

  // Stub localStorage
  const store: Record<string, string> = {};
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation((k) => store[k] ?? null);
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation((k, v) => { store[k] = v; });

  // Stub crypto.randomUUID
  Object.defineProperty(globalThis, 'crypto', {
    value: { randomUUID: () => 'test-session-uuid' },
    configurable: true,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests: loading state
// ---------------------------------------------------------------------------

describe('DesignerClient — loading state', () => {
  it('shows spinner while initial fetch is in flight', async () => {
    // fetch never resolves during this check
    let resolve: (v: any) => void;
    const pending = new Promise<any>((r) => { resolve = r; });
    global.fetch = vi.fn(() => pending) as any;

    renderClient();

    // spinner is the "refresh" material icon with animate-spin
    const spinner = document.querySelector('.animate-spin');
    expect(spinner).not.toBeNull();

    // clean up
    act(() => { resolve!(makeFetchOk({ success: true, data: [] })); });
  });

  it('does not render DesignerShell while loading', async () => {
    let resolve: (v: any) => void;
    const pending = new Promise<any>((r) => { resolve = r; });
    global.fetch = vi.fn(() => pending) as any;

    renderClient();

    expect(screen.queryByTestId('designer-shell')).toBeNull();

    act(() => { resolve!(makeFetchOk({ success: true, data: [] })); });
  });
});

// ---------------------------------------------------------------------------
// Tests: customer path (no staffMode) — fetch resolves
// ---------------------------------------------------------------------------

describe('DesignerClient — customer path (no staffMode)', () => {
  it('renders DesignerShell after fetch resolves with empty list', async () => {
    renderClient();
    await waitFor(() => expect(screen.getByTestId('designer-shell')).toBeTruthy());
  });

  it('renders floating utility siblings (EffectsFloating, TemplatesDrawer, ExportButton)', async () => {
    renderClient();
    await waitFor(() => screen.getByTestId('designer-shell'));
    expect(screen.getByTestId('effects-floating')).toBeTruthy();
    expect(screen.getByTestId('templates-drawer')).toBeTruthy();
    expect(screen.getByTestId('export-button')).toBeTruthy();
  });

  it('TemplatesDrawer receives correct siteId and productId', async () => {
    renderClient({ siteId: 7 });
    await waitFor(() => screen.getByTestId('templates-drawer'));
    const drawer = screen.getByTestId('templates-drawer');
    expect(drawer.getAttribute('data-site-id')).toBe('7');
    expect(drawer.getAttribute('data-product-id')).toBe(String(defaultProduct.id));
  });

  it('passes staffMode=false to DesignerShell', async () => {
    renderClient();
    await waitFor(() => screen.getByTestId('designer-shell'));
    expect(screen.getByTestId('designer-shell').getAttribute('data-staff-mode')).toBe('false');
  });

  it('fetches existing drafts keyed by sessionId + productId', async () => {
    renderClient();
    await waitFor(() => screen.getByTestId('designer-shell'));

    const calls = (global.fetch as any).mock.calls as Array<[string, any]>;
    const draftCall = calls.find(([url]) => url.includes('/api/storefront/1/designs?'));
    expect(draftCall).toBeTruthy();
    expect(draftCall![0]).toContain('sessionId=');
    expect(draftCall![0]).toContain(`productId=${defaultProduct.id}`);
    expect(draftCall![0]).toContain('status=draft');
  });

  it('loads existing draft when list returns one item', async () => {
    const existingDraft = {
      id: 'draft-123',
      name: 'My Draft',
      productId: defaultProduct.id,
      layersBySurface: {},
      canvasSize: { width: 800, height: 600, dpi: 72 },
      status: 'draft',
    };
    global.fetch = vi.fn(() =>
      makeFetchOk({ success: true, data: [existingDraft] }),
    ) as any;

    renderClient();
    await waitFor(() => screen.getByTestId('designer-shell'));
    // No error shown — draft loaded cleanly
    expect(screen.queryByText(/Failed/i)).toBeNull();
  });

  it('starts fresh (no initialDesign) when draft list is empty', async () => {
    global.fetch = vi.fn(() =>
      makeFetchOk({ success: true, data: [] }),
    ) as any;

    renderClient();
    await waitFor(() => screen.getByTestId('designer-shell'));
    // DesignerShell renders without error
    expect(screen.getByTestId('designer-shell')).toBeTruthy();
  });

  it('handles draft fetch failure gracefully (no crash)', async () => {
    global.fetch = vi.fn(() => makeFetchFail(500)) as any;

    renderClient();
    // fetch failure swallowed — component still loads
    await waitFor(() => screen.getByTestId('designer-shell'));
  });

  it('handles network throw on draft fetch gracefully (no crash)', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('Network error'))) as any;

    renderClient();
    await waitFor(() => screen.getByTestId('designer-shell'));
  });

  it('calls setBrandColors with provided brandColors on mount', async () => {
    renderClient({ brandColors: ['#FF0000', '#00FF00'] });
    await waitFor(() => screen.getByTestId('designer-shell'));
    expect(mockSetBrandColors).toHaveBeenCalledWith(['#FF0000', '#00FF00']);
  });

  it('calls setBrandColors with [] when brandColors is undefined', async () => {
    renderClient({ brandColors: undefined });
    await waitFor(() => screen.getByTestId('designer-shell'));
    expect(mockSetBrandColors).toHaveBeenCalledWith([]);
  });

  it('calls setBrandLogoUrl with provided URL on mount', async () => {
    renderClient({ brandLogoUrl: 'https://cdn.example.com/logo.png' });
    await waitFor(() => screen.getByTestId('designer-shell'));
    expect(mockSetBrandLogoUrl).toHaveBeenCalledWith('https://cdn.example.com/logo.png');
  });

  it('calls setBrandLogoUrl with empty string when brandLogoUrl is undefined', async () => {
    renderClient({ brandLogoUrl: undefined });
    await waitFor(() => screen.getByTestId('designer-shell'));
    expect(mockSetBrandLogoUrl).toHaveBeenCalledWith('');
  });

  it('calls setBrandFonts with provided fonts on mount', async () => {
    renderClient({ brandFonts: { heading: 'Playfair Display', body: 'Inter' } });
    await waitFor(() => screen.getByTestId('designer-shell'));
    expect(mockSetBrandFonts).toHaveBeenCalledWith({ heading: 'Playfair Display', body: 'Inter' });
  });

  it('calls setBrandFonts with {} when brandFonts is undefined', async () => {
    renderClient({ brandFonts: undefined });
    await waitFor(() => screen.getByTestId('designer-shell'));
    expect(mockSetBrandFonts).toHaveBeenCalledWith({});
  });
});

// ---------------------------------------------------------------------------
// Tests: staff mode paths
// ---------------------------------------------------------------------------

describe('DesignerClient — staffMode', () => {
  it('renders DesignerShell with staffMode=true', async () => {
    renderClient({ staffMode: true });
    await waitFor(() => screen.getByTestId('designer-shell'));
    expect(screen.getByTestId('designer-shell').getAttribute('data-staff-mode')).toBe('true');
  });

  it('does NOT fetch designs list in staffMode without initialDesignId', async () => {
    renderClient({ staffMode: true });
    await waitFor(() => screen.getByTestId('designer-shell'));

    const calls = (global.fetch as any).mock.calls as Array<[string, any]>;
    expect(calls.length).toBe(0);
  });

  it('fetches the specific design when staffMode + initialDesignId provided', async () => {
    const designData = {
      id: 'staff-design-1',
      name: 'Staff Design',
      productId: defaultProduct.id,
      layersBySurface: {},
      canvasSize: { width: 800, height: 600, dpi: 72 },
      status: 'draft',
    };
    global.fetch = vi.fn(() =>
      makeFetchOk({ success: true, data: designData }),
    ) as any;

    renderClient({ staffMode: true, initialDesignId: 'staff-design-1' });
    await waitFor(() => screen.getByTestId('designer-shell'));

    const calls = (global.fetch as any).mock.calls as Array<[string, any]>;
    expect(calls.length).toBe(1);
    expect(calls[0][0]).toBe('/api/storefront/1/designs/staff-design-1');
    // Staff header present
    expect(calls[0][1]?.headers?.['x-portal-staff']).toBe('1');
  });

  it('shows error banner when staff design fetch returns non-ok', async () => {
    global.fetch = vi.fn(() => makeFetchFail(403)) as any;

    renderClient({ staffMode: true, initialDesignId: 'bad-design-id' });
    await waitFor(() =>
      screen.getByText(/Failed to load design bad-design-id/i),
    );
    // Error banner visible
    expect(screen.getByText(/HTTP 403/i)).toBeTruthy();
  });

  it('shows error banner when staff design fetch throws', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('Timeout'))) as any;

    renderClient({ staffMode: true, initialDesignId: 'throw-design' });
    await waitFor(() => screen.getByText(/Timeout/i));
  });

  it('dismiss button clears the error banner', async () => {
    global.fetch = vi.fn(() => makeFetchFail(403)) as any;

    renderClient({ staffMode: true, initialDesignId: 'bad-id' });
    await waitFor(() => screen.getByText(/Failed to load design/i));

    const errorBanner = document.querySelector('.bg-red-50');
    expect(errorBanner).not.toBeNull();
    const dismissBtn = errorBanner!.querySelector('button')!;
    fireEvent.click(dismissBtn);

    await waitFor(() => expect(document.querySelector('.bg-red-50')).toBeNull());
  });
});

// ---------------------------------------------------------------------------
// Tests: toast notifications
// ---------------------------------------------------------------------------

describe('DesignerClient — toast / add-to-cart', () => {
  // Helper: render with a DesignerShell that captures the onAddToCart callback.
  async function renderAndCaptureAddToCart(
    fetchImpl: (url: string) => Promise<any>,
    props: Partial<React.ComponentProps<typeof DesignerClient>> = {},
  ) {
    global.fetch = vi.fn(fetchImpl) as any;
    let capturedOnAddToCart: ((designId: string, qty: number) => Promise<void>) | null = null;
    DesignerShellMock.mockImplementationOnce((p: any) => {
      capturedOnAddToCart = p.onAddToCart;
      return React.createElement('div', { 'data-testid': 'designer-shell' });
    });
    renderClient(props);
    await waitFor(() => screen.getByTestId('designer-shell'));
    return { getOnAddToCart: () => capturedOnAddToCart! };
  }

  it('shows success toast after add-to-cart completes', async () => {
    const { getOnAddToCart } = await renderAndCaptureAddToCart((url) => {
      if (url.includes('/finalize')) return makeFetchOk({ success: true });
      if (url.includes('/cart')) return makeFetchOk({ success: true });
      return makeFetchOk({ success: true, data: [] });
    });

    await act(async () => { await getOnAddToCart()('design-abc', 1); });

    await waitFor(() => screen.getByText('Added to cart!'));
    expect(screen.getByText('Added to cart!')).toBeTruthy();
  });

  it('dismisses toast when close button is clicked', async () => {
    const { getOnAddToCart } = await renderAndCaptureAddToCart((url) => {
      if (url.includes('/finalize')) return makeFetchOk({ success: true });
      if (url.includes('/cart')) return makeFetchOk({ success: true });
      return makeFetchOk({ success: true, data: [] });
    });

    await act(async () => { await getOnAddToCart()('design-abc', 1); });
    await waitFor(() => screen.getByText('Added to cart!'));

    const toastBanner = document.querySelector('.bg-emerald-50');
    expect(toastBanner).not.toBeNull();
    fireEvent.click(toastBanner!.querySelector('button')!);

    await waitFor(() => expect(screen.queryByText('Added to cart!')).toBeNull());
  });

  it('shows error banner when cart POST fails', async () => {
    const { getOnAddToCart } = await renderAndCaptureAddToCart((url) => {
      if (url.includes('/finalize')) return makeFetchOk({ success: true });
      if (url.includes('/cart')) return makeFetchOk({ success: false, message: 'Out of stock' });
      return makeFetchOk({ success: true, data: [] });
    });

    await act(async () => { await getOnAddToCart()('design-abc', 1); });

    await waitFor(() => screen.getByText(/Out of stock/i));
  });

  it('redirects to afterAddToCartPath after successful add-to-cart', async () => {
    const { getOnAddToCart } = await renderAndCaptureAddToCart(
      (url) => {
        if (url.includes('/finalize')) return makeFetchOk({ success: true });
        if (url.includes('/cart')) return makeFetchOk({ success: true });
        return makeFetchOk({ success: true, data: [] });
      },
      { afterAddToCartPath: '/cart' },
    );

    await act(async () => { await getOnAddToCart()('design-abc', 2); });

    await waitFor(() => expect(mockRouterPush).toHaveBeenCalledWith('/cart'));
  });

  it('does NOT redirect when afterAddToCartPath is not supplied', async () => {
    const { getOnAddToCart } = await renderAndCaptureAddToCart((url) => {
      if (url.includes('/finalize')) return makeFetchOk({ success: true });
      if (url.includes('/cart')) return makeFetchOk({ success: true });
      return makeFetchOk({ success: true, data: [] });
    });

    await act(async () => { await getOnAddToCart()('design-abc', 1); });
    await waitFor(() => screen.getByText('Added to cart!'));
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it('dispatches cart-updated custom event on successful add-to-cart', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    const { getOnAddToCart } = await renderAndCaptureAddToCart((url) => {
      if (url.includes('/finalize')) return makeFetchOk({ success: true });
      if (url.includes('/cart')) return makeFetchOk({ success: true });
      return makeFetchOk({ success: true, data: [] });
    });

    await act(async () => { await getOnAddToCart()('design-abc', 1); });

    await waitFor(() =>
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'cart-updated' }),
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// Tests: no-op / defaults
// ---------------------------------------------------------------------------

describe('DesignerClient — defaults and optional props', () => {
  it('renders without optional props (bare minimum)', async () => {
    renderClient();
    await waitFor(() => screen.getByTestId('designer-shell'));
    expect(screen.getByTestId('designer-shell')).toBeTruthy();
  });

  it('passes productId from product to DesignerShell', async () => {
    renderClient({ product: { ...defaultProduct, id: 99 } });
    await waitFor(() => screen.getByTestId('designer-shell'));
    expect(screen.getByTestId('designer-shell').getAttribute('data-product-id')).toBe('99');
  });
});
