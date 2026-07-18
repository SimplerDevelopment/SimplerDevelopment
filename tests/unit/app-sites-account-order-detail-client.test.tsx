// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/account/orders/ORD-001',
}));

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string; [key: string]: unknown }) =>
    React.createElement('a', { href, ...rest }, children),
}));

// CustomerAuth mock — token drives the fetch
const mockUseCustomerAuth = vi.fn();
vi.mock('@/components/storefront/account/CustomerAuthContext', () => ({
  useCustomerAuth: () => mockUseCustomerAuth(),
}));

// RequireAuth — just renders children (auth is tested separately)
vi.mock('@/components/storefront/account/RequireAuth', () => ({
  RequireAuth: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}));

// AccountLayout — thin wrapper so we see the content
vi.mock('@/components/storefront/account/AccountLayout', () => ({
  AccountLayout: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'account-layout' }, children),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function baseOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    orderNumber: 'ORD-001',
    status: 'processing',
    subtotal: 4999,
    tax: 400,
    shipping: 500,
    total: 5899,
    createdAt: '2024-01-15T10:00:00Z',
    ...overrides,
  };
}

function mockFetch(
  order: Record<string, unknown> | null,
  items: unknown[] = [],
  history: unknown[] = [],
  trackingEvents: unknown[] = [],
  success = true,
) {
  global.fetch = vi.fn().mockResolvedValueOnce({
    json: () =>
      Promise.resolve(
        success
          ? { success: true, data: { order, items, history, trackingEvents } }
          : { success: false },
      ),
  } as unknown as Response);
}

// ---------------------------------------------------------------------------
// Subject
// ---------------------------------------------------------------------------

import { OrderDetailClient } from '@/app/sites/[domain]/account/orders/[orderNumber]/OrderDetailClient';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OrderDetailClient', () => {
  beforeEach(() => {
    mockUseCustomerAuth.mockReturnValue({
      token: 'test-token',
      customer: { id: 1, email: 'test@example.com', firstName: 'Test', lastName: 'User' },
      loading: false,
    });
  });

  // ── Loading state ──────────────────────────────────────────────────────────

  it('shows a loading spinner while the fetch is in-flight', () => {
    // Never-resolving fetch keeps loading=true
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));
    render(<OrderDetailClient siteId={1} domain="example.com" orderNumber="ORD-001" />);
    expect(screen.getByText(/progress_activity/i) ?? document.querySelector('.animate-spin')).toBeTruthy();
  });

  // ── Not-found state ────────────────────────────────────────────────────────

  it('shows "Order not found" when the API returns success:false', async () => {
    mockFetch(null, [], [], [], false);
    await act(async () => {
      render(<OrderDetailClient siteId={1} domain="example.com" orderNumber="ORD-001" />);
    });
    await waitFor(() => {
      expect(screen.getByText('Order not found.')).toBeInTheDocument();
    });
  });

  // ── No fetch without token ─────────────────────────────────────────────────

  it('does not call fetch when token is absent', async () => {
    mockUseCustomerAuth.mockReturnValue({ token: null, customer: null, loading: false });
    global.fetch = vi.fn();
    render(<OrderDetailClient siteId={1} domain="example.com" orderNumber="ORD-001" />);
    // Give any queued microtasks a chance to run
    await act(async () => {});
    expect(global.fetch).not.toHaveBeenCalled();
  });

  // ── Basic render with an order ─────────────────────────────────────────────

  it('renders the order number and status badge', async () => {
    mockFetch(baseOrder());
    await act(async () => {
      render(<OrderDetailClient siteId={1} domain="example.com" orderNumber="ORD-001" />);
    });
    await waitFor(() => {
      expect(screen.getByText('Order ORD-001')).toBeInTheDocument();
      expect(screen.getByText('processing')).toBeInTheDocument();
    });
  });

  it('renders totals correctly (formats cents → dollars)', async () => {
    mockFetch(baseOrder());
    await act(async () => {
      render(<OrderDetailClient siteId={1} domain="example.com" orderNumber="ORD-001" />);
    });
    await waitFor(() => {
      expect(screen.getByText('$49.99')).toBeInTheDocument(); // subtotal
      expect(screen.getByText('$58.99')).toBeInTheDocument(); // total
    });
  });

  // ── Line items ─────────────────────────────────────────────────────────────

  it('renders line items with product name and quantity', async () => {
    const items = [
      { id: 1, productName: 'Blue Widget', quantity: 2, unitPrice: 999, total: 1998 },
    ];
    mockFetch(baseOrder(), items);
    await act(async () => {
      render(<OrderDetailClient siteId={1} domain="example.com" orderNumber="ORD-001" />);
    });
    await waitFor(() => {
      expect(screen.getByText('Blue Widget')).toBeInTheDocument();
      expect(screen.getByText('Qty: 2')).toBeInTheDocument();
    });
  });

  it('shows "each" price when quantity > 1', async () => {
    const items = [
      { id: 1, productName: 'Red Gadget', quantity: 3, unitPrice: 500, total: 1500 },
    ];
    mockFetch(baseOrder(), items);
    await act(async () => {
      render(<OrderDetailClient siteId={1} domain="example.com" orderNumber="ORD-001" />);
    });
    await waitFor(() => {
      expect(screen.getByText('$5.00 each')).toBeInTheDocument();
    });
  });

  it('does NOT show "each" price when quantity is 1', async () => {
    const items = [
      { id: 1, productName: 'Single Item', quantity: 1, unitPrice: 1200, total: 1200 },
    ];
    mockFetch(baseOrder(), items);
    await act(async () => {
      render(<OrderDetailClient siteId={1} domain="example.com" orderNumber="ORD-001" />);
    });
    await waitFor(() => {
      expect(screen.queryByText(/each/)).not.toBeInTheDocument();
    });
  });

  it('shows variant name when present', async () => {
    const items = [
      { id: 1, productName: 'T-Shirt', variantName: 'Large / Blue', quantity: 1, unitPrice: 2000, total: 2000 },
    ];
    mockFetch(baseOrder(), items);
    await act(async () => {
      render(<OrderDetailClient siteId={1} domain="example.com" orderNumber="ORD-001" />);
    });
    await waitFor(() => {
      expect(screen.getByText('Large / Blue')).toBeInTheDocument();
    });
  });

  it('shows design name for custom-designed items', async () => {
    const items = [
      {
        id: 1,
        productName: 'Custom Mug',
        quantity: 1,
        unitPrice: 1500,
        total: 1500,
        designId: 7,
        design: { id: 7, uuid: 'abc', name: 'My Mug Design', thumbnailUrl: null },
      },
    ];
    mockFetch(baseOrder(), items);
    await act(async () => {
      render(<OrderDetailClient siteId={1} domain="example.com" orderNumber="ORD-001" />);
    });
    await waitFor(() => {
      expect(screen.getByText('Custom: My Mug Design')).toBeInTheDocument();
    });
  });

  it('shows "Untitled design" when design name is null', async () => {
    const items = [
      {
        id: 1,
        productName: 'Custom Mug',
        quantity: 1,
        unitPrice: 1500,
        total: 1500,
        designId: 7,
        design: { id: 7, uuid: null, name: null, thumbnailUrl: null },
      },
    ];
    mockFetch(baseOrder(), items);
    await act(async () => {
      render(<OrderDetailClient siteId={1} domain="example.com" orderNumber="ORD-001" />);
    });
    await waitFor(() => {
      expect(screen.getByText('Custom: Untitled design')).toBeInTheDocument();
    });
  });

  it('shows "Design no longer available" for orphaned designId', async () => {
    const items = [
      {
        id: 1,
        productName: 'Orphan Item',
        quantity: 1,
        unitPrice: 1000,
        total: 1000,
        designId: 99,
        design: null,
      },
    ];
    mockFetch(baseOrder(), items);
    await act(async () => {
      render(<OrderDetailClient siteId={1} domain="example.com" orderNumber="ORD-001" />);
    });
    await waitFor(() => {
      expect(screen.getByText('Design no longer available')).toBeInTheDocument();
    });
  });

  it('renders product image when imageUrl is provided', async () => {
    const items = [
      { id: 1, productName: 'Widget', quantity: 1, unitPrice: 500, total: 500, imageUrl: 'https://cdn.example.com/img.jpg' },
    ];
    mockFetch(baseOrder(), items);
    await act(async () => {
      render(<OrderDetailClient siteId={1} domain="example.com" orderNumber="ORD-001" />);
    });
    await waitFor(() => {
      const img = document.querySelector('img[src="https://cdn.example.com/img.jpg"]');
      expect(img).toBeInTheDocument();
    });
  });

  it('prefers design thumbnailUrl over imageUrl', async () => {
    const items = [
      {
        id: 1,
        productName: 'Widget',
        quantity: 1,
        unitPrice: 500,
        total: 500,
        imageUrl: 'https://cdn.example.com/product.jpg',
        design: { id: 5, uuid: null, name: 'D', thumbnailUrl: 'https://cdn.example.com/design-thumb.jpg' },
      },
    ];
    mockFetch(baseOrder(), items);
    await act(async () => {
      render(<OrderDetailClient siteId={1} domain="example.com" orderNumber="ORD-001" />);
    });
    await waitFor(() => {
      const img = document.querySelector('img[src="https://cdn.example.com/design-thumb.jpg"]');
      expect(img).toBeInTheDocument();
    });
  });

  // ── Status colour badge ────────────────────────────────────────────────────

  it.each(['pending', 'processing', 'shipped', 'delivered', 'cancelled'])(
    'renders status badge for "%s"',
    async (status) => {
      mockFetch(baseOrder({ status }));
      await act(async () => {
        render(<OrderDetailClient siteId={1} domain="example.com" orderNumber="ORD-001" />);
      });
      await waitFor(() => {
        expect(screen.getByText(status)).toBeInTheDocument();
      });
    },
  );

  // ── Tracking section ───────────────────────────────────────────────────────

  it('shows the Shipment section when carrier is present', async () => {
    mockFetch(baseOrder({ carrier: 'UPS', trackingNumber: '1Z999AA10123456784' }));
    await act(async () => {
      render(<OrderDetailClient siteId={1} domain="example.com" orderNumber="ORD-001" />);
    });
    await waitFor(() => {
      expect(screen.getByText('Shipment')).toBeInTheDocument();
      expect(screen.getByText('UPS')).toBeInTheDocument();
      expect(screen.getByText('1Z999AA10123456784')).toBeInTheDocument();
    });
  });

  it('renders tracking number as link when trackingUrl is present', async () => {
    mockFetch(
      baseOrder({
        carrier: 'FedEx',
        trackingNumber: 'TRACK123',
        trackingUrl: 'https://fedex.com/track/TRACK123',
      }),
    );
    await act(async () => {
      render(<OrderDetailClient siteId={1} domain="example.com" orderNumber="ORD-001" />);
    });
    await waitFor(() => {
      const links = screen.getAllByRole('link');
      const trackingLink = links.find(
        (l) => (l as HTMLAnchorElement).href === 'https://fedex.com/track/TRACK123',
      );
      expect(trackingLink).toBeInTheDocument();
    });
  });

  it('shows "Awaiting carrier scan" when there is a tracking number but no event timestamp', async () => {
    mockFetch(baseOrder({ trackingNumber: 'NOTSCANYET', latestTrackingStatus: null, latestTrackingEventAt: null }));
    await act(async () => {
      render(<OrderDetailClient siteId={1} domain="example.com" orderNumber="ORD-001" />);
    });
    await waitFor(() => {
      expect(screen.getByText('Awaiting carrier scan')).toBeInTheDocument();
    });
  });

  it('shows tracking status pill for known statuses', async () => {
    mockFetch(baseOrder({ trackingNumber: 'TRK', latestTrackingStatus: 'in_transit' }));
    await act(async () => {
      render(<OrderDetailClient siteId={1} domain="example.com" orderNumber="ORD-001" />);
    });
    await waitFor(() => {
      expect(screen.getByText('In transit')).toBeInTheDocument();
    });
  });

  it('shows "Delivered" pill for delivered tracking status', async () => {
    mockFetch(baseOrder({ trackingNumber: 'TRK', latestTrackingStatus: 'delivered' }));
    await act(async () => {
      render(<OrderDetailClient siteId={1} domain="example.com" orderNumber="ORD-001" />);
    });
    await waitFor(() => {
      expect(screen.getByText('Delivered')).toBeInTheDocument();
    });
  });

  it('shows "Out for delivery" pill', async () => {
    mockFetch(baseOrder({ trackingNumber: 'TRK', latestTrackingStatus: 'out_for_delivery' }));
    await act(async () => {
      render(<OrderDetailClient siteId={1} domain="example.com" orderNumber="ORD-001" />);
    });
    await waitFor(() => {
      expect(screen.getByText('Out for delivery')).toBeInTheDocument();
    });
  });

  // ── Tracking events ────────────────────────────────────────────────────────

  it('renders tracking history events', async () => {
    const trackingEvents = [
      {
        processedAt: '2024-01-16T08:00:00Z',
        eventType: 'tracker.updated',
        payload: { result: { status: 'in_transit' } },
      },
    ];
    mockFetch(baseOrder({ trackingNumber: 'TRK' }), [], [], trackingEvents);
    await act(async () => {
      render(<OrderDetailClient siteId={1} domain="example.com" orderNumber="ORD-001" />);
    });
    await waitFor(() => {
      expect(screen.getByText('tracker.updated')).toBeInTheDocument();
      expect(screen.getByText('— in_transit')).toBeInTheDocument();
    });
  });

  it('falls back to "—" for payloads without a result.status', async () => {
    const trackingEvents = [
      { processedAt: '2024-01-16T08:00:00Z', eventType: 'tracker.created', payload: {} },
    ];
    mockFetch(baseOrder({ trackingNumber: 'TRK' }), [], [], trackingEvents);
    await act(async () => {
      render(<OrderDetailClient siteId={1} domain="example.com" orderNumber="ORD-001" />);
    });
    await waitFor(() => {
      expect(screen.getByText('— —')).toBeInTheDocument();
    });
  });

  // ── Order history / timeline ───────────────────────────────────────────────

  it('renders order history timeline entries', async () => {
    const history = [
      { id: 1, status: 'processing', note: 'Payment received', createdAt: '2024-01-15T10:00:00Z' },
      { id: 2, status: 'shipped', note: null, createdAt: '2024-01-16T09:00:00Z' },
    ];
    mockFetch(baseOrder(), [], history);
    await act(async () => {
      render(<OrderDetailClient siteId={1} domain="example.com" orderNumber="ORD-001" />);
    });
    await waitFor(() => {
      expect(screen.getByText('Processing')).toBeInTheDocument();
      expect(screen.getByText('Payment received')).toBeInTheDocument();
      expect(screen.getByText('Shipped')).toBeInTheDocument();
      expect(screen.getByText('Order History')).toBeInTheDocument();
    });
  });

  it('does not render Order History section when history is empty', async () => {
    mockFetch(baseOrder(), [], []);
    await act(async () => {
      render(<OrderDetailClient siteId={1} domain="example.com" orderNumber="ORD-001" />);
    });
    await waitFor(() => {
      expect(screen.queryByText('Order History')).not.toBeInTheDocument();
    });
  });

  // ── Addresses ─────────────────────────────────────────────────────────────

  it('renders shipping and billing addresses when present', async () => {
    const order = baseOrder({
      shippingAddress: {
        name: 'Jane Doe',
        line1: '123 Main St',
        city: 'Anytown',
        state: 'CA',
        zip: '90210',
        country: 'US',
      },
      billingAddress: {
        name: 'Jane Doe',
        line1: '456 Oak Ave',
        city: 'Othertown',
        state: 'NY',
        zip: '10001',
        country: 'US',
      },
    });
    mockFetch(order);
    await act(async () => {
      render(<OrderDetailClient siteId={1} domain="example.com" orderNumber="ORD-001" />);
    });
    await waitFor(() => {
      expect(screen.getByText('Shipping Address')).toBeInTheDocument();
      expect(screen.getByText('Billing Address')).toBeInTheDocument();
      expect(screen.getByText('123 Main St')).toBeInTheDocument();
      expect(screen.getByText('456 Oak Ave')).toBeInTheDocument();
    });
  });

  it('renders address line2 when provided', async () => {
    const order = baseOrder({
      shippingAddress: {
        name: 'Bob Builder',
        line1: '1 Main St',
        line2: 'Apt 2B',
        city: 'Springfield',
        state: 'IL',
        zip: '62701',
        country: 'US',
      },
    });
    mockFetch(order);
    await act(async () => {
      render(<OrderDetailClient siteId={1} domain="example.com" orderNumber="ORD-001" />);
    });
    await waitFor(() => {
      expect(screen.getByText('Apt 2B')).toBeInTheDocument();
    });
  });

  it('does not render addresses section when neither address is present', async () => {
    mockFetch(baseOrder());
    await act(async () => {
      render(<OrderDetailClient siteId={1} domain="example.com" orderNumber="ORD-001" />);
    });
    await waitFor(() => {
      expect(screen.queryByText('Shipping Address')).not.toBeInTheDocument();
    });
  });

  // ── Back link ──────────────────────────────────────────────────────────────

  it('renders the "Back to orders" navigation link', async () => {
    mockFetch(baseOrder());
    await act(async () => {
      render(<OrderDetailClient siteId={1} domain="example.com" orderNumber="ORD-001" />);
    });
    await waitFor(() => {
      expect(screen.getByText('Back to orders')).toBeInTheDocument();
    });
  });

  // ── Fetch wiring ───────────────────────────────────────────────────────────

  it('calls the correct API endpoint with Authorization header', async () => {
    const fetchSpy = vi.fn().mockResolvedValueOnce({
      json: () => Promise.resolve({ success: false }),
    } as unknown as Response);
    global.fetch = fetchSpy;

    await act(async () => {
      render(<OrderDetailClient siteId={42} domain="shop.example.com" orderNumber="ORD-999" />);
    });
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/storefront/42/account/orders/ORD-999',
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
        }),
      );
    });
  });
});
