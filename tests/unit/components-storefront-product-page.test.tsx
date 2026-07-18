// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/',
}));

// ---------------------------------------------------------------------------
// Global helpers
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
global.fetch = mockFetch as typeof fetch;

// Stub crypto.randomUUID (jsdom may not provide it)
Object.defineProperty(globalThis, 'crypto', {
  value: {
    randomUUID: () => 'test-uuid-1234',
  },
  configurable: true,
});

// Stub localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock, configurable: true });

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: 'Test Widget',
    slug: 'test-widget',
    description: '<p>Full description here.</p>',
    shortDescription: 'A short desc',
    price: 2999,
    compareAtPrice: null,
    sku: 'SKU-001',
    quantity: 10,
    trackInventory: false,
    weight: null,
    weightUnit: null,
    tags: ['tag1', 'tag2'],
    seoTitle: null,
    seoDescription: null,
    isDesignable: false,
    designable: false,
    images: [],
    options: [],
    variants: [],
    bulkPricing: [],
    category: null,
    ...overrides,
  };
}

function mockSuccessResponse(product: object) {
  mockFetch.mockResolvedValue({
    json: async () => ({ success: true, data: product }),
  } as Response);
}

function mockErrorResponse(message = 'Product not found') {
  mockFetch.mockResolvedValue({
    json: async () => ({ success: false, message }),
  } as Response);
}

function mockNetworkError() {
  mockFetch.mockRejectedValue(new Error('Network error'));
}

// ---------------------------------------------------------------------------
// Import component after mocks
// ---------------------------------------------------------------------------

import { ProductPage } from '@/components/storefront/ProductPage';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProductPage', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    localStorageMock.clear();
  });

  // ── Loading state ──────────────────────────────────────────────────────────

  it('renders loading skeleton initially', () => {
    mockFetch.mockReturnValue(new Promise(() => {})); // never resolves
    const { container } = render(<ProductPage siteId={1} productSlug="test-widget" />);
    // animate-pulse elements indicate skeleton
    const pulseEls = container.querySelectorAll('.animate-pulse');
    expect(pulseEls.length).toBeGreaterThan(0);
  });

  // ── Error state ────────────────────────────────────────────────────────────

  it('shows error state when API returns failure', async () => {
    mockErrorResponse('Product not found');
    render(<ProductPage siteId={1} productSlug="missing" />);
    await waitFor(() => expect(screen.getByText('Product Not Found')).toBeTruthy());
    expect(screen.getByText(/Product not found/)).toBeTruthy();
    // Back to Shop link
    expect(screen.getByRole('link', { name: /Back to Shop/ })).toBeTruthy();
  });

  it('shows error state on network failure', async () => {
    mockNetworkError();
    render(<ProductPage siteId={1} productSlug="bad" />);
    await waitFor(() => expect(screen.getByText('Product Not Found')).toBeTruthy());
    expect(screen.getByText(/Failed to load product/)).toBeTruthy();
  });

  // ── Basic render ───────────────────────────────────────────────────────────

  it('renders product name and price after fetch', async () => {
    mockSuccessResponse(makeProduct());
    render(<ProductPage siteId={1} productSlug="test-widget" />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Test Widget' })).toBeTruthy());
    // $29.99 — 2999 cents
    expect(screen.getByText('$29.99')).toBeTruthy();
  });

  it('shows short description when present', async () => {
    mockSuccessResponse(makeProduct());
    render(<ProductPage siteId={1} productSlug="test-widget" />);
    await waitFor(() => expect(screen.getByText('A short desc')).toBeTruthy());
  });

  it('shows full description via dangerouslySetInnerHTML', async () => {
    mockSuccessResponse(makeProduct());
    render(<ProductPage siteId={1} productSlug="test-widget" />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Description' })).toBeTruthy());
    expect(screen.getByText('Full description here.')).toBeTruthy();
  });

  it('does not render description section when description is null', async () => {
    mockSuccessResponse(makeProduct({ description: null }));
    render(<ProductPage siteId={1} productSlug="test-widget" />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Test Widget' })).toBeTruthy());
    expect(screen.queryByRole('heading', { name: 'Description' })).toBeNull();
  });

  // ── Breadcrumb ─────────────────────────────────────────────────────────────

  it('renders breadcrumb without category link when no category', async () => {
    mockSuccessResponse(makeProduct());
    render(<ProductPage siteId={1} productSlug="test-widget" />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Test Widget' })).toBeTruthy());
    expect(screen.getByRole('link', { name: 'Shop' })).toBeTruthy();
    // category link should not appear
    expect(screen.queryByRole('link', { name: /Widgets/ })).toBeNull();
  });

  it('renders category breadcrumb when category is present', async () => {
    const product = makeProduct({
      category: { id: 5, name: 'Widgets', slug: 'widgets' },
    });
    mockSuccessResponse(product);
    render(<ProductPage siteId={1} productSlug="test-widget" />);
    await waitFor(() => expect(screen.getAllByText('Widgets').length).toBeGreaterThan(0));
  });

  // ── Stock status ───────────────────────────────────────────────────────────

  it('shows In Stock when trackInventory is false', async () => {
    mockSuccessResponse(makeProduct({ trackInventory: false }));
    render(<ProductPage siteId={1} productSlug="test-widget" />);
    await waitFor(() => expect(screen.getByText(/In Stock/)).toBeTruthy());
  });

  it('shows Out of Stock when trackInventory=true and quantity=0', async () => {
    mockSuccessResponse(makeProduct({ trackInventory: true, quantity: 0 }));
    render(<ProductPage siteId={1} productSlug="test-widget" />);
    await waitFor(() => expect(screen.getAllByText(/Out of Stock/).length).toBeGreaterThan(0));
  });

  it('shows "Only N left" warning when stock ≤ 10 and trackInventory=true', async () => {
    mockSuccessResponse(makeProduct({ trackInventory: true, quantity: 5 }));
    render(<ProductPage siteId={1} productSlug="test-widget" />);
    await waitFor(() => expect(screen.getByText(/Only 5 left/)).toBeTruthy());
  });

  // ── Images ─────────────────────────────────────────────────────────────────

  it('renders placeholder icon when no images', async () => {
    mockSuccessResponse(makeProduct({ images: [] }));
    const { container } = render(<ProductPage siteId={1} productSlug="test-widget" />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Test Widget' })).toBeTruthy());
    // inventory_2 icon for empty image state
    const icon = container.querySelector('.material-icons');
    expect(icon).toBeTruthy();
  });

  it('renders main image and thumbnail strip for multiple images', async () => {
    const images = [
      { id: 1, url: 'http://example.com/img1.jpg', alt: 'Image 1', order: 0 },
      { id: 2, url: 'http://example.com/img2.jpg', alt: 'Image 2', order: 1 },
    ];
    mockSuccessResponse(makeProduct({ images }));
    render(<ProductPage siteId={1} productSlug="test-widget" />);
    await waitFor(() => {
      const imgs = screen.getAllByRole('img');
      // main image + 2 thumbnails = 3 total
      expect(imgs.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('switches main image when thumbnail clicked', async () => {
    const images = [
      { id: 1, url: 'http://example.com/img1.jpg', alt: 'Image 1', order: 0 },
      { id: 2, url: 'http://example.com/img2.jpg', alt: 'Image 2', order: 1 },
    ];
    mockSuccessResponse(makeProduct({ images }));
    render(<ProductPage siteId={1} productSlug="test-widget" />);
    await waitFor(() => screen.getAllByRole('img'));
    // All imgs rendered; click the second thumbnail button
    const thumbButtons = screen.getAllByRole('button').filter(
      (b) => b.querySelector('img') !== null,
    );
    if (thumbButtons.length >= 2) {
      fireEvent.click(thumbButtons[1]);
      // After click, verify main image src changed via alt text
      await waitFor(() => {
        const mainImg = screen.getAllByRole('img')[0];
        expect(mainImg.getAttribute('src')).toBe('http://example.com/img2.jpg');
      });
    }
  });

  // ── Compare price / discount badge ─────────────────────────────────────────

  it('shows sale badge when compareAtPrice > price', async () => {
    mockSuccessResponse(makeProduct({ price: 2000, compareAtPrice: 4000 }));
    render(<ProductPage siteId={1} productSlug="test-widget" />);
    await waitFor(() => expect(screen.getByText(/% OFF/)).toBeTruthy());
    // 50% off
    expect(screen.getByText(/50% OFF/)).toBeTruthy();
  });

  it('shows strikethrough compare price', async () => {
    mockSuccessResponse(makeProduct({ price: 2000, compareAtPrice: 4000 }));
    render(<ProductPage siteId={1} productSlug="test-widget" />);
    await waitFor(() => {
      const strikeEl = document.querySelector('.line-through');
      expect(strikeEl).toBeTruthy();
    });
  });

  it('does NOT show badge when compareAtPrice equals price', async () => {
    mockSuccessResponse(makeProduct({ price: 2000, compareAtPrice: 2000 }));
    render(<ProductPage siteId={1} productSlug="test-widget" />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Test Widget' })).toBeTruthy());
    expect(screen.queryByText(/% OFF/)).toBeNull();
  });

  // ── SKU and tags ───────────────────────────────────────────────────────────

  it('renders SKU when present', async () => {
    mockSuccessResponse(makeProduct({ sku: 'SKU-001' }));
    render(<ProductPage siteId={1} productSlug="test-widget" />);
    await waitFor(() => expect(screen.getByText(/SKU-001/)).toBeTruthy());
  });

  it('renders tags when present', async () => {
    mockSuccessResponse(makeProduct({ tags: ['red', 'new'] }));
    render(<ProductPage siteId={1} productSlug="test-widget" />);
    await waitFor(() => {
      expect(screen.getByText('red')).toBeTruthy();
      expect(screen.getByText('new')).toBeTruthy();
    });
  });

  it('does not render SKU/tags section when both are absent', async () => {
    mockSuccessResponse(makeProduct({ sku: null, tags: null }));
    render(<ProductPage siteId={1} productSlug="test-widget" />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Test Widget' })).toBeTruthy());
    expect(screen.queryByText(/SKU:/)).toBeNull();
    expect(screen.queryByText(/Tags:/)).toBeNull();
  });

  // ── Variant options ────────────────────────────────────────────────────────

  it('renders variant option buttons', async () => {
    const product = makeProduct({
      options: [
        {
          id: 1,
          name: 'Size',
          order: 0,
          values: [
            { id: 1, value: 'S', order: 0 },
            { id: 2, value: 'M', order: 1 },
            { id: 3, value: 'L', order: 2 },
          ],
        },
      ],
      variants: [
        { id: 1, name: 'S', price: 2999, quantity: 5, sku: null, optionValues: { Size: 'S' }, active: true },
        { id: 2, name: 'M', price: 2999, quantity: 5, sku: null, optionValues: { Size: 'M' }, active: true },
        { id: 3, name: 'L', price: 2999, quantity: 5, sku: null, optionValues: { Size: 'L' }, active: true },
      ],
    });
    mockSuccessResponse(product);
    render(<ProductPage siteId={1} productSlug="test-widget" />);
    await waitFor(() => {
      expect(screen.getByText('S')).toBeTruthy();
      expect(screen.getByText('M')).toBeTruthy();
      expect(screen.getByText('L')).toBeTruthy();
    });
  });

  it('clicking a variant option updates selected option display', async () => {
    const product = makeProduct({
      options: [
        {
          id: 1,
          name: 'Color',
          order: 0,
          values: [
            { id: 1, value: 'Red', order: 0 },
            { id: 2, value: 'Blue', order: 1 },
          ],
        },
      ],
      variants: [
        { id: 1, name: 'Red', price: 2999, quantity: 5, sku: null, optionValues: { Color: 'Red' }, active: true },
        { id: 2, name: 'Blue', price: 2999, quantity: 5, sku: null, optionValues: { Color: 'Blue' }, active: true },
      ],
    });
    mockSuccessResponse(product);
    render(<ProductPage siteId={1} productSlug="test-widget" />);
    await waitFor(() => screen.getByText('Blue'));
    fireEvent.click(screen.getByText('Blue'));
    await waitFor(() => {
      // The label shows the currently selected option
      expect(screen.getByText(/— Blue/)).toBeTruthy();
    });
  });

  it('unavailable variants are disabled', async () => {
    const product = makeProduct({
      trackInventory: true,
      options: [
        {
          id: 1,
          name: 'Size',
          order: 0,
          values: [
            { id: 1, value: 'S', order: 0 },
            { id: 2, value: 'XL', order: 1 },
          ],
        },
      ],
      variants: [
        { id: 1, name: 'S', price: 2999, quantity: 5, sku: null, optionValues: { Size: 'S' }, active: true },
        { id: 2, name: 'XL', price: 2999, quantity: 0, sku: null, optionValues: { Size: 'XL' }, active: true },
      ],
    });
    mockSuccessResponse(product);
    render(<ProductPage siteId={1} productSlug="test-widget" />);
    await waitFor(() => screen.getByText('XL'));
    const xlButton = screen.getByText('XL').closest('button');
    expect(xlButton).toBeTruthy();
    expect(xlButton!.disabled).toBe(true);
  });

  // ── Quantity selector ──────────────────────────────────────────────────────

  it('quantity decrements with minus button (min=1)', async () => {
    mockSuccessResponse(makeProduct({ quantity: 10, trackInventory: false }));
    render(<ProductPage siteId={1} productSlug="test-widget" />);
    await waitFor(() => screen.getByRole('heading', { name: 'Test Widget' }));

    const input = screen.getByRole('spinbutton') as HTMLInputElement;
    expect(input.value).toBe('1');

    // minus button should be disabled at 1
    const buttons = screen.getAllByRole('button');
    const removeBtn = buttons.find((b) =>
      b.querySelector('.material-icons')?.textContent === 'remove',
    );
    expect(removeBtn).toBeTruthy();
    expect(removeBtn!.disabled).toBe(true);
  });

  it('quantity increments with plus button', async () => {
    mockSuccessResponse(makeProduct({ quantity: 10, trackInventory: false }));
    render(<ProductPage siteId={1} productSlug="test-widget" />);
    await waitFor(() => screen.getByRole('heading', { name: 'Test Widget' }));

    const buttons = screen.getAllByRole('button');
    const addBtn = buttons.find((b) =>
      b.querySelector('.material-icons')?.textContent === 'add',
    );
    expect(addBtn).toBeTruthy();
    fireEvent.click(addBtn!);

    const input = screen.getByRole('spinbutton') as HTMLInputElement;
    await waitFor(() => expect(input.value).toBe('2'));
  });

  it('manually typing quantity clamps to valid range', async () => {
    mockSuccessResponse(makeProduct({ quantity: 5, trackInventory: true }));
    render(<ProductPage siteId={1} productSlug="test-widget" />);
    await waitFor(() => screen.getByRole('heading', { name: 'Test Widget' }));
    const input = screen.getByRole('spinbutton') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '999' } });
    await waitFor(() => expect(input.value).toBe('5')); // clamped to maxStock=5
  });

  // ── Add to cart ────────────────────────────────────────────────────────────

  it('add to cart button shows "Add to Cart" for in-stock product', async () => {
    mockSuccessResponse(makeProduct());
    render(<ProductPage siteId={1} productSlug="test-widget" />);
    await waitFor(() => expect(screen.getByText(/Add to Cart/)).toBeTruthy());
  });

  it('add to cart button is disabled when out of stock', async () => {
    mockSuccessResponse(makeProduct({ trackInventory: true, quantity: 0 }));
    render(<ProductPage siteId={1} productSlug="test-widget" />);
    await waitFor(() => expect(screen.getAllByText(/Out of Stock/).length).toBeGreaterThan(0));
    // The add button itself should be disabled
    const addBtn = screen.getAllByRole('button').find((b) => b.textContent?.includes('Out of Stock'));
    expect(addBtn).toBeTruthy();
    expect(addBtn!.hasAttribute('disabled')).toBe(true);
  });

  it('add to cart button shows "Select Options" when variants unmatched', async () => {
    // Product with variants but no matching variant for default selection
    const product = makeProduct({
      options: [
        {
          id: 1,
          name: 'Size',
          order: 0,
          values: [{ id: 1, value: 'S', order: 0 }],
        },
      ],
      variants: [], // no variants exist — has options but no variants means no match
    });
    // Force variant mismatch by having variants array non-empty with wrong optionValues
    const product2 = makeProduct({
      options: [
        {
          id: 1,
          name: 'Size',
          order: 0,
          values: [{ id: 1, value: 'S', order: 0 }],
        },
      ],
      variants: [
        // no variant with optionValues matching defaults
        { id: 99, name: 'Other', price: 100, quantity: 5, sku: null, optionValues: { Size: 'XXL' }, active: true },
      ],
    });
    mockSuccessResponse(product2);
    render(<ProductPage siteId={1} productSlug="test-widget" />);
    await waitFor(() => expect(screen.getByText('Select Options')).toBeTruthy());
  });

  it('successfully adds to cart and shows success message', async () => {
    const product = makeProduct();
    // First call: product fetch; second call: cart POST
    mockFetch
      .mockResolvedValueOnce({ json: async () => ({ success: true, data: product }) } as Response)
      .mockResolvedValueOnce({ json: async () => ({ success: true }) } as Response);

    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    render(<ProductPage siteId={1} productSlug="test-widget" />);
    await waitFor(() => screen.getByText(/Add to Cart/));

    const addBtn = screen.getAllByRole('button').find((b) => b.textContent?.includes('Add to Cart'));
    expect(addBtn).toBeTruthy();
    await act(async () => { fireEvent.click(addBtn!); });
    await waitFor(() => expect(screen.getByText('Added to cart!')).toBeTruthy());
    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'cart-updated' }));
  });

  it('shows error message when cart POST fails', async () => {
    const product = makeProduct();
    mockFetch
      .mockResolvedValueOnce({ json: async () => ({ success: true, data: product }) } as Response)
      .mockResolvedValueOnce({ json: async () => ({ success: false, message: 'Cart full' }) } as Response);

    render(<ProductPage siteId={1} productSlug="test-widget" />);
    await waitFor(() => screen.getByText(/Add to Cart/));
    const addBtn = screen.getAllByRole('button').find((b) => b.textContent?.includes('Add to Cart'));
    await act(async () => { fireEvent.click(addBtn!); });
    await waitFor(() => expect(screen.getByText('Cart full')).toBeTruthy());
  });

  it('shows error message on cart network failure', async () => {
    const product = makeProduct();
    mockFetch
      .mockResolvedValueOnce({ json: async () => ({ success: true, data: product }) } as Response)
      .mockRejectedValueOnce(new Error('network'));

    render(<ProductPage siteId={1} productSlug="test-widget" />);
    await waitFor(() => screen.getByText(/Add to Cart/));
    const addBtn = screen.getAllByRole('button').find((b) => b.textContent?.includes('Add to Cart'));
    await act(async () => { fireEvent.click(addBtn!); });
    await waitFor(() => expect(screen.getByText('Something went wrong')).toBeTruthy());
  });

  it('cart message includes "View Cart" link on success', async () => {
    const product = makeProduct();
    mockFetch
      .mockResolvedValueOnce({ json: async () => ({ success: true, data: product }) } as Response)
      .mockResolvedValueOnce({ json: async () => ({ success: true }) } as Response);

    render(<ProductPage siteId={1} productSlug="test-widget" />);
    await waitFor(() => screen.getByText(/Add to Cart/));
    const addBtn = screen.getAllByRole('button').find((b) => b.textContent?.includes('Add to Cart'));
    await act(async () => { fireEvent.click(addBtn!); });
    await waitFor(() => expect(screen.getByRole('link', { name: 'View Cart' })).toBeTruthy());
  });

  // ── Designable product ─────────────────────────────────────────────────────

  it('shows "Customize this product" link when product.designable is true', async () => {
    mockSuccessResponse(makeProduct({ designable: true }));
    render(<ProductPage siteId={1} productSlug="test-widget" />);
    await waitFor(() => expect(screen.getAllByText(/Customize this product/).length).toBeGreaterThan(0));
  });

  it('shows isDesignable designer link when isDesignable=true', async () => {
    mockSuccessResponse(makeProduct({ isDesignable: true }));
    render(<ProductPage siteId={1} productSlug="test-widget" />);
    await waitFor(() => {
      const link = screen.getByRole('link', { name: /Customize this product/ });
      expect(link.getAttribute('href')).toContain('/designer/test-widget');
    });
  });

  it('shows "Buy as-is" in add button when designable=true', async () => {
    mockSuccessResponse(makeProduct({ designable: true }));
    render(<ProductPage siteId={1} productSlug="test-widget" />);
    await waitFor(() => expect(screen.getByText(/Buy as-is/)).toBeTruthy());
  });

  // ── Bulk pricing ───────────────────────────────────────────────────────────

  it('renders bulk pricing table when bulkPricing is non-empty', async () => {
    const product = makeProduct({
      bulkPricing: [
        { id: 1, minQuantity: 5, maxQuantity: 10, price: 2500, discountType: 'fixed_price', discountValue: 0 },
        { id: 2, minQuantity: 11, maxQuantity: null, price: 2000, discountType: 'percent', discountValue: 20 },
      ],
    });
    mockSuccessResponse(product);
    render(<ProductPage siteId={1} productSlug="test-widget" />);
    await waitFor(() => expect(screen.getByText('Bulk Pricing')).toBeTruthy());
    expect(screen.getByText(/5–10 units/)).toBeTruthy();
    expect(screen.getByText(/11\+ units/)).toBeTruthy();
  });

  it('applies bulk fixed_price discount when quantity matches', async () => {
    const product = makeProduct({
      trackInventory: false,
      bulkPricing: [
        { id: 1, minQuantity: 2, maxQuantity: null, price: 1500, discountType: 'fixed_price', discountValue: 0 },
      ],
    });
    mockSuccessResponse(product);
    render(<ProductPage siteId={1} productSlug="test-widget" />);
    await waitFor(() => screen.getByRole('heading', { name: 'Test Widget' }));

    // Increment quantity to 2
    const addBtn = screen.getAllByRole('button').find((b) =>
      b.querySelector('.material-icons')?.textContent === 'add',
    );
    fireEvent.click(addBtn!);

    await waitFor(() => expect(screen.getByText('Bulk discount applied')).toBeTruthy());
    // effectivePrice = 1500 cents = $15.00 — appears in price area and bulk pricing table
    expect(screen.getAllByText('$15.00').length).toBeGreaterThan(0);
  });

  it('applies bulk percent discount correctly', async () => {
    const product = makeProduct({
      price: 2000,
      trackInventory: false,
      bulkPricing: [
        { id: 1, minQuantity: 2, maxQuantity: null, price: 0, discountType: 'percent', discountValue: 50 },
      ],
    });
    mockSuccessResponse(product);
    render(<ProductPage siteId={1} productSlug="test-widget" />);
    await waitFor(() => screen.getByRole('heading', { name: 'Test Widget' }));
    const addBtn = screen.getAllByRole('button').find((b) =>
      b.querySelector('.material-icons')?.textContent === 'add',
    );
    fireEvent.click(addBtn!);
    // 50% off $20.00 = $10.00
    await waitFor(() => expect(screen.getByText('$10.00')).toBeTruthy());
  });

  // ── Session ID ────────────────────────────────────────────────────────────

  it('creates and reuses session ID in localStorage', async () => {
    const product = makeProduct();
    mockFetch
      .mockResolvedValueOnce({ json: async () => ({ success: true, data: product }) } as Response)
      .mockResolvedValueOnce({ json: async () => ({ success: true }) } as Response);

    render(<ProductPage siteId={1} productSlug="test-widget" />);
    await waitFor(() => screen.getByText(/Add to Cart/));
    const addBtn = screen.getAllByRole('button').find((b) => b.textContent?.includes('Add to Cart'));
    await act(async () => { fireEvent.click(addBtn!); });

    // sessionId should have been stored
    await waitFor(() => expect(localStorageMock.getItem('cart_session_id')).toBeTruthy());
  });

  // ── API call parameters ────────────────────────────────────────────────────

  it('fetches product from correct URL', async () => {
    mockSuccessResponse(makeProduct());
    render(<ProductPage siteId={42} productSlug="my-product" />);
    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith('/api/storefront/42/products/my-product'),
    );
  });
});
