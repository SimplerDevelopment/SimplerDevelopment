// @vitest-environment jsdom
/**
 * Unit tests for the Portal Store Order Detail page:
 *   app/portal/websites/[siteId]/store/orders/[orderId]/page.tsx
 *
 * Covers:
 *  - loading / not-found states
 *  - full order render (customer, addresses, items, totals, status history)
 *  - updateStatus flow (success, error, no-op, throw)
 *  - updateFulfillment flow (success, error, throw)
 *  - markAsShipped flow (with/without tracking, error, throw)
 *  - saveNotes flow (success, error, throw)
 *  - computeRates flow (success with rates, empty rates, error, throw)
 *  - buyLabel flow (success, guard, error, throw)
 *  - refundLabel flow (confirmed, cancelled, error, throw)
 *  - conditional UI: discount row, shipping label sections, design thumbnails
 *  - formatMoney helper via rendered values
 *  - formatAddress: null, partial, full address
 *  - statusColors for all statuses
 *  - status history timeline (empty + events with/without notes)
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, act } from '@testing-library/react';

// ─── next/navigation mock ────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useParams: () => ({ siteId: 'site-99', orderId: '42' }),
}));

// ─── next/link → plain anchor ────────────────────────────────────────────────

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) =>
    React.createElement('a', { href, ...rest }, children),
}));

// ─── Fetch stub ──────────────────────────────────────────────────────────────

type FetchResp = { ok: boolean; json: () => Promise<unknown> };

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<FetchResp>>();

function makeRes(body: unknown, ok = true): FetchResp {
  return { ok, json: async () => body };
}

// ─── Base order fixture ───────────────────────────────────────────────────────

function baseOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 42,
    orderNumber: 'ORD-0042',
    status: 'pending',
    customerName: 'Jane Doe',
    customerEmail: 'jane@example.com',
    customerPhone: '555-1234',
    shippingAddress: {
      name: 'Jane Doe',
      line1: '100 Main St',
      city: 'Portland',
      state: 'OR',
      postalCode: '97201',
      country: 'US',
    },
    billingAddress: null,
    items: [
      {
        id: 1,
        productName: 'Widget',
        variantName: 'Red',
        sku: 'WID-R',
        quantity: 2,
        unitPriceCents: 1000,
        totalCents: 2000,
        designId: null,
        design: null,
      },
    ],
    subtotalCents: 2000,
    shippingCents: 500,
    taxCents: 150,
    discountCents: 0,
    totalCents: 2650,
    trackingNumber: null,
    trackingUrl: null,
    internalNotes: null,
    statusHistory: [],
    createdAt: '2026-01-15T10:00:00Z',
    carrier: null,
    shippingMethod: null,
    labelUrl: null,
    labelCostCents: null,
    labelPurchasedAt: null,
    easypostShipmentId: null,
    ...overrides,
  };
}

// ─── Setup / teardown ────────────────────────────────────────────────────────

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes('/orders/42') && !url.includes('/status') && !url.includes('/fulfillment') && !url.includes('/rates') && !url.includes('/label')) {
      return makeRes({ success: true, data: baseOrder() });
    }
    return makeRes({ success: true });
  });
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('confirm', vi.fn(() => true));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Import AFTER mocks
import OrderDetailPage from '@/app/portal/websites/[siteId]/store/orders/[orderId]/page';

function renderPage() {
  return render(<OrderDetailPage />);
}

function findBtn(container: HTMLElement, text: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find((b) =>
    b.textContent?.includes(text),
  ) as HTMLButtonElement | undefined;
}

// ─── Loading state ────────────────────────────────────────────────────────────

describe('OrderDetailPage — loading state', () => {
  it('shows spinner while order is fetching', () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const { container } = renderPage();
    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });
});

// ─── Not-found state ──────────────────────────────────────────────────────────

describe('OrderDetailPage — not-found state', () => {
  it('shows "Order not found." when success is false', async () => {
    fetchMock.mockResolvedValue(makeRes({ success: false }));
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Order not found.');
    });
  });

  it('shows "Order not found." when data is null', async () => {
    fetchMock.mockResolvedValue(makeRes({ success: true, data: null }));
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Order not found.');
    });
  });

  it('shows "Order not found." when fetch throws', async () => {
    fetchMock.mockRejectedValue(new Error('network'));
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Order not found.');
    });
  });
});

// ─── Main render ──────────────────────────────────────────────────────────────

describe('OrderDetailPage — main render', () => {
  it('renders breadcrumb back link', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('ORD-0042'));
    const link = container.querySelector('a[href*="/store/orders"]') as HTMLAnchorElement;
    expect(link).toBeTruthy();
    expect(link.textContent).toContain('Orders');
  });

  it('renders order number and status badge', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('ORD-0042');
      expect(container.textContent).toContain('pending');
    });
  });

  it('renders customer info', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('ORD-0042'));
    expect(container.textContent).toContain('Jane Doe');
    expect(container.textContent).toContain('jane@example.com');
    expect(container.textContent).toContain('555-1234');
  });

  it('renders shipping address lines', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('ORD-0042'));
    expect(container.textContent).toContain('100 Main St');
    expect(container.textContent).toContain('Portland');
  });

  it('shows "Same as shipping" when billing address is null', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('ORD-0042'));
    expect(container.textContent).toContain('Same as shipping');
  });

  it('renders order items with product name and price', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('ORD-0042'));
    expect(container.textContent).toContain('Widget');
    expect(container.textContent).toContain('Red'); // variantName
    expect(container.textContent).toContain('WID-R'); // sku
    expect(container.textContent).toContain('$10.00');
    expect(container.textContent).toContain('$20.00');
  });

  it('renders order totals', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('ORD-0042'));
    expect(container.textContent).toContain('$5.00');   // shipping
    expect(container.textContent).toContain('$1.50');   // tax
    expect(container.textContent).toContain('$26.50');  // total
  });

  it('does not render discount row when discountCents is 0', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('ORD-0042'));
    expect(container.textContent).not.toContain('Discount');
  });

  it('renders discount row when discountCents > 0', async () => {
    fetchMock.mockResolvedValue(makeRes({ success: true, data: baseOrder({ discountCents: 200 }) }));
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Discount'));
    expect(container.textContent).toContain('-$2.00');
  });

  it('renders SKU as "--" when not provided', async () => {
    fetchMock.mockResolvedValue(makeRes({
      success: true,
      data: baseOrder({
        items: [{ id: 2, productName: 'No-SKU', quantity: 1, unitPriceCents: 500, totalCents: 500, sku: null, variantName: null, designId: null, design: null }],
      }),
    }));
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('No-SKU'));
    expect(container.textContent).toContain('--');
  });

  it('shows "No shipping address" when shippingAddress is null', async () => {
    fetchMock.mockResolvedValue(makeRes({ success: true, data: baseOrder({ shippingAddress: null }) }));
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('ORD-0042'));
    expect(container.textContent).toContain('No shipping address');
  });

  it('renders all section headings', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('ORD-0042'));
    expect(container.textContent).toContain('Update Status');
    expect(container.textContent).toContain('Fulfillment');
    expect(container.textContent).toContain('Shipping Label');
    expect(container.textContent).toContain('Internal Notes');
    expect(container.textContent).toContain('Status History');
  });
});

// ─── Status colors / badges ───────────────────────────────────────────────────

describe('OrderDetailPage — status badge colors', () => {
  const statuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'];
  for (const status of statuses) {
    it(`renders correct badge for status: ${status}`, async () => {
      fetchMock.mockResolvedValue(makeRes({ success: true, data: baseOrder({ status }) }));
      const { container } = renderPage();
      await waitFor(() => expect(container.textContent).toContain(status));
    });
  }
});

// ─── Status update ────────────────────────────────────────────────────────────

describe('OrderDetailPage — updateStatus', () => {
  it('Update button is disabled when newStatus equals current order status', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('ORD-0042'));
    const btn = findBtn(container, 'Update') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('calls status PUT and reloads on success', async () => {
    let putCalled = false;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/status') && init?.method === 'PUT') {
        putCalled = true;
        return makeRes({ success: true });
      }
      return makeRes({ success: true, data: baseOrder() });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('ORD-0042'));
    const select = container.querySelector('select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'confirmed' } });
    await waitFor(() => {
      const btn = findBtn(container, 'Update') as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
    });
    fireEvent.click(findBtn(container, 'Update')!);
    await waitFor(() => {
      expect(putCalled).toBe(true);
      expect(container.textContent).toContain('Status updated.');
    });
  });

  it('shows error message when status update fails', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/status') && init?.method === 'PUT') {
        return makeRes({ success: false, message: 'Invalid transition' });
      }
      return makeRes({ success: true, data: baseOrder() });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('ORD-0042'));
    const select = container.querySelector('select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'delivered' } });
    await waitFor(() => expect(findBtn(container, 'Update')?.disabled).toBe(false));
    fireEvent.click(findBtn(container, 'Update')!);
    await waitFor(() => expect(container.textContent).toContain('Invalid transition'));
  });

  it('shows fallback error when status update fails without message', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/status') && init?.method === 'PUT') {
        return makeRes({ success: false });
      }
      return makeRes({ success: true, data: baseOrder() });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('ORD-0042'));
    const select = container.querySelector('select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'cancelled' } });
    await waitFor(() => expect(findBtn(container, 'Update')?.disabled).toBe(false));
    fireEvent.click(findBtn(container, 'Update')!);
    await waitFor(() => expect(container.textContent).toContain('Failed to update status.'));
  });

  it('shows "Something went wrong." when status PUT throws', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/status') && init?.method === 'PUT') throw new Error('net');
      return makeRes({ success: true, data: baseOrder() });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('ORD-0042'));
    const select = container.querySelector('select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'processing' } });
    await waitFor(() => expect(findBtn(container, 'Update')?.disabled).toBe(false));
    fireEvent.click(findBtn(container, 'Update')!);
    await waitFor(() => expect(container.textContent).toContain('Something went wrong.'));
  });

  it('clears statusNote on successful update', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/status') && init?.method === 'PUT') return makeRes({ success: true });
      return makeRes({ success: true, data: baseOrder() });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('ORD-0042'));
    const noteInput = container.querySelector('input[placeholder="Add a note..."]') as HTMLInputElement;
    fireEvent.change(noteInput, { target: { value: 'My note' } });
    expect(noteInput.value).toBe('My note');
    const select = container.querySelector('select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'confirmed' } });
    await waitFor(() => expect(findBtn(container, 'Update')?.disabled).toBe(false));
    fireEvent.click(findBtn(container, 'Update')!);
    await waitFor(() => expect(noteInput.value).toBe(''));
  });
});

// ─── Fulfillment update ───────────────────────────────────────────────────────

describe('OrderDetailPage — updateFulfillment', () => {
  it('calls fulfillment PUT and shows success', async () => {
    let putCalled = false;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/fulfillment') && init?.method === 'PUT') {
        putCalled = true;
        return makeRes({ success: true });
      }
      return makeRes({ success: true, data: baseOrder() });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('ORD-0042'));
    fireEvent.click(findBtn(container, 'Save Tracking')!);
    await waitFor(() => {
      expect(putCalled).toBe(true);
      expect(container.textContent).toContain('Fulfillment updated.');
    });
  });

  it('shows error when fulfillment update fails with message', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/fulfillment') && init?.method === 'PUT') {
        return makeRes({ success: false, message: 'Bad tracking' });
      }
      return makeRes({ success: true, data: baseOrder() });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('ORD-0042'));
    fireEvent.click(findBtn(container, 'Save Tracking')!);
    await waitFor(() => expect(container.textContent).toContain('Bad tracking'));
  });

  it('shows fallback error when fulfillment update fails without message', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/fulfillment') && init?.method === 'PUT') {
        return makeRes({ success: false });
      }
      return makeRes({ success: true, data: baseOrder() });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('ORD-0042'));
    fireEvent.click(findBtn(container, 'Save Tracking')!);
    await waitFor(() => expect(container.textContent).toContain('Failed to update.'));
  });

  it('shows "Something went wrong." when fulfillment PUT throws', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/fulfillment') && init?.method === 'PUT') throw new Error('net');
      return makeRes({ success: true, data: baseOrder() });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('ORD-0042'));
    fireEvent.click(findBtn(container, 'Save Tracking')!);
    await waitFor(() => expect(container.textContent).toContain('Something went wrong.'));
  });

  it('populates tracking inputs from loaded order', async () => {
    fetchMock.mockResolvedValue(makeRes({
      success: true,
      data: baseOrder({ trackingNumber: '1Z999', trackingUrl: 'https://ups.com/track' }),
    }));
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('ORD-0042'));
    const inputs = Array.from(container.querySelectorAll('input')) as HTMLInputElement[];
    const trackInput = inputs.find((i) => i.value === '1Z999');
    expect(trackInput).toBeTruthy();
    const urlInput = inputs.find((i) => i.value === 'https://ups.com/track');
    expect(urlInput).toBeTruthy();
  });
});

// ─── Mark as Shipped ──────────────────────────────────────────────────────────

describe('OrderDetailPage — markAsShipped', () => {
  it('shows "Mark as Shipped" button when status is pending', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('ORD-0042'));
    expect(findBtn(container, 'Mark as Shipped')).toBeTruthy();
  });

  it('does not show "Mark as Shipped" when status is shipped', async () => {
    fetchMock.mockResolvedValue(makeRes({ success: true, data: baseOrder({ status: 'shipped' }) }));
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('ORD-0042'));
    expect(findBtn(container, 'Mark as Shipped')).toBeFalsy();
  });

  it('does not show "Mark as Shipped" when status is delivered', async () => {
    fetchMock.mockResolvedValue(makeRes({ success: true, data: baseOrder({ status: 'delivered' }) }));
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('ORD-0042'));
    expect(findBtn(container, 'Mark as Shipped')).toBeFalsy();
  });

  it('calls status PUT and shows success on markAsShipped without tracking', async () => {
    let statusBody: unknown = null;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/status') && init?.method === 'PUT') {
        statusBody = JSON.parse(init.body as string);
        return makeRes({ success: true });
      }
      return makeRes({ success: true, data: baseOrder() });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('ORD-0042'));
    fireEvent.click(findBtn(container, 'Mark as Shipped')!);
    await waitFor(() => {
      expect(statusBody).toBeTruthy();
      expect((statusBody as { status: string }).status).toBe('shipped');
      expect(container.textContent).toContain('Order marked as shipped.');
    });
  });

  it('also calls fulfillment PUT when tracking number is set', async () => {
    let fulfillmentCalled = false;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/fulfillment') && init?.method === 'PUT') {
        fulfillmentCalled = true;
        return makeRes({ success: true });
      }
      if (url.includes('/status') && init?.method === 'PUT') {
        return makeRes({ success: true });
      }
      return makeRes({ success: true, data: baseOrder() });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('ORD-0042'));
    const inputs = Array.from(container.querySelectorAll('input')) as HTMLInputElement[];
    const trackInput = inputs.find((i) => i.placeholder === 'Enter tracking number') as HTMLInputElement;
    fireEvent.change(trackInput, { target: { value: 'TRACK123' } });
    fireEvent.click(findBtn(container, 'Mark as Shipped')!);
    await waitFor(() => {
      expect(fulfillmentCalled).toBe(true);
      expect(container.textContent).toContain('Order marked as shipped.');
    });
  });

  it('shows error when markAsShipped status call fails', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/status') && init?.method === 'PUT') {
        return makeRes({ success: false, message: 'Forbidden' });
      }
      return makeRes({ success: true, data: baseOrder() });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('ORD-0042'));
    fireEvent.click(findBtn(container, 'Mark as Shipped')!);
    await waitFor(() => expect(container.textContent).toContain('Forbidden'));
  });

  it('shows fallback error when markAsShipped fails without message', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/status') && init?.method === 'PUT') {
        return makeRes({ success: false });
      }
      return makeRes({ success: true, data: baseOrder() });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('ORD-0042'));
    fireEvent.click(findBtn(container, 'Mark as Shipped')!);
    await waitFor(() => expect(container.textContent).toContain('Failed to update.'));
  });

  it('shows "Something went wrong." when markAsShipped throws', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/status') && init?.method === 'PUT') throw new Error('net');
      return makeRes({ success: true, data: baseOrder() });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('ORD-0042'));
    fireEvent.click(findBtn(container, 'Mark as Shipped')!);
    await waitFor(() => expect(container.textContent).toContain('Something went wrong.'));
  });
});

// ─── Save Notes ───────────────────────────────────────────────────────────────

describe('OrderDetailPage — saveNotes', () => {
  it('calls PATCH and shows success', async () => {
    let patchCalled = false;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        patchCalled = true;
        return makeRes({ success: true });
      }
      return makeRes({ success: true, data: baseOrder() });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('ORD-0042'));
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Private note' } });
    fireEvent.click(findBtn(container, 'Save Notes')!);
    await waitFor(() => {
      expect(patchCalled).toBe(true);
      expect(container.textContent).toContain('Notes saved.');
    });
  });

  it('shows error when PATCH fails with message', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') return makeRes({ success: false, message: 'Unauthorized' });
      return makeRes({ success: true, data: baseOrder() });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('ORD-0042'));
    fireEvent.click(findBtn(container, 'Save Notes')!);
    await waitFor(() => expect(container.textContent).toContain('Unauthorized'));
  });

  it('shows fallback error when PATCH fails without message', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') return makeRes({ success: false });
      return makeRes({ success: true, data: baseOrder() });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('ORD-0042'));
    fireEvent.click(findBtn(container, 'Save Notes')!);
    await waitFor(() => expect(container.textContent).toContain('Failed to save notes.'));
  });

  it('shows "Something went wrong." when PATCH throws', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') throw new Error('net');
      return makeRes({ success: true, data: baseOrder() });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('ORD-0042'));
    fireEvent.click(findBtn(container, 'Save Notes')!);
    await waitFor(() => expect(container.textContent).toContain('Something went wrong.'));
  });

  it('populates notes textarea from loaded order', async () => {
    fetchMock.mockResolvedValue(makeRes({ success: true, data: baseOrder({ internalNotes: 'Staff only' }) }));
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('ORD-0042'));
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea.value).toBe('Staff only');
  });
});

// ─── Shipping Label — no label yet ────────────────────────────────────────────

describe('OrderDetailPage — computeRates', () => {
  it('shows Compute Rates button when labelUrl is null', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('ORD-0042'));
    expect(findBtn(container, 'Compute Rates')).toBeTruthy();
  });

  it('shows rates after successful computeRates', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/rates') && init?.method === 'POST') {
        return makeRes({
          success: true,
          data: {
            shipmentId: 'ship_abc',
            parcel: { lengthIn: 10, widthIn: 8, heightIn: 4, weightOz: 16 },
            rates: [
              { id: 'rate_1', shipmentId: 'ship_abc', carrier: 'USPS', service: 'Priority', amountCents: 899, currency: 'USD', estDeliveryDays: 2 },
              { id: 'rate_2', shipmentId: 'ship_abc', carrier: 'UPS', service: 'Ground', amountCents: 1200, currency: 'USD', estDeliveryDays: 5 },
            ],
          },
        });
      }
      return makeRes({ success: true, data: baseOrder() });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('ORD-0042'));
    fireEvent.click(findBtn(container, 'Compute Rates')!);
    await waitFor(() => {
      expect(container.textContent).toContain('USPS');
      expect(container.textContent).toContain('Priority');
      expect(container.textContent).toContain('Best value');
      expect(container.textContent).toContain('UPS');
      expect(container.textContent).toContain('$8.99');
    });
  });

  it('shows parcel summary after computeRates', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/rates') && init?.method === 'POST') {
        return makeRes({
          success: true,
          data: {
            shipmentId: 'ship_xyz',
            parcel: { lengthIn: 12, widthIn: 6, heightIn: 3, weightOz: 8 },
            rates: [{ id: 'r1', shipmentId: 'ship_xyz', carrier: 'USPS', service: 'First', amountCents: 400, currency: 'USD', estDeliveryDays: 3 }],
          },
        });
      }
      return makeRes({ success: true, data: baseOrder() });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('ORD-0042'));
    fireEvent.click(findBtn(container, 'Compute Rates')!);
    await waitFor(() => {
      expect(container.textContent).toContain('12');
      expect(container.textContent).toContain('Parcel');
    });
  });

  it('shows "No rates returned" when rates array is empty', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/rates') && init?.method === 'POST') {
        return makeRes({
          success: true,
          data: { shipmentId: 'ship_empty', parcel: { lengthIn: 1, widthIn: 1, heightIn: 1, weightOz: 1 }, rates: [] },
        });
      }
      return makeRes({ success: true, data: baseOrder() });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('ORD-0042'));
    fireEvent.click(findBtn(container, 'Compute Rates')!);
    await waitFor(() => expect(container.textContent).toContain('No rates returned'));
  });

  it('shows label error when computeRates returns success:false', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/rates') && init?.method === 'POST') {
        return makeRes({ success: false, message: 'Address invalid' });
      }
      return makeRes({ success: true, data: baseOrder() });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('ORD-0042'));
    fireEvent.click(findBtn(container, 'Compute Rates')!);
    await waitFor(() => expect(container.textContent).toContain('Address invalid'));
  });

  it('shows fallback label error when computeRates fails without message', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/rates') && init?.method === 'POST') {
        return makeRes({ success: false });
      }
      return makeRes({ success: true, data: baseOrder() });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('ORD-0042'));
    fireEvent.click(findBtn(container, 'Compute Rates')!);
    await waitFor(() => expect(container.textContent).toContain('Failed to compute rates.'));
  });

  it('shows "Failed to compute rates." when computeRates throws', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/rates') && init?.method === 'POST') throw new Error('net');
      return makeRes({ success: true, data: baseOrder() });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('ORD-0042'));
    fireEvent.click(findBtn(container, 'Compute Rates')!);
    await waitFor(() => expect(container.textContent).toContain('Failed to compute rates.'));
  });

  it('shows singular day estimate for 1 day delivery', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/rates') && init?.method === 'POST') {
        return makeRes({
          success: true,
          data: {
            shipmentId: 's1',
            parcel: { lengthIn: 1, widthIn: 1, heightIn: 1, weightOz: 1 },
            rates: [{ id: 'r1', shipmentId: 's1', carrier: 'FedEx', service: 'Overnight', amountCents: 2500, currency: 'USD', estDeliveryDays: 1 }],
          },
        });
      }
      return makeRes({ success: true, data: baseOrder() });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('ORD-0042'));
    fireEvent.click(findBtn(container, 'Compute Rates')!);
    await waitFor(() => expect(container.textContent).toContain('Est. 1 day'));
  });

  it('shows plural days for multi-day delivery', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/rates') && init?.method === 'POST') {
        return makeRes({
          success: true,
          data: {
            shipmentId: 's2',
            parcel: { lengthIn: 1, widthIn: 1, heightIn: 1, weightOz: 1 },
            rates: [{ id: 'r2', shipmentId: 's2', carrier: 'UPS', service: 'Ground', amountCents: 800, currency: 'USD', estDeliveryDays: 5 }],
          },
        });
      }
      return makeRes({ success: true, data: baseOrder() });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('ORD-0042'));
    fireEvent.click(findBtn(container, 'Compute Rates')!);
    await waitFor(() => expect(container.textContent).toContain('Est. 5 days'));
  });

  it('hides delivery estimate when estDeliveryDays is null', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/rates') && init?.method === 'POST') {
        return makeRes({
          success: true,
          data: {
            shipmentId: 's3',
            parcel: { lengthIn: 1, widthIn: 1, heightIn: 1, weightOz: 1 },
            rates: [{ id: 'r3', shipmentId: 's3', carrier: 'DHL', service: 'Express', amountCents: 1500, currency: 'USD', estDeliveryDays: null }],
          },
        });
      }
      return makeRes({ success: true, data: baseOrder() });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('ORD-0042'));
    fireEvent.click(findBtn(container, 'Compute Rates')!);
    await waitFor(() => expect(container.textContent).toContain('DHL'));
    expect(container.textContent).not.toContain('Est.');
  });
});

// ─── Buy Label ────────────────────────────────────────────────────────────────

describe('OrderDetailPage — buyLabel', () => {
  async function loadRates(container: HTMLElement) {
    await waitFor(() => expect(container.textContent).toContain('ORD-0042'));
    fireEvent.click(findBtn(container, 'Compute Rates')!);
    await waitFor(() => expect(container.textContent).toContain('USPS'));
  }

  function withRatesMock(labelHandler: (url: string, init?: RequestInit) => Promise<FetchResp>) {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/rates') && init?.method === 'POST') {
        return makeRes({
          success: true,
          data: {
            shipmentId: 'ship_buy',
            parcel: { lengthIn: 5, widthIn: 5, heightIn: 5, weightOz: 10 },
            rates: [{ id: 'rate_buy', shipmentId: 'ship_buy', carrier: 'USPS', service: 'Priority', amountCents: 799, currency: 'USD', estDeliveryDays: 2 }],
          },
        });
      }
      if (url.includes('/label')) return labelHandler(url, init);
      return makeRes({ success: true, data: baseOrder() });
    });
  }

  it('buys label successfully and shows success message', async () => {
    withRatesMock(async () => makeRes({ success: true }));
    const { container } = renderPage();
    await loadRates(container);
    fireEvent.click(findBtn(container, 'Buy Label')!);
    await waitFor(() => expect(container.textContent).toContain('Label purchased.'));
  });

  it('shows label error when buy fails with message', async () => {
    withRatesMock(async () => makeRes({ success: false, message: 'Payment declined' }));
    const { container } = renderPage();
    await loadRates(container);
    fireEvent.click(findBtn(container, 'Buy Label')!);
    await waitFor(() => expect(container.textContent).toContain('Payment declined'));
  });

  it('shows fallback label error when buy fails without message', async () => {
    withRatesMock(async () => makeRes({ success: false }));
    const { container } = renderPage();
    await loadRates(container);
    fireEvent.click(findBtn(container, 'Buy Label')!);
    await waitFor(() => expect(container.textContent).toContain('Failed to purchase label.'));
  });

  it('shows "Failed to purchase label." when buy throws', async () => {
    withRatesMock(async () => { throw new Error('net'); });
    const { container } = renderPage();
    await loadRates(container);
    fireEvent.click(findBtn(container, 'Buy Label')!);
    await waitFor(() => expect(container.textContent).toContain('Failed to purchase label.'));
  });

  it('can change rate selection before buying', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/rates') && init?.method === 'POST') {
        return makeRes({
          success: true,
          data: {
            shipmentId: 'ship_multi',
            parcel: { lengthIn: 5, widthIn: 5, heightIn: 5, weightOz: 10 },
            rates: [
              { id: 'rate_a', shipmentId: 'ship_multi', carrier: 'USPS', service: 'Priority', amountCents: 799, currency: 'USD', estDeliveryDays: 2 },
              { id: 'rate_b', shipmentId: 'ship_multi', carrier: 'UPS', service: 'Ground', amountCents: 1100, currency: 'USD', estDeliveryDays: 5 },
            ],
          },
        });
      }
      return makeRes({ success: true, data: baseOrder() });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('ORD-0042'));
    fireEvent.click(findBtn(container, 'Compute Rates')!);
    await waitFor(() => expect(container.textContent).toContain('UPS'));
    // Select the UPS radio
    const radios = Array.from(container.querySelectorAll('input[type="radio"]')) as HTMLInputElement[];
    const upsRadio = radios.find((r) => r.value === 'rate_b');
    expect(upsRadio).toBeTruthy();
    fireEvent.click(upsRadio!);
    expect(upsRadio!.checked).toBe(true);
  });
});

// ─── Refund Label ─────────────────────────────────────────────────────────────

describe('OrderDetailPage — refundLabel', () => {
  function withLabelOrder() {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === 'DELETE' && url.includes('/label')) {
        return makeRes({ success: true });
      }
      return makeRes({
        success: true,
        data: baseOrder({
          labelUrl: 'https://label.example.com/label.pdf',
          carrier: 'USPS',
          shippingMethod: 'Priority Mail',
          trackingNumber: 'TRACK001',
          trackingUrl: 'https://track.usps.com/TRACK001',
          labelPurchasedAt: '2026-01-15T12:00:00Z',
          labelCostCents: 799,
        }),
      });
    });
  }

  it('renders label section with carrier and service info', async () => {
    withLabelOrder();
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('ORD-0042'));
    expect(container.textContent).toContain('USPS');
    expect(container.textContent).toContain('Priority Mail');
    expect(container.textContent).toContain('$7.99');
    expect(container.textContent).toContain('View Label');
  });

  it('renders tracking link when trackingUrl is set', async () => {
    withLabelOrder();
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('ORD-0042'));
    const trackLink = Array.from(container.querySelectorAll('a')).find(
      (a) => a.href.includes('track.usps.com'),
    );
    expect(trackLink).toBeTruthy();
    expect(trackLink!.textContent).toContain('TRACK001');
  });

  it('calls DELETE on refundLabel when user confirms', async () => {
    withLabelOrder();
    vi.stubGlobal('confirm', vi.fn(() => true));
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('View Label'));
    await act(async () => {
      fireEvent.click(findBtn(container, 'Refund Label')!);
    });
    await waitFor(() => {
      const deleteCalls = fetchMock.mock.calls.filter(
        ([url, init]) => url.includes('/label') && (init as RequestInit | undefined)?.method === 'DELETE',
      );
      expect(deleteCalls.length).toBeGreaterThan(0);
      expect(container.textContent).toContain('Label refund requested.');
    });
  });

  it('aborts refund when user cancels confirm dialog', async () => {
    withLabelOrder();
    vi.stubGlobal('confirm', vi.fn(() => false));
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('View Label'));
    fireEvent.click(findBtn(container, 'Refund Label')!);
    // No delete should happen
    const deleteCalls = fetchMock.mock.calls.filter(
      ([url, init]) => url.includes('/label') && (init as RequestInit | undefined)?.method === 'DELETE',
    );
    expect(deleteCalls.length).toBe(0);
  });

  it('shows label error when refund fails with message', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') return makeRes({ success: false, message: 'Already refunded' });
      return makeRes({ success: true, data: baseOrder({ labelUrl: 'https://label.example.com/l.pdf' }) });
    });
    vi.stubGlobal('confirm', vi.fn(() => true));
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('View Label'));
    await act(async () => { fireEvent.click(findBtn(container, 'Refund Label')!); });
    await waitFor(() => expect(container.textContent).toContain('Already refunded'));
  });

  it('shows fallback label error when refund fails without message', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') return makeRes({ success: false });
      return makeRes({ success: true, data: baseOrder({ labelUrl: 'https://label.example.com/l.pdf' }) });
    });
    vi.stubGlobal('confirm', vi.fn(() => true));
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('View Label'));
    await act(async () => { fireEvent.click(findBtn(container, 'Refund Label')!); });
    await waitFor(() => expect(container.textContent).toContain('Failed to refund label.'));
  });

  it('shows "Failed to refund label." when DELETE throws', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') throw new Error('net');
      return makeRes({ success: true, data: baseOrder({ labelUrl: 'https://label.example.com/l.pdf' }) });
    });
    vi.stubGlobal('confirm', vi.fn(() => true));
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('View Label'));
    await act(async () => { fireEvent.click(findBtn(container, 'Refund Label')!); });
    await waitFor(() => expect(container.textContent).toContain('Failed to refund label.'));
  });

  it('renders tracking number as plain text when no trackingUrl', async () => {
    fetchMock.mockResolvedValue(makeRes({
      success: true,
      data: baseOrder({
        labelUrl: 'https://label.example.com/l.pdf',
        trackingNumber: 'NOURL999',
        trackingUrl: null,
        labelCostCents: 500,
        labelPurchasedAt: '2026-01-15T12:00:00Z',
      }),
    }));
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('NOURL999'));
    // Should be a <p>, not an <a>
    const links = Array.from(container.querySelectorAll('a')).filter((a) => a.textContent?.includes('NOURL999'));
    expect(links.length).toBe(0);
  });
});

// ─── Design thumbnails in items ───────────────────────────────────────────────

describe('OrderDetailPage — design item variants', () => {
  it('renders design thumbnail when item has design with thumbnailUrl', async () => {
    fetchMock.mockResolvedValue(makeRes({
      success: true,
      data: baseOrder({
        items: [{
          id: 10,
          productName: 'Custom Shirt',
          quantity: 1,
          unitPriceCents: 3000,
          totalCents: 3000,
          sku: null,
          variantName: null,
          designId: 5,
          design: { id: 5, uuid: 'abc-uuid', name: 'My Design', thumbnailUrl: 'https://cdn/thumb.png' },
        }],
      }),
    }));
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Custom Shirt'));
    const img = container.querySelector('img') as HTMLImageElement | null;
    expect(img).toBeTruthy();
    expect(img!.src).toContain('thumb.png');
    expect(container.textContent).toContain('My Design');
  });

  it('renders design placeholder when item has design but no thumbnailUrl', async () => {
    fetchMock.mockResolvedValue(makeRes({
      success: true,
      data: baseOrder({
        items: [{
          id: 11,
          productName: 'Custom Hat',
          quantity: 1,
          unitPriceCents: 2500,
          totalCents: 2500,
          sku: null,
          variantName: null,
          designId: 7,
          design: { id: 7, uuid: 'def-uuid', name: null, thumbnailUrl: null },
        }],
      }),
    }));
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Custom Hat'));
    // placeholder div with brush icon
    expect(container.querySelector('.material-icons')).toBeTruthy();
    expect(container.textContent).toContain('Untitled design');
  });

  it('shows "Design no longer available" when designId set but design is null', async () => {
    fetchMock.mockResolvedValue(makeRes({
      success: true,
      data: baseOrder({
        items: [{
          id: 12,
          productName: 'Deleted Design Product',
          quantity: 1,
          unitPriceCents: 1500,
          totalCents: 1500,
          sku: null,
          variantName: null,
          designId: 99,
          design: null,
        }],
      }),
    }));
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Deleted Design Product'));
    expect(container.textContent).toContain('Design no longer available');
  });
});

// ─── Status History Timeline ──────────────────────────────────────────────────

describe('OrderDetailPage — status history', () => {
  it('shows "No status changes recorded." when history is empty', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('ORD-0042'));
    expect(container.textContent).toContain('No status changes recorded.');
  });

  it('renders status history events with status badge and date', async () => {
    fetchMock.mockResolvedValue(makeRes({
      success: true,
      data: baseOrder({
        statusHistory: [
          { id: 1, status: 'pending', note: null, createdAt: '2026-01-15T10:00:00Z' },
          { id: 2, status: 'confirmed', note: 'Payment verified', createdAt: '2026-01-15T11:00:00Z' },
        ],
      }),
    }));
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('ORD-0042'));
    expect(container.textContent).toContain('Payment verified');
  });

  it('does not render note paragraph when event note is null', async () => {
    fetchMock.mockResolvedValue(makeRes({
      success: true,
      data: baseOrder({
        statusHistory: [
          { id: 1, status: 'pending', note: null, createdAt: '2026-01-15T10:00:00Z' },
        ],
      }),
    }));
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('ORD-0042'));
    // History renders but no note text beyond the status badge
    expect(container.querySelectorAll('.relative > div').length).toBeGreaterThan(0);
  });
});

// ─── Error / success banners ──────────────────────────────────────────────────

describe('OrderDetailPage — banners', () => {
  it('shows error banner with icon when error is set', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/fulfillment') && init?.method === 'PUT') {
        return makeRes({ success: false, message: 'Server error' });
      }
      return makeRes({ success: true, data: baseOrder() });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('ORD-0042'));
    fireEvent.click(findBtn(container, 'Save Tracking')!);
    await waitFor(() => {
      expect(container.textContent).toContain('Server error');
      // Error banner has red styling
      const errorDiv = Array.from(container.querySelectorAll('div')).find(
        (d) => d.classList.contains('bg-red-50'),
      );
      expect(errorDiv).toBeTruthy();
    });
  });

  it('shows success banner with icon when success is set', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/fulfillment') && init?.method === 'PUT') {
        return makeRes({ success: true });
      }
      return makeRes({ success: true, data: baseOrder() });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('ORD-0042'));
    fireEvent.click(findBtn(container, 'Save Tracking')!);
    await waitFor(() => {
      const successDiv = Array.from(container.querySelectorAll('div')).find(
        (d) => d.classList.contains('bg-green-50'),
      );
      expect(successDiv).toBeTruthy();
    });
  });
});

// ─── Billing address rendered ─────────────────────────────────────────────────

describe('OrderDetailPage — billing address', () => {
  it('renders billing address lines when billingAddress is set', async () => {
    fetchMock.mockResolvedValue(makeRes({
      success: true,
      data: baseOrder({
        billingAddress: { name: 'Corp Inc', line1: '200 Biz Ave', city: 'Seattle', state: 'WA', postalCode: '98101', country: 'US' },
      }),
    }));
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('ORD-0042'));
    expect(container.textContent).toContain('Corp Inc');
    expect(container.textContent).toContain('200 Biz Ave');
  });

  it('handles partial address (line2 present)', async () => {
    fetchMock.mockResolvedValue(makeRes({
      success: true,
      data: baseOrder({
        shippingAddress: { name: 'Ann', line1: '1 A St', line2: 'Apt 2', city: 'NYC', state: 'NY', postalCode: '10001', country: 'US' },
      }),
    }));
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('ORD-0042'));
    expect(container.textContent).toContain('Apt 2');
  });
});

// ─── Refresh rates ────────────────────────────────────────────────────────────

describe('OrderDetailPage — refresh rates button', () => {
  it('re-fetches rates when "Refresh rates" is clicked', async () => {
    let rateCallCount = 0;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/rates') && init?.method === 'POST') {
        rateCallCount++;
        return makeRes({
          success: true,
          data: {
            shipmentId: 'ship_r',
            parcel: { lengthIn: 5, widthIn: 5, heightIn: 5, weightOz: 10 },
            rates: [{ id: 'r_ref', shipmentId: 'ship_r', carrier: 'USPS', service: 'Priority', amountCents: 799, currency: 'USD', estDeliveryDays: 2 }],
          },
        });
      }
      return makeRes({ success: true, data: baseOrder() });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('ORD-0042'));
    fireEvent.click(findBtn(container, 'Compute Rates')!);
    await waitFor(() => expect(container.textContent).toContain('USPS'));
    expect(rateCallCount).toBe(1);
    fireEvent.click(findBtn(container, 'Refresh rates')!);
    await waitFor(() => expect(rateCallCount).toBe(2));
  });
});
