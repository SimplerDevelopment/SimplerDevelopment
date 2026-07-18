// @vitest-environment jsdom
/**
 * Unit tests for the Portal Store Shipping page:
 *   app/portal/websites/[siteId]/store/shipping/page.tsx
 *
 * Covers:
 *  - loading spinner state
 *  - initial fetch of zones (success + empty + error/throw)
 *  - empty-state UI
 *  - zones list: expand/collapse, country display, rate counts
 *  - helper functions: formatMoney, centsToDollars, dollarsToCents
 *  - zone form: create, edit, save (success + error + throw), cancel
 *  - delete zone (confirm=true + confirm=false)
 *  - rate form: open create, open edit (manual + easypost), cancel
 *  - rate source toggle (manual <-> easypost)
 *  - save rate (manual success + error + throw, easypost success)
 *  - delete rate (confirm=true + confirm=false)
 *  - rate table display: isLive badge, formatMoney, delivery days, freeAbove
 *  - "Add Zone" header button: show/cancel zone form
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, act } from '@testing-library/react';

// ─── next/navigation mock ────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useParams: () => ({ siteId: 'site-99' }),
}));

// ─── Fetch stub ──────────────────────────────────────────────────────────────

type FetchResp = { ok: boolean; json: () => Promise<unknown> };
const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<FetchResp>>();

function makeRes(body: unknown, ok = true): FetchResp {
  return { ok, json: async () => body };
}

// ─── window.confirm stub ─────────────────────────────────────────────────────

const confirmMock = vi.fn<(message?: string) => boolean>();

// ─── Zone / rate fixture helpers ─────────────────────────────────────────────

function makeRate(overrides: Partial<{
  id: number;
  name: string;
  rateType: string;
  price: number;
  minDeliveryDays: number | null;
  maxDeliveryDays: number | null;
  freeAbove: number | null;
  provider: string;
  carrierCode: string | null;
  serviceCode: string | null;
  liveRateOnly: boolean;
}> = {}) {
  return {
    id: 1,
    name: 'Standard',
    rateType: 'flat',
    price: 599,
    minDeliveryDays: null,
    maxDeliveryDays: null,
    freeAbove: null,
    provider: 'manual',
    carrierCode: null,
    serviceCode: null,
    liveRateOnly: false,
    ...overrides,
  };
}

function makeZone(overrides: Partial<{
  id: number;
  name: string;
  countries: string[];
  rates: ReturnType<typeof makeRate>[];
}> = {}) {
  return {
    id: 10,
    name: 'Domestic',
    countries: ['US', 'CA'],
    rates: [],
    ...overrides,
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  confirmMock.mockReset();
  // Default: return empty zones
  fetchMock.mockResolvedValue(makeRes({ success: true, data: [] }));
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('confirm', confirmMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Import after mocks
import ShippingSettingsPage from '@/app/portal/websites/[siteId]/store/shipping/page';

function renderPage() {
  return render(<ShippingSettingsPage />);
}

function findBtn(container: HTMLElement, text: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find((b) =>
    b.textContent?.includes(text),
  ) as HTMLButtonElement | undefined;
}

// ─── Loading state ───────────────────────────────────────────────────────────

describe('ShippingSettingsPage — loading state', () => {
  it('shows a spinner while data is fetching', () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const { container } = renderPage();
    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });

  it('hides spinner after data loads', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('.animate-spin')).toBeNull();
    });
  });
});

// ─── Empty state ──────────────────────────────────────────────────────────────

describe('ShippingSettingsPage — empty state', () => {
  it('shows no-zones empty state when data array is empty', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('No shipping zones');
    });
  });

  it('shows empty state description text', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Create a shipping zone to define rates');
    });
  });

  it('shows header even when zones are empty', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Shipping');
      expect(container.textContent).toContain('Manage shipping zones and rates');
    });
  });

  it('silently handles a failed fetch (does not crash)', async () => {
    fetchMock.mockRejectedValue(new Error('network'));
    const { container } = renderPage();
    await waitFor(() => {
      // After throw, loading is set to false; empty state renders
      expect(container.textContent).toContain('No shipping zones');
    });
  });

  it('treats data.success=false as empty zones', async () => {
    fetchMock.mockResolvedValue(makeRes({ success: false }));
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('No shipping zones');
    });
  });
});

// ─── Info banner ──────────────────────────────────────────────────────────────

describe('ShippingSettingsPage — info banner', () => {
  it('renders the EasyPost info banner', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Live carrier rates require EasyPost');
    });
  });

  it('info banner links to store settings with correct siteId', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const link = container.querySelector('a[href*="store/settings"]') as HTMLAnchorElement | null;
      expect(link).toBeTruthy();
      expect(link!.href).toContain('site-99');
    });
  });
});

// ─── Add Zone header button ───────────────────────────────────────────────────

describe('ShippingSettingsPage — add zone button', () => {
  it('clicking "Add Zone" button reveals zone form', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Shipping'));
    fireEvent.click(findBtn(container, 'Add Zone')!);
    await waitFor(() => {
      expect(container.textContent).toContain('New Shipping Zone');
    });
  });

  it('zone form shows after click', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Shipping'));
    fireEvent.click(findBtn(container, 'Add Zone')!);
    await waitFor(() => {
      expect(container.querySelector('form')).toBeTruthy();
      expect(container.textContent).toContain('Zone Name');
      expect(container.textContent).toContain('Countries');
    });
  });

  it('header button changes to "Cancel" when form is open', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Shipping'));
    fireEvent.click(findBtn(container, 'Add Zone')!);
    await waitFor(() => {
      expect(findBtn(container, 'Cancel')).toBeTruthy();
    });
  });

  it('clicking Cancel (header) closes zone form', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Shipping'));
    fireEvent.click(findBtn(container, 'Add Zone')!);
    await waitFor(() => expect(container.textContent).toContain('New Shipping Zone'));
    // Header button is now "Cancel" — click it
    const cancelBtns = Array.from(container.querySelectorAll('button')).filter((b) =>
      b.textContent?.includes('Cancel'),
    ) as HTMLButtonElement[];
    fireEvent.click(cancelBtns[0]);
    await waitFor(() => {
      expect(container.textContent).not.toContain('New Shipping Zone');
    });
  });
});

// ─── Zone Form — create ───────────────────────────────────────────────────────

describe('ShippingSettingsPage — zone form create', () => {
  it('zone name input updates correctly', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Shipping'));
    fireEvent.click(findBtn(container, 'Add Zone')!);
    await waitFor(() => expect(container.textContent).toContain('Zone Name'));
    const nameInput = container.querySelector(
      'input[placeholder="e.g. Domestic, International"]',
    ) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'International' } });
    expect(nameInput.value).toBe('International');
  });

  it('countries input updates correctly', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Shipping'));
    fireEvent.click(findBtn(container, 'Add Zone')!);
    await waitFor(() => expect(container.textContent).toContain('Countries'));
    const countriesInput = container.querySelector(
      'input[placeholder="US, CA, GB (comma separated)"]',
    ) as HTMLInputElement;
    fireEvent.change(countriesInput, { target: { value: 'US, CA' } });
    expect(countriesInput.value).toBe('US, CA');
  });

  it('submitting zone create calls POST /shipping', async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return makeRes({ success: true });
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Shipping'));
    fireEvent.click(findBtn(container, 'Add Zone')!);
    await waitFor(() => expect(container.textContent).toContain('Zone Name'));
    const nameInput = container.querySelector(
      'input[placeholder="e.g. Domestic, International"]',
    ) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Domestic' } });
    await act(async () => {
      fireEvent.submit(container.querySelector('form')!);
    });
    await waitFor(() => {
      expect(container.textContent).toContain('Zone created.');
      const postCalls = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');
      expect(postCalls.length).toBeGreaterThan(0);
    });
  });

  it('shows error message when zone create fails with message', async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return makeRes({ success: false, message: 'Zone name taken' });
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Shipping'));
    fireEvent.click(findBtn(container, 'Add Zone')!);
    await waitFor(() => expect(container.textContent).toContain('Zone Name'));
    const nameInput = container.querySelector(
      'input[placeholder="e.g. Domestic, International"]',
    ) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Test' } });
    await act(async () => {
      fireEvent.submit(container.querySelector('form')!);
    });
    await waitFor(() => {
      expect(container.textContent).toContain('Zone name taken');
    });
  });

  it('shows "Failed to save zone." when create fails without message', async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return makeRes({ success: false });
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Shipping'));
    fireEvent.click(findBtn(container, 'Add Zone')!);
    await waitFor(() => expect(container.textContent).toContain('Zone Name'));
    const nameInput = container.querySelector(
      'input[placeholder="e.g. Domestic, International"]',
    ) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Test' } });
    await act(async () => {
      fireEvent.submit(container.querySelector('form')!);
    });
    await waitFor(() => {
      expect(container.textContent).toContain('Failed to save zone.');
    });
  });

  it('shows "Something went wrong." when create throws', async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') throw new Error('network');
      return makeRes({ success: true, data: [] });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Shipping'));
    fireEvent.click(findBtn(container, 'Add Zone')!);
    await waitFor(() => expect(container.textContent).toContain('Zone Name'));
    const nameInput = container.querySelector(
      'input[placeholder="e.g. Domestic, International"]',
    ) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Test' } });
    await act(async () => {
      fireEvent.submit(container.querySelector('form')!);
    });
    await waitFor(() => {
      expect(container.textContent).toContain('Something went wrong.');
    });
  });

  it('Cancel button inside form closes the form', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Shipping'));
    fireEvent.click(findBtn(container, 'Add Zone')!);
    await waitFor(() => expect(container.textContent).toContain('Zone Name'));
    // The Cancel button inside the form
    const cancelBtn = Array.from(container.querySelectorAll('button[type="button"]')).find((b) =>
      b.textContent?.trim() === 'Cancel',
    ) as HTMLButtonElement | undefined;
    expect(cancelBtn).toBeTruthy();
    fireEvent.click(cancelBtn!);
    await waitFor(() => {
      expect(container.querySelector('form')).toBeNull();
    });
  });
});

// ─── Zones list ───────────────────────────────────────────────────────────────

describe('ShippingSettingsPage — zones list', () => {
  it('renders zone name and country list', async () => {
    fetchMock.mockResolvedValue(
      makeRes({ success: true, data: [makeZone({ countries: ['US', 'CA'], rates: [] })] }),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Domestic');
      expect(container.textContent).toContain('US, CA');
    });
  });

  it('shows "All countries" when countries array is empty', async () => {
    fetchMock.mockResolvedValue(
      makeRes({ success: true, data: [makeZone({ countries: [], rates: [] })] }),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('All countries');
    });
  });

  it('shows rate count with "rates" plural', async () => {
    fetchMock.mockResolvedValue(
      makeRes({
        success: true,
        data: [makeZone({ rates: [makeRate(), makeRate({ id: 2, name: 'Express' })] })],
      }),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('2 rates');
    });
  });

  it('shows "1 rate" singular when only one rate', async () => {
    fetchMock.mockResolvedValue(
      makeRes({ success: true, data: [makeZone({ rates: [makeRate()] })] }),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('1 rate');
    });
  });

  it('clicking zone header expands rate section', async () => {
    fetchMock.mockResolvedValue(
      makeRes({ success: true, data: [makeZone({ rates: [makeRate()] })] }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Domestic'));
    const zoneHeader = container.querySelector('[class*="cursor-pointer"]') as HTMLElement;
    fireEvent.click(zoneHeader);
    await waitFor(() => {
      expect(container.textContent).toContain('Add Rate');
    });
  });

  it('clicking zone header again collapses rate section', async () => {
    fetchMock.mockResolvedValue(
      makeRes({ success: true, data: [makeZone({ rates: [] })] }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Domestic'));
    const zoneHeader = container.querySelector('[class*="cursor-pointer"]') as HTMLElement;
    fireEvent.click(zoneHeader);
    await waitFor(() => expect(container.textContent).toContain('Add Rate'));
    fireEvent.click(zoneHeader);
    await waitFor(() => {
      expect(findBtn(container, 'Add Rate')).toBeUndefined();
    });
  });

  it('edit zone button opens zone form pre-filled', async () => {
    fetchMock.mockResolvedValue(
      makeRes({ success: true, data: [makeZone({ name: 'Domestic', countries: ['US'] })] }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Domestic'));
    const editBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.querySelector('.material-icons')?.textContent === 'edit',
    ) as HTMLButtonElement | undefined;
    expect(editBtn).toBeTruthy();
    fireEvent.click(editBtn!);
    await waitFor(() => {
      expect(container.textContent).toContain('Edit Zone');
      const nameInput = container.querySelector(
        'input[placeholder="e.g. Domestic, International"]',
      ) as HTMLInputElement;
      expect(nameInput.value).toBe('Domestic');
    });
  });

  it('edit zone submit calls PUT', async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') return makeRes({ success: true });
      return makeRes({ success: true, data: [makeZone()] });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Domestic'));
    const editBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.querySelector('.material-icons')?.textContent === 'edit',
    ) as HTMLButtonElement | undefined;
    fireEvent.click(editBtn!);
    await waitFor(() => expect(container.textContent).toContain('Edit Zone'));
    await act(async () => {
      fireEvent.submit(container.querySelector('form')!);
    });
    await waitFor(() => {
      expect(container.textContent).toContain('Zone updated.');
    });
  });
});

// ─── Delete zone ──────────────────────────────────────────────────────────────

describe('ShippingSettingsPage — delete zone', () => {
  it('delete zone sends DELETE request when confirmed', async () => {
    confirmMock.mockReturnValue(true);
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') return makeRes({ success: true });
      return makeRes({ success: true, data: [makeZone()] });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Domestic'));
    const deleteBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.querySelector('.material-icons')?.textContent === 'delete',
    ) as HTMLButtonElement | undefined;
    expect(deleteBtn).toBeTruthy();
    fireEvent.click(deleteBtn!);
    await waitFor(() => {
      expect(container.textContent).toContain('Zone deleted.');
    });
  });

  it('delete zone does nothing when user cancels confirm', async () => {
    confirmMock.mockReturnValue(false);
    fetchMock.mockResolvedValue(makeRes({ success: true, data: [makeZone()] }));
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Domestic'));
    const deleteBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.querySelector('.material-icons')?.textContent === 'delete',
    ) as HTMLButtonElement | undefined;
    fireEvent.click(deleteBtn!);
    // No DELETE call should happen
    const deleteCalls = fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE');
    expect(deleteCalls.length).toBe(0);
  });
});

// ─── Rate table display ───────────────────────────────────────────────────────

describe('ShippingSettingsPage — rate table', () => {
  it('renders manual rate row with formatted price', async () => {
    fetchMock.mockResolvedValue(
      makeRes({
        success: true,
        data: [makeZone({ rates: [makeRate({ price: 999, rateType: 'flat' })] })],
      }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Domestic'));
    const zoneHeader = container.querySelector('[class*="cursor-pointer"]') as HTMLElement;
    fireEvent.click(zoneHeader);
    await waitFor(() => {
      expect(container.textContent).toContain('$9.99');
      expect(container.textContent).toContain('Flat Rate');
    });
  });

  it('renders "Free" for free shipping rate type', async () => {
    fetchMock.mockResolvedValue(
      makeRes({
        success: true,
        data: [makeZone({ rates: [makeRate({ rateType: 'free', price: 0 })] })],
      }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Domestic'));
    const zoneHeader = container.querySelector('[class*="cursor-pointer"]') as HTMLElement;
    fireEvent.click(zoneHeader);
    await waitFor(() => {
      expect(container.textContent).toContain('Free Shipping');
      expect(container.textContent).toContain('Free');
    });
  });

  it('renders EasyPost live rate badge for liveRateOnly=true', async () => {
    fetchMock.mockResolvedValue(
      makeRes({
        success: true,
        data: [
          makeZone({
            rates: [
              makeRate({
                rateType: 'live',
                price: 0,
                liveRateOnly: true,
                provider: 'easypost',
                carrierCode: 'USPS',
                serviceCode: 'Priority',
              }),
            ],
          }),
        ],
      }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Domestic'));
    const zoneHeader = container.querySelector('[class*="cursor-pointer"]') as HTMLElement;
    fireEvent.click(zoneHeader);
    await waitFor(() => {
      expect(container.textContent).toContain('EasyPost');
      expect(container.textContent).toContain('LIVE');
      expect(container.textContent).toContain('USPS');
      expect(container.textContent).toContain('Priority');
    });
  });

  it('renders EasyPost badge when provider=easypost (even without liveRateOnly)', async () => {
    fetchMock.mockResolvedValue(
      makeRes({
        success: true,
        data: [
          makeZone({
            rates: [makeRate({ provider: 'easypost', liveRateOnly: false, rateType: 'live', price: 0 })],
          }),
        ],
      }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Domestic'));
    const zoneHeader = container.querySelector('[class*="cursor-pointer"]') as HTMLElement;
    fireEvent.click(zoneHeader);
    await waitFor(() => {
      expect(container.textContent).toContain('EasyPost');
    });
  });

  it('shows delivery days range when both min and max are set', async () => {
    fetchMock.mockResolvedValue(
      makeRes({
        success: true,
        data: [
          makeZone({
            rates: [makeRate({ minDeliveryDays: 3, maxDeliveryDays: 7 })],
          }),
        ],
      }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Domestic'));
    const zoneHeader = container.querySelector('[class*="cursor-pointer"]') as HTMLElement;
    fireEvent.click(zoneHeader);
    await waitFor(() => {
      expect(container.textContent).toContain('3-7 days');
    });
  });

  it('shows min+ days when only minDeliveryDays set', async () => {
    fetchMock.mockResolvedValue(
      makeRes({
        success: true,
        data: [
          makeZone({
            rates: [makeRate({ minDeliveryDays: 2, maxDeliveryDays: null })],
          }),
        ],
      }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Domestic'));
    const zoneHeader = container.querySelector('[class*="cursor-pointer"]') as HTMLElement;
    fireEvent.click(zoneHeader);
    await waitFor(() => {
      expect(container.textContent).toContain('2+ days');
    });
  });

  it('shows -- for delivery days when neither min nor max set', async () => {
    fetchMock.mockResolvedValue(
      makeRes({
        success: true,
        data: [makeZone({ rates: [makeRate()] })],
      }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Domestic'));
    const zoneHeader = container.querySelector('[class*="cursor-pointer"]') as HTMLElement;
    fireEvent.click(zoneHeader);
    await waitFor(() => {
      // "--" appears for delivery and freeAbove
      expect(container.textContent).toContain('--');
    });
  });

  it('shows freeAbove formatted amount for manual rates', async () => {
    fetchMock.mockResolvedValue(
      makeRes({
        success: true,
        data: [makeZone({ rates: [makeRate({ freeAbove: 5000 })] })],
      }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Domestic'));
    const zoneHeader = container.querySelector('[class*="cursor-pointer"]') as HTMLElement;
    fireEvent.click(zoneHeader);
    await waitFor(() => {
      expect(container.textContent).toContain('$50.00');
    });
  });

  it('shows -- for freeAbove on live rates', async () => {
    fetchMock.mockResolvedValue(
      makeRes({
        success: true,
        data: [
          makeZone({
            rates: [makeRate({ liveRateOnly: true, provider: 'easypost', rateType: 'live', price: 0, freeAbove: 5000 })],
          }),
        ],
      }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Domestic'));
    const zoneHeader = container.querySelector('[class*="cursor-pointer"]') as HTMLElement;
    fireEvent.click(zoneHeader);
    await waitFor(() => {
      // freeAbove is hidden for live rates — "--" shown instead
      expect(container.textContent).toContain('--');
    });
  });

  it('shows Any for carrier/service on live rates with no codes', async () => {
    fetchMock.mockResolvedValue(
      makeRes({
        success: true,
        data: [
          makeZone({
            rates: [makeRate({ liveRateOnly: true, provider: 'easypost', rateType: 'live', price: 0 })],
          }),
        ],
      }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Domestic'));
    const zoneHeader = container.querySelector('[class*="cursor-pointer"]') as HTMLElement;
    fireEvent.click(zoneHeader);
    await waitFor(() => {
      expect(container.textContent).toContain('Any');
    });
  });
});

// ─── Rate Form — create (manual) ─────────────────────────────────────────────

describe('ShippingSettingsPage — rate form create manual', () => {
  async function openRateForm(container: HTMLElement) {
    const zoneHeader = container.querySelector('[class*="cursor-pointer"]') as HTMLElement;
    fireEvent.click(zoneHeader);
    await waitFor(() => expect(findBtn(container, 'Add Rate')).toBeTruthy());
    fireEvent.click(findBtn(container, 'Add Rate')!);
    await waitFor(() => {
      expect(container.textContent).toContain('New Rate');
    });
  }

  beforeEach(() => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return makeRes({ success: true });
      if (init?.method === 'PUT') return makeRes({ success: true });
      if (init?.method === 'DELETE') return makeRes({ success: true });
      return makeRes({ success: true, data: [makeZone()] });
    });
  });

  it('rate form renders Name field', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Domestic'));
    await openRateForm(container);
    const nameInput = container.querySelector('input[placeholder="Standard, Express..."]') as HTMLInputElement;
    expect(nameInput).toBeTruthy();
  });

  it('rate form renders Type and Price fields for manual source', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Domestic'));
    await openRateForm(container);
    expect(container.textContent).toContain('Type');
    expect(container.textContent).toContain('Price ($)');
  });

  it('rate form name input updates', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Domestic'));
    await openRateForm(container);
    const nameInput = container.querySelector('input[placeholder="Standard, Express..."]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Express' } });
    expect(nameInput.value).toBe('Express');
  });

  it('rate source toggle switches to easypost', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Domestic'));
    await openRateForm(container);
    // Find the easypost radio label
    const labels = Array.from(container.querySelectorAll('label')) as HTMLLabelElement[];
    const easypostLabel = labels.find(
      (l) => l.textContent?.includes('Live carrier rates') && l.querySelector('input[type="radio"]'),
    );
    expect(easypostLabel).toBeTruthy();
    fireEvent.click(easypostLabel!);
    await waitFor(() => {
      expect(container.textContent).toContain('Carrier');
      expect(container.textContent).toContain('Service');
    });
  });

  it('rate source toggle back to manual shows manual fields', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Domestic'));
    await openRateForm(container);
    // Switch to easypost then back
    const labels = Array.from(container.querySelectorAll('label')) as HTMLLabelElement[];
    const easypostLabel = labels.find(
      (l) => l.textContent?.includes('Live carrier rates') && l.querySelector('input[type="radio"]'),
    );
    fireEvent.click(easypostLabel!);
    await waitFor(() => expect(container.textContent).toContain('Carrier'));
    const manualLabel = labels.find(
      (l) => l.textContent?.includes('Manual') && l.querySelector('input[value="manual"]'),
    );
    if (manualLabel) {
      fireEvent.click(manualLabel);
      await waitFor(() => {
        expect(container.textContent).toContain('Price ($)');
      });
    }
  });

  it('save rate calls POST and shows "Rate created."', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Domestic'));
    await openRateForm(container);
    const nameInput = container.querySelector('input[placeholder="Standard, Express..."]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Standard' } });
    await act(async () => {
      fireEvent.submit(container.querySelector('form[class*="p-4"]')!);
    });
    await waitFor(() => {
      expect(container.textContent).toContain('Rate created.');
    });
  });

  it('save rate shows error when POST fails with message', async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return makeRes({ success: false, message: 'Rate name required' });
      return makeRes({ success: true, data: [makeZone()] });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Domestic'));
    await openRateForm(container);
    await act(async () => {
      fireEvent.submit(container.querySelector('form[class*="p-4"]')!);
    });
    await waitFor(() => {
      expect(container.textContent).toContain('Rate name required');
    });
  });

  it('save rate shows "Failed to save rate." when POST fails without message', async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return makeRes({ success: false });
      return makeRes({ success: true, data: [makeZone()] });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Domestic'));
    await openRateForm(container);
    await act(async () => {
      fireEvent.submit(container.querySelector('form[class*="p-4"]')!);
    });
    await waitFor(() => {
      expect(container.textContent).toContain('Failed to save rate.');
    });
  });

  it('save rate shows "Something went wrong." when POST throws', async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') throw new Error('network');
      return makeRes({ success: true, data: [makeZone()] });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Domestic'));
    await openRateForm(container);
    await act(async () => {
      fireEvent.submit(container.querySelector('form[class*="p-4"]')!);
    });
    await waitFor(() => {
      expect(container.textContent).toContain('Something went wrong.');
    });
  });

  it('rate form Cancel button closes rate form', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Domestic'));
    await openRateForm(container);
    const cancelBtn = Array.from(container.querySelectorAll('button[type="button"]')).find(
      (b) => b.textContent?.trim() === 'Cancel',
    ) as HTMLButtonElement | undefined;
    expect(cancelBtn).toBeTruthy();
    fireEvent.click(cancelBtn!);
    await waitFor(() => {
      expect(container.textContent).not.toContain('New Rate');
    });
  });

  it('rate type select changes update state', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Domestic'));
    await openRateForm(container);
    // The rate type select is inside the form
    const selects = Array.from(container.querySelectorAll('select')) as HTMLSelectElement[];
    const rateTypeSelect = selects.find((s) =>
      Array.from(s.options).some((o) => o.value === 'weight_based'),
    );
    expect(rateTypeSelect).toBeTruthy();
    fireEvent.change(rateTypeSelect!, { target: { value: 'weight_based' } });
    expect(rateTypeSelect!.value).toBe('weight_based');
  });

  it('price input converts dollars to cents on change', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Domestic'));
    await openRateForm(container);
    const priceInput = container.querySelector('input[type="number"][step="0.01"][min="0"]') as HTMLInputElement;
    expect(priceInput).toBeTruthy();
    fireEvent.change(priceInput, { target: { value: '9.99' } });
    // dollarsToCents('9.99') = 999; centsToDollars(999) = '9.99'
    expect(priceInput.value).toBe('9.99');
  });

  it('min and max delivery day inputs update', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Domestic'));
    await openRateForm(container);
    const numberInputs = Array.from(
      container.querySelectorAll('input[type="number"]'),
    ) as HTMLInputElement[];
    // Min Days input has placeholder "e.g. 3"
    const minInput = container.querySelector('input[placeholder="e.g. 3"]') as HTMLInputElement;
    expect(minInput).toBeTruthy();
    fireEvent.change(minInput, { target: { value: '2' } });
    expect(minInput.value).toBe('2');

    const maxInput = container.querySelector('input[placeholder="e.g. 7"]') as HTMLInputElement;
    expect(maxInput).toBeTruthy();
    fireEvent.change(maxInput, { target: { value: '5' } });
    expect(maxInput.value).toBe('5');

    // Suppress unused-variable warning
    void numberInputs;
  });
});

// ─── Rate Form — create (easypost) ───────────────────────────────────────────

describe('ShippingSettingsPage — rate form easypost', () => {
  async function openRateFormEasypost(container: HTMLElement) {
    const zoneHeader = container.querySelector('[class*="cursor-pointer"]') as HTMLElement;
    fireEvent.click(zoneHeader);
    await waitFor(() => expect(findBtn(container, 'Add Rate')).toBeTruthy());
    fireEvent.click(findBtn(container, 'Add Rate')!);
    await waitFor(() => expect(container.textContent).toContain('New Rate'));
    const labels = Array.from(container.querySelectorAll('label')) as HTMLLabelElement[];
    const easypostLabel = labels.find(
      (l) => l.textContent?.includes('Live carrier rates') && l.querySelector('input[type="radio"]'),
    );
    fireEvent.click(easypostLabel!);
    await waitFor(() => expect(container.textContent).toContain('Carrier'));
  }

  beforeEach(() => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return makeRes({ success: true });
      return makeRes({ success: true, data: [makeZone()] });
    });
  });

  it('easypost form shows Carrier select with options', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Domestic'));
    await openRateFormEasypost(container);
    const carrierSelect = Array.from(container.querySelectorAll('select')).find((s) =>
      Array.from(s.options).some((o) => o.value === 'USPS'),
    ) as HTMLSelectElement | undefined;
    expect(carrierSelect).toBeTruthy();
    expect(carrierSelect!.textContent).toContain('USPS');
    expect(carrierSelect!.textContent).toContain('UPS');
    expect(carrierSelect!.textContent).toContain('FedEx');
    expect(carrierSelect!.textContent).toContain('DHL Express');
  });

  it('easypost form service input updates', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Domestic'));
    await openRateFormEasypost(container);
    const serviceInput = container.querySelector(
      'input[placeholder="Leave blank to allow all services from this carrier"]',
    ) as HTMLInputElement;
    expect(serviceInput).toBeTruthy();
    fireEvent.change(serviceInput, { target: { value: 'Priority' } });
    expect(serviceInput.value).toBe('Priority');
  });

  it('easypost save rate calls POST with provider=easypost', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        capturedBody = JSON.parse(init.body as string) as Record<string, unknown>;
        return makeRes({ success: true });
      }
      return makeRes({ success: true, data: [makeZone()] });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Domestic'));
    await openRateFormEasypost(container);
    const nameInput = container.querySelector(
      'input[placeholder="Live carrier rate"]',
    ) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Carrier Rate' } });
    await act(async () => {
      fireEvent.submit(container.querySelector('form[class*="p-4"]')!);
    });
    await waitFor(() => {
      expect(capturedBody).not.toBeNull();
      expect(capturedBody!.provider).toBe('easypost');
      expect(capturedBody!.liveRateOnly).toBe(true);
      expect(capturedBody!.rateType).toBe('live');
    });
  });

  it('easypost carrier select updates on change', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Domestic'));
    await openRateFormEasypost(container);
    const carrierSelect = Array.from(container.querySelectorAll('select')).find((s) =>
      Array.from(s.options).some((o) => o.value === 'USPS'),
    ) as HTMLSelectElement;
    fireEvent.change(carrierSelect, { target: { value: 'USPS' } });
    expect(carrierSelect.value).toBe('USPS');
  });
});

// ─── Rate Form — edit ─────────────────────────────────────────────────────────

describe('ShippingSettingsPage — rate form edit', () => {
  it('edit rate button pre-fills form for manual rate', async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') return makeRes({ success: true });
      return makeRes({
        success: true,
        data: [
          makeZone({
            rates: [makeRate({ id: 5, name: 'Ground', rateType: 'flat', price: 799 })],
          }),
        ],
      });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Domestic'));
    // Expand zone
    const zoneHeader = container.querySelector('[class*="cursor-pointer"]') as HTMLElement;
    fireEvent.click(zoneHeader);
    await waitFor(() => expect(container.textContent).toContain('Ground'));
    // Click edit on the rate row
    const editBtns = Array.from(container.querySelectorAll('button')).filter(
      (b) => b.querySelector('.material-icons')?.textContent === 'edit',
    ) as HTMLButtonElement[];
    // Rate edit button (second edit button after zone edit)
    const rateEditBtn = editBtns[editBtns.length - 1];
    fireEvent.click(rateEditBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Edit Rate');
      const nameInput = container.querySelector('input[placeholder="Standard, Express..."]') as HTMLInputElement;
      expect(nameInput.value).toBe('Ground');
    });
  });

  it('edit rate for easypost rate pre-fills with easypost source', async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') return makeRes({ success: true });
      return makeRes({
        success: true,
        data: [
          makeZone({
            rates: [
              makeRate({
                id: 6,
                name: 'Live Rate',
                rateType: 'live',
                price: 0,
                liveRateOnly: true,
                provider: 'easypost',
                carrierCode: 'USPS',
                serviceCode: 'Priority',
              }),
            ],
          }),
        ],
      });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Domestic'));
    const zoneHeader = container.querySelector('[class*="cursor-pointer"]') as HTMLElement;
    fireEvent.click(zoneHeader);
    await waitFor(() => expect(container.textContent).toContain('Live Rate'));
    const editBtns = Array.from(container.querySelectorAll('button')).filter(
      (b) => b.querySelector('.material-icons')?.textContent === 'edit',
    ) as HTMLButtonElement[];
    fireEvent.click(editBtns[editBtns.length - 1]);
    await waitFor(() => {
      // easypost source should be selected — Carrier field visible
      expect(container.textContent).toContain('Carrier');
      expect(container.textContent).toContain('Service');
    });
  });

  it('edit rate submit calls PUT with rate id in URL', async () => {
    let capturedUrl = '';
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') { capturedUrl = url; return makeRes({ success: true }); }
      return makeRes({
        success: true,
        data: [makeZone({ rates: [makeRate({ id: 7 })] })],
      });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Domestic'));
    const zoneHeader = container.querySelector('[class*="cursor-pointer"]') as HTMLElement;
    fireEvent.click(zoneHeader);
    await waitFor(() => expect(container.textContent).toContain('Standard'));
    const editBtns = Array.from(container.querySelectorAll('button')).filter(
      (b) => b.querySelector('.material-icons')?.textContent === 'edit',
    ) as HTMLButtonElement[];
    fireEvent.click(editBtns[editBtns.length - 1]);
    await waitFor(() => expect(container.textContent).toContain('Edit Rate'));
    await act(async () => {
      fireEvent.submit(container.querySelector('form[class*="p-4"]')!);
    });
    await waitFor(() => {
      expect(container.textContent).toContain('Rate updated.');
      expect(capturedUrl).toContain('/rates/7');
    });
  });
});

// ─── Delete rate ──────────────────────────────────────────────────────────────

describe('ShippingSettingsPage — delete rate', () => {
  it('delete rate sends DELETE when confirmed', async () => {
    confirmMock.mockReturnValue(true);
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') return makeRes({ success: true });
      return makeRes({
        success: true,
        data: [makeZone({ rates: [makeRate({ id: 3 })] })],
      });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Domestic'));
    const zoneHeader = container.querySelector('[class*="cursor-pointer"]') as HTMLElement;
    fireEvent.click(zoneHeader);
    await waitFor(() => expect(container.textContent).toContain('Standard'));
    const deleteBtns = Array.from(container.querySelectorAll('button')).filter(
      (b) => b.querySelector('.material-icons')?.textContent === 'delete',
    ) as HTMLButtonElement[];
    // Rate delete button (last delete button)
    fireEvent.click(deleteBtns[deleteBtns.length - 1]);
    await waitFor(() => {
      expect(container.textContent).toContain('Rate deleted.');
    });
  });

  it('delete rate does nothing when user cancels confirm', async () => {
    confirmMock.mockReturnValue(false);
    fetchMock.mockResolvedValue(
      makeRes({ success: true, data: [makeZone({ rates: [makeRate({ id: 4 })] })] }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Domestic'));
    const zoneHeader = container.querySelector('[class*="cursor-pointer"]') as HTMLElement;
    fireEvent.click(zoneHeader);
    await waitFor(() => expect(container.textContent).toContain('Standard'));
    const initialDeleteCallCount = fetchMock.mock.calls.filter(
      ([, init]) => init?.method === 'DELETE',
    ).length;
    const deleteBtns = Array.from(container.querySelectorAll('button')).filter(
      (b) => b.querySelector('.material-icons')?.textContent === 'delete',
    ) as HTMLButtonElement[];
    fireEvent.click(deleteBtns[deleteBtns.length - 1]);
    const afterDeleteCallCount = fetchMock.mock.calls.filter(
      ([, init]) => init?.method === 'DELETE',
    ).length;
    expect(afterDeleteCallCount).toBe(initialDeleteCallCount);
  });
});

// ─── rateTypeLabels coverage ──────────────────────────────────────────────────

describe('ShippingSettingsPage — rateTypeLabels all values', () => {
  const rateTypes = [
    { type: 'flat', label: 'Flat Rate' },
    { type: 'weight_based', label: 'Weight Based' },
    { type: 'price_based', label: 'Price Based' },
    { type: 'free', label: 'Free Shipping' },
  ] as const;

  rateTypes.forEach(({ type, label }) => {
    it(`displays label "${label}" for rateType "${type}"`, async () => {
      fetchMock.mockResolvedValue(
        makeRes({
          success: true,
          data: [makeZone({ rates: [makeRate({ rateType: type, price: type === 'free' ? 0 : 500 })] })],
        }),
      );
      const { container } = renderPage();
      await waitFor(() => expect(container.textContent).toContain('Domestic'));
      const zoneHeader = container.querySelector('[class*="cursor-pointer"]') as HTMLElement;
      fireEvent.click(zoneHeader);
      await waitFor(() => {
        expect(container.textContent).toContain(label);
      });
    });
  });

  it('falls back to raw rateType when unknown', async () => {
    fetchMock.mockResolvedValue(
      makeRes({
        success: true,
        data: [makeZone({ rates: [makeRate({ rateType: 'custom_type' })] })],
      }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Domestic'));
    const zoneHeader = container.querySelector('[class*="cursor-pointer"]') as HTMLElement;
    fireEvent.click(zoneHeader);
    await waitFor(() => {
      expect(container.textContent).toContain('custom_type');
    });
  });
});
