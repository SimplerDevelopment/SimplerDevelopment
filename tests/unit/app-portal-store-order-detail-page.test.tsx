// @vitest-environment jsdom
/**
 * Unit tests for `app/portal/websites/[siteId]/store/orders/[orderId]/page.tsx`
 * — the per-tenant store order detail page. Stubs `fetch`, `next/navigation`,
 * and `next/link`, then exercises render, status update, fulfillment, shipping
 * label, notes, and error/loading branches.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// ─── Mocks (must precede page import) ────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useParams: () => ({ siteId: 'site-1', orderId: '42' }),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/portal/websites/site-1/store/orders/42',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string; [key: string]: unknown }) =>
    React.createElement('a', { href, ...rest }, children),
}));

// ─── Fetch helpers ────────────────────────────────────────────────────────────

type FetchHandler = (url: string, init?: RequestInit) => object;
const handlers: FetchHandler[] = [];

function setFetchHandler(handler: FetchHandler) {
  handlers.length = 0;
  handlers.push(handler);
}

function jsonResponse(body: object) {
  return { ok: true, json: async () => body } as Response;
}

const BASE = '/api/portal/websites/site-1/store';

const baseOrder = {
  id: 42,
  orderNumber: 'ORD-042',
  status: 'pending',
  customerName: 'Alice Smith',
  customerEmail: 'alice@example.com',
  customerPhone: '555-9876',
  shippingAddress: {
    name: 'Alice Smith',
    line1: '123 Main St',
    line2: null,
    city: 'Springfield',
    state: 'IL',
    postalCode: '62701',
    country: 'US',
  },
  billingAddress: null,
  items: [
    {
      id: 1,
      productName: 'T-Shirt',
      variantName: 'Large / Blue',
      sku: 'TS-L-BLUE',
      quantity: 2,
      unitPriceCents: 2500,
      totalCents: 5000,
      designId: null,
      design: null,
    },
    {
      id: 2,
      productName: 'Hat',
      variantName: null,
      sku: null,
      quantity: 1,
      unitPriceCents: 1500,
      totalCents: 1500,
      designId: 7,
      design: {
        id: 7,
        uuid: 'uuid-abc',
        name: 'My Design',
        thumbnailUrl: 'https://example.com/thumb.png',
      },
    },
  ],
  subtotalCents: 6500,
  shippingCents: 500,
  taxCents: 200,
  discountCents: 0,
  totalCents: 7200,
  trackingNumber: null,
  trackingUrl: null,
  internalNotes: null,
  statusHistory: [
    { id: 1, status: 'pending', note: 'Order placed', createdAt: '2025-01-15T10:00:00Z' },
  ],
  createdAt: '2025-01-15T10:00:00Z',
  carrier: null,
  shippingMethod: null,
  labelUrl: null,
  labelCostCents: null,
  labelPurchasedAt: null,
  easypostShipmentId: null,
};

function defaultFetch(url: string, init?: RequestInit): object {
  // Order detail GET
  if (url === `${BASE}/orders/42` && !init?.method) {
    return jsonResponse({ success: true, data: baseOrder });
  }
  // Status update
  if (url === `${BASE}/orders/42/status` && init?.method === 'PUT') {
    return jsonResponse({ success: true });
  }
  // Fulfillment update
  if (url === `${BASE}/orders/42/fulfillment` && init?.method === 'PUT') {
    return jsonResponse({ success: true });
  }
  // Notes PATCH
  if (url === `${BASE}/orders/42` && init?.method === 'PATCH') {
    return jsonResponse({ success: true });
  }
  // Rates compute
  if (url === `${BASE}/orders/42/rates` && init?.method === 'POST') {
    return jsonResponse({
      success: true,
      data: {
        shipmentId: 'shp_test123',
        parcel: { lengthIn: 10, widthIn: 8, heightIn: 4, weightOz: 16 },
        rates: [
          { id: 'rate_1', shipmentId: 'shp_test123', carrier: 'USPS', service: 'Priority', amountCents: 1099, currency: 'USD', estDeliveryDays: 2 },
          { id: 'rate_2', shipmentId: 'shp_test123', carrier: 'UPS', service: 'Ground', amountCents: 1499, currency: 'USD', estDeliveryDays: 5 },
        ],
      },
    });
  }
  // Label buy
  if (url === `${BASE}/orders/42/label` && init?.method === 'POST') {
    return jsonResponse({ success: true });
  }
  // Label refund
  if (url === `${BASE}/orders/42/label` && init?.method === 'DELETE') {
    return jsonResponse({ success: true });
  }
  return jsonResponse({ success: true, data: null });
}

// ─── Setup ────────────────────────────────────────────────────────────────────

let confirmMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  setFetchHandler(defaultFetch);
  global.fetch = vi.fn((url: string, init?: RequestInit) =>
    Promise.resolve(handlers[0](url, init) as Response)
  );
  confirmMock = vi.fn(() => true);
  window.confirm = confirmMock;
});

// ─── Import under test (after mocks) ─────────────────────────────────────────

import OrderDetailPage from '@/app/portal/websites/[siteId]/store/orders/[orderId]/page';

// ─── Render helper ────────────────────────────────────────────────────────────

async function renderPage() {
  const result = render(<OrderDetailPage />);
  // Wait for loading spinner to disappear
  await waitFor(() => {
    expect(screen.queryByText('refresh')).toBeNull();
  });
  return result;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('OrderDetailPage', () => {
  describe('loading state', () => {
    it('shows loading spinner initially', () => {
      render(<OrderDetailPage />);
      // The spinner renders a material icon text 'refresh'
      expect(document.querySelector('.animate-spin')).toBeTruthy();
    });
  });

  describe('order not found', () => {
    it('shows "Order not found." when fetch returns no data', async () => {
      setFetchHandler((url) => {
        if (url === `${BASE}/orders/42`) {
          return jsonResponse({ success: false, data: null });
        }
        return defaultFetch(url);
      });
      render(<OrderDetailPage />);
      await waitFor(() => {
        expect(screen.getByText('Order not found.')).toBeTruthy();
      });
    });

    it('shows "Order not found." when fetch throws', async () => {
      global.fetch = vi.fn(() => Promise.reject(new Error('Network error')));
      render(<OrderDetailPage />);
      await waitFor(() => {
        expect(screen.getByText('Order not found.')).toBeTruthy();
      });
    });
  });

  describe('order detail render', () => {
    it('renders the order number in the header', async () => {
      await renderPage();
      expect(screen.getByText('ORD-042')).toBeTruthy();
    });

    it('renders the order status badge', async () => {
      await renderPage();
      expect(screen.getAllByText('pending').length).toBeGreaterThan(0);
    });

    it('renders customer name and email', async () => {
      await renderPage();
      expect(screen.getAllByText('Alice Smith').length).toBeGreaterThan(0);
      expect(screen.getByText('alice@example.com')).toBeTruthy();
    });

    it('renders customer phone', async () => {
      await renderPage();
      expect(screen.getByText('555-9876')).toBeTruthy();
    });

    it('renders shipping address lines', async () => {
      await renderPage();
      expect(screen.getByText('123 Main St')).toBeTruthy();
      expect(screen.getByText('Springfield, IL, 62701')).toBeTruthy();
    });

    it('renders "Same as shipping" when billing address is null', async () => {
      await renderPage();
      expect(screen.getByText('Same as shipping')).toBeTruthy();
    });

    it('renders line item product name and SKU', async () => {
      await renderPage();
      expect(screen.getByText('T-Shirt')).toBeTruthy();
      expect(screen.getByText('TS-L-BLUE')).toBeTruthy();
    });

    it('renders line item variant name', async () => {
      await renderPage();
      expect(screen.getByText('Large / Blue')).toBeTruthy();
    });

    it('renders item with design thumbnail', async () => {
      await renderPage();
      const img = document.querySelector('img[alt="My Design"]') as HTMLImageElement;
      expect(img).toBeTruthy();
      expect(img.src).toContain('thumb.png');
    });

    it('renders "Custom design" note for item with design', async () => {
      await renderPage();
      expect(screen.getByText(/Custom design: My Design/)).toBeTruthy();
    });

    it('renders "--" for items without SKU', async () => {
      await renderPage();
      expect(screen.getByText('--')).toBeTruthy();
    });

    it('renders formatted money totals', async () => {
      await renderPage();
      // subtotal $65.00
      expect(screen.getByText('$65.00')).toBeTruthy();
      // shipping $5.00
      expect(screen.getByText('$5.00')).toBeTruthy();
      // tax $2.00
      expect(screen.getByText('$2.00')).toBeTruthy();
      // total $72.00
      expect(screen.getByText('$72.00')).toBeTruthy();
    });

    it('does not render discount row when discountCents is 0', async () => {
      await renderPage();
      expect(screen.queryByText('Discount')).toBeNull();
    });

    it('renders discount row when discountCents > 0', async () => {
      setFetchHandler((url) => {
        if (url === `${BASE}/orders/42`) {
          return jsonResponse({ success: true, data: { ...baseOrder, discountCents: 500 } });
        }
        return defaultFetch(url);
      });
      await renderPage();
      expect(screen.getByText('Discount')).toBeTruthy();
      expect(screen.getByText('-$5.00')).toBeTruthy();
    });

    it('renders the breadcrumb link to orders list', async () => {
      await renderPage();
      const link = screen.getByRole('link', { name: /Orders/ });
      expect(link.getAttribute('href')).toBe('/portal/websites/site-1/store/orders');
    });

    it('renders status history event', async () => {
      await renderPage();
      expect(screen.getByText('Order placed')).toBeTruthy();
    });

    it('renders "No status changes recorded." when history is empty', async () => {
      setFetchHandler((url) => {
        if (url === `${BASE}/orders/42`) {
          return jsonResponse({ success: true, data: { ...baseOrder, statusHistory: [] } });
        }
        return defaultFetch(url);
      });
      await renderPage();
      expect(screen.getByText('No status changes recorded.')).toBeTruthy();
    });
  });

  describe('item design edge cases', () => {
    it('renders design placeholder icon when design has no thumbnailUrl', async () => {
      setFetchHandler((url) => {
        if (url === `${BASE}/orders/42`) {
          return jsonResponse({
            success: true,
            data: {
              ...baseOrder,
              items: [
                {
                  ...baseOrder.items[1],
                  design: { id: 7, uuid: 'uuid-abc', name: 'My Design', thumbnailUrl: null },
                },
              ],
            },
          });
        }
        return defaultFetch(url);
      });
      await renderPage();
      // brush icon appears in the placeholder div
      expect(screen.getByText('brush')).toBeTruthy();
    });

    it('renders "Design no longer available" when designId set but design null', async () => {
      setFetchHandler((url) => {
        if (url === `${BASE}/orders/42`) {
          return jsonResponse({
            success: true,
            data: {
              ...baseOrder,
              items: [
                {
                  ...baseOrder.items[0],
                  designId: 99,
                  design: null,
                },
              ],
            },
          });
        }
        return defaultFetch(url);
      });
      await renderPage();
      expect(screen.getByText('Design no longer available')).toBeTruthy();
    });

    it('renders "Untitled design" when design name is null', async () => {
      setFetchHandler((url) => {
        if (url === `${BASE}/orders/42`) {
          return jsonResponse({
            success: true,
            data: {
              ...baseOrder,
              items: [
                {
                  ...baseOrder.items[1],
                  design: { id: 7, uuid: 'uuid-abc', name: null, thumbnailUrl: null },
                },
              ],
            },
          });
        }
        return defaultFetch(url);
      });
      await renderPage();
      expect(screen.getByText(/Untitled design/)).toBeTruthy();
    });
  });

  describe('status update', () => {
    it('renders the status select with all status options', async () => {
      await renderPage();
      const select = screen.getByRole('combobox') as HTMLSelectElement;
      const options = Array.from(select.options).map((o) => o.value);
      expect(options).toContain('pending');
      expect(options).toContain('shipped');
      expect(options).toContain('delivered');
      expect(options).toContain('cancelled');
      expect(options).toContain('refunded');
    });

    it('Update button is disabled when status equals current order status', async () => {
      await renderPage();
      const updateBtn = screen.getByRole('button', { name: /Update/ });
      expect(updateBtn).toBeDisabled();
    });

    it('Update button is enabled when status is changed', async () => {
      await renderPage();
      const select = screen.getByRole('combobox') as HTMLSelectElement;
      fireEvent.change(select, { target: { value: 'confirmed' } });
      const updateBtn = screen.getByRole('button', { name: /Update/ });
      expect(updateBtn).not.toBeDisabled();
    });

    it('calls the status API and shows success message', async () => {
      await renderPage();
      const select = screen.getByRole('combobox') as HTMLSelectElement;
      fireEvent.change(select, { target: { value: 'confirmed' } });
      fireEvent.click(screen.getByRole('button', { name: /Update/ }));
      await waitFor(() => expect(screen.getByText('Status updated.')).toBeTruthy());
    });

    it('accepts an optional status note', async () => {
      await renderPage();
      const select = screen.getByRole('combobox') as HTMLSelectElement;
      fireEvent.change(select, { target: { value: 'confirmed' } });
      const noteInput = screen.getByPlaceholderText('Add a note...');
      fireEvent.change(noteInput, { target: { value: 'Customer called' } });
      fireEvent.click(screen.getByRole('button', { name: /Update/ }));
      await waitFor(() => expect(screen.getByText('Status updated.')).toBeTruthy());
    });

    it('shows error message when status update fails', async () => {
      setFetchHandler((url, init) => {
        if (url === `${BASE}/orders/42/status` && init?.method === 'PUT') {
          return jsonResponse({ success: false, message: 'Server error on status' });
        }
        return defaultFetch(url, init);
      });
      await renderPage();
      const select = screen.getByRole('combobox') as HTMLSelectElement;
      fireEvent.change(select, { target: { value: 'confirmed' } });
      fireEvent.click(screen.getByRole('button', { name: /Update/ }));
      await waitFor(() => expect(screen.getByText('Server error on status')).toBeTruthy());
    });

    it('shows generic error when status update throws', async () => {
      setFetchHandler((url, init) => {
        if (url === `${BASE}/orders/42/status` && init?.method === 'PUT') {
          throw new Error('Network failure');
        }
        return defaultFetch(url, init);
      });
      await renderPage();
      const select = screen.getByRole('combobox') as HTMLSelectElement;
      fireEvent.change(select, { target: { value: 'confirmed' } });
      fireEvent.click(screen.getByRole('button', { name: /Update/ }));
      await waitFor(() => expect(screen.getByText('Something went wrong.')).toBeTruthy());
    });
  });

  describe('fulfillment', () => {
    it('renders tracking number and URL inputs', async () => {
      await renderPage();
      expect(screen.getByPlaceholderText('Enter tracking number')).toBeTruthy();
      expect(screen.getByPlaceholderText('https://...')).toBeTruthy();
    });

    it('"Mark as Shipped" button is visible for pending orders', async () => {
      await renderPage();
      expect(screen.getByRole('button', { name: /Mark as Shipped/ })).toBeTruthy();
    });

    it('"Mark as Shipped" button is hidden for shipped orders', async () => {
      setFetchHandler((url) => {
        if (url === `${BASE}/orders/42`) {
          return jsonResponse({ success: true, data: { ...baseOrder, status: 'shipped' } });
        }
        return defaultFetch(url);
      });
      await renderPage();
      expect(screen.queryByRole('button', { name: /Mark as Shipped/ })).toBeNull();
    });

    it('"Mark as Shipped" button is hidden for delivered orders', async () => {
      setFetchHandler((url) => {
        if (url === `${BASE}/orders/42`) {
          return jsonResponse({ success: true, data: { ...baseOrder, status: 'delivered' } });
        }
        return defaultFetch(url);
      });
      await renderPage();
      expect(screen.queryByRole('button', { name: /Mark as Shipped/ })).toBeNull();
    });

    it('Save Tracking calls fulfillment API and shows success', async () => {
      await renderPage();
      const trackingInput = screen.getByPlaceholderText('Enter tracking number');
      fireEvent.change(trackingInput, { target: { value: '1Z999AA10123456784' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save Tracking' }));
      await waitFor(() => expect(screen.getByText('Fulfillment updated.')).toBeTruthy());
    });

    it('Save Tracking shows error when API fails', async () => {
      setFetchHandler((url, init) => {
        if (url === `${BASE}/orders/42/fulfillment` && init?.method === 'PUT') {
          return jsonResponse({ success: false, message: 'Fulfillment error' });
        }
        return defaultFetch(url, init);
      });
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Save Tracking' }));
      await waitFor(() => expect(screen.getByText('Fulfillment error')).toBeTruthy());
    });

    it('Mark as Shipped calls status API and shows success', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: /Mark as Shipped/ }));
      await waitFor(() => expect(screen.getByText('Order marked as shipped.')).toBeTruthy());
    });

    it('Mark as Shipped also saves fulfillment when tracking number is present', async () => {
      const fetchSpy = vi.fn((url: string, init?: RequestInit) =>
        Promise.resolve(handlers[0](url, init) as Response)
      );
      global.fetch = fetchSpy;
      await renderPage();
      const trackingInput = screen.getByPlaceholderText('Enter tracking number');
      fireEvent.change(trackingInput, { target: { value: '1Z999AA10123456784' } });
      fireEvent.click(screen.getByRole('button', { name: /Mark as Shipped/ }));
      await waitFor(() => expect(screen.getByText('Order marked as shipped.')).toBeTruthy());
      const fulfillmentCalls = fetchSpy.mock.calls.filter(
        ([url, init]) => url === `${BASE}/orders/42/fulfillment` && (init as RequestInit)?.method === 'PUT'
      );
      expect(fulfillmentCalls.length).toBeGreaterThan(0);
    });

    it('Mark as Shipped shows error when status API fails', async () => {
      setFetchHandler((url, init) => {
        if (url === `${BASE}/orders/42/status` && init?.method === 'PUT') {
          return jsonResponse({ success: false, message: 'Ship failed' });
        }
        return defaultFetch(url, init);
      });
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: /Mark as Shipped/ }));
      await waitFor(() => expect(screen.getByText('Ship failed')).toBeTruthy());
    });
  });

  describe('internal notes', () => {
    it('renders the notes textarea', async () => {
      await renderPage();
      expect(screen.getByPlaceholderText('Add private notes about this order...')).toBeTruthy();
    });

    it('populates notes textarea when order has notes', async () => {
      setFetchHandler((url) => {
        if (url === `${BASE}/orders/42`) {
          return jsonResponse({ success: true, data: { ...baseOrder, internalNotes: 'VIP customer' } });
        }
        return defaultFetch(url);
      });
      await renderPage();
      const textarea = screen.getByPlaceholderText('Add private notes about this order...') as HTMLTextAreaElement;
      expect(textarea.value).toBe('VIP customer');
    });

    it('Save Notes calls PATCH and shows success', async () => {
      await renderPage();
      const textarea = screen.getByPlaceholderText('Add private notes about this order...');
      fireEvent.change(textarea, { target: { value: 'Check with warehouse' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save Notes' }));
      await waitFor(() => expect(screen.getByText('Notes saved.')).toBeTruthy());
    });

    it('Save Notes shows error when API fails', async () => {
      setFetchHandler((url, init) => {
        if (url === `${BASE}/orders/42` && init?.method === 'PATCH') {
          return jsonResponse({ success: false, message: 'Notes save failed' });
        }
        return defaultFetch(url, init);
      });
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Save Notes' }));
      await waitFor(() => expect(screen.getByText('Notes save failed')).toBeTruthy());
    });
  });

  describe('shipping label — no label purchased', () => {
    it('renders "Compute Rates" button when no label exists', async () => {
      await renderPage();
      expect(screen.getByRole('button', { name: /Compute Rates/ })).toBeTruthy();
    });

    it('clicking Compute Rates loads and displays rates', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: /Compute Rates/ }));
      await waitFor(() => expect(screen.getByText(/USPS/)).toBeTruthy());
      expect(screen.getByText(/Priority/)).toBeTruthy();
      expect(screen.getByText(/UPS/)).toBeTruthy();
      expect(screen.getByText(/Ground/)).toBeTruthy();
    });

    it('displays parcel summary after rates load', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: /Compute Rates/ }));
      await waitFor(() => expect(screen.getByText(/Parcel:/)).toBeTruthy());
      expect(screen.getByText(/10 × 8 × 4 in/)).toBeTruthy();
    });

    it('shows "Best value" badge on cheapest rate', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: /Compute Rates/ }));
      await waitFor(() => expect(screen.getByText('Best value')).toBeTruthy());
    });

    it('shows estimated delivery days on rates', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: /Compute Rates/ }));
      await waitFor(() => expect(screen.getByText(/Est. 2 days/)).toBeTruthy());
      expect(screen.getByText(/Est. 5 days/)).toBeTruthy();
    });

    it('selects a rate via radio and enables Buy Label button', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: /Compute Rates/ }));
      await waitFor(() => expect(screen.getByText(/USPS/)).toBeTruthy());
      const radios = screen.getAllByRole('radio') as HTMLInputElement[];
      expect(radios[0].checked).toBe(true); // cheapest auto-selected
      expect(screen.getByRole('button', { name: /Buy Label/ })).not.toBeDisabled();
    });

    it('clicking Buy Label purchases label and shows success', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: /Compute Rates/ }));
      await waitFor(() => expect(screen.getByText(/USPS/)).toBeTruthy());
      fireEvent.click(screen.getByRole('button', { name: /Buy Label/ }));
      await waitFor(() => expect(screen.getByText('Label purchased.')).toBeTruthy());
    });

    it('shows error when Compute Rates fails', async () => {
      setFetchHandler((url, init) => {
        if (url === `${BASE}/orders/42/rates` && init?.method === 'POST') {
          return jsonResponse({ success: false, message: 'Rate compute failed' });
        }
        return defaultFetch(url, init);
      });
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: /Compute Rates/ }));
      await waitFor(() => expect(screen.getByText('Rate compute failed')).toBeTruthy());
    });

    it('shows error when Buy Label fails', async () => {
      setFetchHandler((url, init) => {
        if (url === `${BASE}/orders/42/label` && init?.method === 'POST') {
          return jsonResponse({ success: false, message: 'Label purchase failed' });
        }
        return defaultFetch(url, init);
      });
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: /Compute Rates/ }));
      await waitFor(() => expect(screen.getByText(/USPS/)).toBeTruthy());
      fireEvent.click(screen.getByRole('button', { name: /Buy Label/ }));
      await waitFor(() => expect(screen.getByText('Label purchase failed')).toBeTruthy());
    });

    it('shows "No rates returned" message when rates array is empty', async () => {
      setFetchHandler((url, init) => {
        if (url === `${BASE}/orders/42/rates` && init?.method === 'POST') {
          return jsonResponse({
            success: true,
            data: { shipmentId: 'shp_empty', parcel: { lengthIn: 5, widthIn: 5, heightIn: 5, weightOz: 8 }, rates: [] },
          });
        }
        return defaultFetch(url, init);
      });
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: /Compute Rates/ }));
      await waitFor(() => expect(screen.getByText('No rates returned for this shipment.')).toBeTruthy());
    });

    it('renders singular "day" for 1-day delivery estimate', async () => {
      setFetchHandler((url, init) => {
        if (url === `${BASE}/orders/42/rates` && init?.method === 'POST') {
          return jsonResponse({
            success: true,
            data: {
              shipmentId: 'shp_1day',
              parcel: { lengthIn: 5, widthIn: 5, heightIn: 5, weightOz: 8 },
              rates: [
                { id: 'r1', shipmentId: 'shp_1day', carrier: 'USPS', service: 'Express', amountCents: 2500, currency: 'USD', estDeliveryDays: 1 },
              ],
            },
          });
        }
        return defaultFetch(url, init);
      });
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: /Compute Rates/ }));
      await waitFor(() => expect(screen.getByText(/Est. 1 day$/)).toBeTruthy());
    });
  });

  describe('shipping label — label already purchased', () => {
    const orderWithLabel = {
      ...baseOrder,
      status: 'shipped',
      labelUrl: 'https://label.example.com/label.pdf',
      carrier: 'USPS',
      shippingMethod: 'Priority Mail',
      trackingNumber: 'TRACK123',
      trackingUrl: 'https://tracking.usps.com/TRACK123',
      labelCostCents: 899,
      labelPurchasedAt: '2025-01-16T09:00:00Z',
    };

    it('renders "View Label" link when label exists', async () => {
      setFetchHandler((url) => {
        if (url === `${BASE}/orders/42`) {
          return jsonResponse({ success: true, data: orderWithLabel });
        }
        return defaultFetch(url);
      });
      await renderPage();
      const viewLink = screen.getByRole('link', { name: /View Label/ });
      expect(viewLink.getAttribute('href')).toBe('https://label.example.com/label.pdf');
    });

    it('renders carrier and service when label exists', async () => {
      setFetchHandler((url) => {
        if (url === `${BASE}/orders/42`) {
          return jsonResponse({ success: true, data: orderWithLabel });
        }
        return defaultFetch(url);
      });
      await renderPage();
      expect(screen.getByText('USPS')).toBeTruthy();
      expect(screen.getByText('Priority Mail')).toBeTruthy();
    });

    it('renders label cost formatted as money', async () => {
      setFetchHandler((url) => {
        if (url === `${BASE}/orders/42`) {
          return jsonResponse({ success: true, data: orderWithLabel });
        }
        return defaultFetch(url);
      });
      await renderPage();
      expect(screen.getByText('$8.99')).toBeTruthy();
    });

    it('renders tracking number as link when trackingUrl is present', async () => {
      setFetchHandler((url) => {
        if (url === `${BASE}/orders/42`) {
          return jsonResponse({ success: true, data: orderWithLabel });
        }
        return defaultFetch(url);
      });
      await renderPage();
      const trackingLink = screen.getByRole('link', { name: 'TRACK123' });
      expect(trackingLink.getAttribute('href')).toBe('https://tracking.usps.com/TRACK123');
    });

    it('renders tracking number as plain text when no trackingUrl', async () => {
      setFetchHandler((url) => {
        if (url === `${BASE}/orders/42`) {
          return jsonResponse({ success: true, data: { ...orderWithLabel, trackingUrl: null } });
        }
        return defaultFetch(url);
      });
      await renderPage();
      expect(screen.getByText('TRACK123')).toBeTruthy();
      // Should not be a link with that href
      const trackingLink = screen.queryByRole('link', { name: 'TRACK123' });
      expect(trackingLink).toBeNull();
    });

    it('clicking Refund Label with confirm=true calls DELETE and shows success', async () => {
      setFetchHandler((url, init) => {
        if (url === `${BASE}/orders/42`) {
          return jsonResponse({ success: true, data: orderWithLabel });
        }
        if (url === `${BASE}/orders/42/label` && init?.method === 'DELETE') {
          return jsonResponse({ success: true });
        }
        return defaultFetch(url, init);
      });
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: /Refund Label/ }));
      await waitFor(() => expect(screen.getByText('Label refund requested.')).toBeTruthy());
    });

    it('skips Refund Label when user cancels confirm dialog', async () => {
      confirmMock.mockReturnValueOnce(false);
      setFetchHandler((url) => {
        if (url === `${BASE}/orders/42`) {
          return jsonResponse({ success: true, data: orderWithLabel });
        }
        return defaultFetch(url);
      });
      const fetchSpy = vi.fn((url: string, init?: RequestInit) =>
        Promise.resolve(handlers[0](url, init) as Response)
      );
      global.fetch = fetchSpy;
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: /Refund Label/ }));
      await flush();
      const deleteCalls = fetchSpy.mock.calls.filter(
        ([url, init]) => url === `${BASE}/orders/42/label` && (init as RequestInit)?.method === 'DELETE'
      );
      expect(deleteCalls.length).toBe(0);
    });

    it('shows error when label refund fails', async () => {
      setFetchHandler((url, init) => {
        if (url === `${BASE}/orders/42`) {
          return jsonResponse({ success: true, data: orderWithLabel });
        }
        if (url === `${BASE}/orders/42/label` && init?.method === 'DELETE') {
          return jsonResponse({ success: false, message: 'Refund denied' });
        }
        return defaultFetch(url, init);
      });
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: /Refund Label/ }));
      await waitFor(() => expect(screen.getByText('Refund denied')).toBeTruthy());
    });
  });

  describe('address formatting edge cases', () => {
    it('renders "No shipping address" when shippingAddress is null', async () => {
      setFetchHandler((url) => {
        if (url === `${BASE}/orders/42`) {
          return jsonResponse({ success: true, data: { ...baseOrder, shippingAddress: null } });
        }
        return defaultFetch(url);
      });
      await renderPage();
      expect(screen.getByText('No shipping address')).toBeTruthy();
    });

    it('renders billing address when provided', async () => {
      setFetchHandler((url) => {
        if (url === `${BASE}/orders/42`) {
          return jsonResponse({
            success: true,
            data: {
              ...baseOrder,
              billingAddress: {
                name: 'Bob Jones',
                line1: '456 Oak Ave',
                city: 'Chicago',
                state: 'IL',
                postalCode: '60601',
                country: 'US',
              },
            },
          });
        }
        return defaultFetch(url);
      });
      await renderPage();
      expect(screen.getByText('Bob Jones')).toBeTruthy();
      expect(screen.getByText('456 Oak Ave')).toBeTruthy();
    });
  });

  describe('status color classes', () => {
    const statuses = ['confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'];
    for (const status of statuses) {
      it(`renders correct color class for status "${status}"`, async () => {
        setFetchHandler((url) => {
          if (url === `${BASE}/orders/42`) {
            return jsonResponse({ success: true, data: { ...baseOrder, status } });
          }
          return defaultFetch(url);
        });
        await renderPage();
        expect(screen.getAllByText(status).length).toBeGreaterThan(0);
      });
    }

    it('renders fallback gray class for unknown status', async () => {
      setFetchHandler((url) => {
        if (url === `${BASE}/orders/42`) {
          return jsonResponse({ success: true, data: { ...baseOrder, status: 'unknown_xyz' } });
        }
        return defaultFetch(url);
      });
      await renderPage();
      expect(screen.getAllByText('unknown_xyz').length).toBeGreaterThan(0);
    });
  });
});
