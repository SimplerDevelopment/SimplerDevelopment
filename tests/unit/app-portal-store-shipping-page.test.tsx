// @vitest-environment jsdom
/**
 * Unit tests for `app/portal/websites/[siteId]/store/shipping/page.tsx`
 *
 * The page is a 'use client' component that:
 *  - loads shipping zones+rates via fetch on mount
 *  - renders empty state, loading spinner, zone list
 *  - creates / edits / deletes shipping zones (form open/save/cancel)
 *  - creates / edits / deletes shipping rates per zone (manual + easypost)
 *  - shows success / error banners
 *  - handles fetch failures gracefully
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, act } from '@testing-library/react';

// ─── Mocks (must precede page import) ────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useParams: () => ({ siteId: 'site-42' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/portal/websites/site-42/store/shipping',
}));

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string; [key: string]: unknown }) =>
    React.createElement('a', { href, ...rest }, children),
}));

// ─── Types & helpers ──────────────────────────────────────────────────────────

interface ShippingRate {
  id?: number;
  name: string;
  rateType: string;
  price: number;
  minDeliveryDays?: number | null;
  maxDeliveryDays?: number | null;
  freeAbove?: number | null;
  provider?: 'manual' | 'easypost';
  carrierCode?: string | null;
  serviceCode?: string | null;
  liveRateOnly?: boolean;
}

interface ShippingZone {
  id: number;
  name: string;
  countries: string[];
  rates: ShippingRate[];
}

type FetchResp = { ok: boolean; json: () => Promise<unknown> };

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<FetchResp>>();

function makeRes(body: unknown, ok = true): FetchResp {
  return { ok, json: async () => body };
}

function makeZone(overrides: Partial<ShippingZone> = {}): ShippingZone {
  return {
    id: 1,
    name: 'Domestic',
    countries: ['US'],
    rates: [],
    ...overrides,
  };
}

function makeRate(overrides: Partial<ShippingRate> = {}): ShippingRate {
  return {
    id: 10,
    name: 'Standard',
    rateType: 'flat',
    price: 599,
    minDeliveryDays: 3,
    maxDeliveryDays: 7,
    freeAbove: null,
    provider: 'manual',
    carrierCode: null,
    serviceCode: null,
    liveRateOnly: false,
    ...overrides,
  };
}

function defaultFetch(url: string, init?: RequestInit): FetchResp {
  const method = init?.method?.toUpperCase() || 'GET';
  if (method === 'GET') {
    return makeRes({ success: true, data: [] });
  }
  return makeRes({ success: true, data: { id: 99 } });
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => defaultFetch(url, init));
  vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
  vi.stubGlobal('confirm', vi.fn(() => true));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ─── Import after mocks ───────────────────────────────────────────────────────

import ShippingSettingsPage from '@/app/portal/websites/[siteId]/store/shipping/page';

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

function renderPage() {
  return render(<ShippingSettingsPage />);
}

// ─── Loading state ────────────────────────────────────────────────────────────

describe('ShippingSettingsPage — loading state', () => {
  it('shows loading spinner while fetch is pending', () => {
    let resolveFetch!: (v: FetchResp) => void;
    const pending = new Promise<FetchResp>((res) => { resolveFetch = res; });
    fetchMock.mockImplementation(async () => pending);
    const { container } = renderPage();
    expect(container.querySelector('.animate-spin')).toBeTruthy();
    resolveFetch(makeRes({ success: true, data: [] }));
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
  it('renders Shipping heading', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Shipping');
    });
  });

  it('renders info banner about EasyPost', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Live carrier rates');
    });
  });

  it('renders empty state when no zones', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('No shipping zones');
    });
  });

  it('renders Add Zone button', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Add Zone');
    });
  });

  it('links to Store Settings for EasyPost', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const link = container.querySelector('a[href*="store/settings"]');
      expect(link).not.toBeNull();
    });
  });
});

// ─── Zone list ────────────────────────────────────────────────────────────────

describe('ShippingSettingsPage — zone list', () => {
  it('renders zone names when zones exist', async () => {
    fetchMock.mockImplementation(async () =>
      makeRes({ success: true, data: [makeZone({ name: 'International' })] }),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('International');
    });
  });

  it('shows all countries when countries array is set', async () => {
    fetchMock.mockImplementation(async () =>
      makeRes({ success: true, data: [makeZone({ countries: ['US', 'CA'] })] }),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('US');
      expect(container.textContent).toContain('CA');
    });
  });

  it('shows "All countries" when countries array is empty', async () => {
    fetchMock.mockImplementation(async () =>
      makeRes({ success: true, data: [makeZone({ countries: [] })] }),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('All countries');
    });
  });

  it('shows rate count label for zero rates', async () => {
    fetchMock.mockImplementation(async () =>
      makeRes({ success: true, data: [makeZone({ rates: [] })] }),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('0 rates');
    });
  });

  it('shows singular "rate" label for one rate', async () => {
    fetchMock.mockImplementation(async () =>
      makeRes({ success: true, data: [makeZone({ rates: [makeRate()] })] }),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('1 rate');
    });
  });

  it('shows plural "rates" label for multiple rates', async () => {
    fetchMock.mockImplementation(async () =>
      makeRes({ success: true, data: [makeZone({ rates: [makeRate({ id: 1 }), makeRate({ id: 2 })] })] }),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('2 rates');
    });
  });
});

// ─── Zone expand / collapse ───────────────────────────────────────────────────

describe('ShippingSettingsPage — zone expand/collapse', () => {
  it('clicking zone header expands it to show Add Rate button', async () => {
    fetchMock.mockImplementation(async () =>
      makeRes({ success: true, data: [makeZone()] }),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Domestic');
    });
    // Click zone header
    const header = container.querySelector('[class*="cursor-pointer"]') as HTMLElement;
    fireEvent.click(header);
    await flush();
    expect(container.textContent).toContain('Add Rate');
  });

  it('clicking zone header again collapses it', async () => {
    fetchMock.mockImplementation(async () =>
      makeRes({ success: true, data: [makeZone()] }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Domestic'));
    const header = container.querySelector('[class*="cursor-pointer"]') as HTMLElement;
    fireEvent.click(header);
    await flush();
    expect(container.textContent).toContain('Add Rate');
    fireEvent.click(header);
    await flush();
    expect(container.textContent).not.toContain('Add Rate');
  });

  it('expanded zone with rates renders rate table headers', async () => {
    fetchMock.mockImplementation(async () =>
      makeRes({ success: true, data: [makeZone({ rates: [makeRate()] })] }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Domestic'));
    const header = container.querySelector('[class*="cursor-pointer"]') as HTMLElement;
    fireEvent.click(header);
    await flush();
    expect(container.textContent).toContain('Name');
    expect(container.textContent).toContain('Source');
    expect(container.textContent).toContain('Type');
    expect(container.textContent).toContain('Price');
  });
});

// ─── Zone form — create ───────────────────────────────────────────────────────

describe('ShippingSettingsPage — create zone form', () => {
  it('clicking Add Zone opens the zone form', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Add Zone'));
    const btn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Add Zone'),
    ) as HTMLElement;
    fireEvent.click(btn);
    await flush();
    expect(container.textContent).toContain('New Shipping Zone');
  });

  it('Cancel button on zone form hides the form', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Add Zone'));
    const addBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Add Zone'),
    ) as HTMLElement;
    fireEvent.click(addBtn);
    await flush();
    const cancelBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Cancel',
    ) as HTMLElement;
    fireEvent.click(cancelBtn);
    await flush();
    expect(container.textContent).not.toContain('New Shipping Zone');
  });

  it('Add Zone button becomes Cancel when form is open', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Add Zone'));
    const btn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Add Zone'),
    ) as HTMLElement;
    fireEvent.click(btn);
    await flush();
    // The header button now shows Cancel
    expect(btn.textContent).toContain('Cancel');
  });

  it('saves a new zone and shows success banner', async () => {
    // First GET returns empty; POST returns success; second GET returns zone
    let callCount = 0;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method?.toUpperCase() || 'GET';
      if (method === 'GET') {
        callCount++;
        if (callCount === 1) return makeRes({ success: true, data: [] });
        return makeRes({ success: true, data: [makeZone({ name: 'Domestic' })] });
      }
      if (method === 'POST') return makeRes({ success: true, data: { id: 1 } });
      return makeRes({ success: true });
    });

    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Add Zone'));

    const addBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Add Zone'),
    ) as HTMLElement;
    fireEvent.click(addBtn);
    await flush();

    const nameInput = container.querySelector('input[placeholder*="Domestic"]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Domestic' } });

    const form = container.querySelector('form') as HTMLFormElement;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(container.textContent).toContain('Zone created.');
    });
  });

  it('shows error banner when zone save fails', async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      const method = init?.method?.toUpperCase() || 'GET';
      if (method === 'GET') return makeRes({ success: true, data: [] });
      return makeRes({ success: false, message: 'Zone name taken.' });
    });

    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Add Zone'));

    const addBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Add Zone'),
    ) as HTMLElement;
    fireEvent.click(addBtn);
    await flush();

    const nameInput = container.querySelector('input[placeholder*="Domestic"]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Test' } });

    const form = container.querySelector('form') as HTMLFormElement;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(container.textContent).toContain('Zone name taken.');
    });
  });

  it('shows generic error when zone save throws', async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      const method = init?.method?.toUpperCase() || 'GET';
      if (method === 'GET') return makeRes({ success: true, data: [] });
      throw new Error('network');
    });

    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Add Zone'));

    const addBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Add Zone'),
    ) as HTMLElement;
    fireEvent.click(addBtn);
    await flush();

    const nameInput = container.querySelector('input[placeholder*="Domestic"]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Test' } });

    const form = container.querySelector('form') as HTMLFormElement;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(container.textContent).toContain('Something went wrong.');
    });
  });
});

// ─── Zone form — edit ─────────────────────────────────────────────────────────

describe('ShippingSettingsPage — edit zone form', () => {
  it('clicking edit zone button opens form pre-populated', async () => {
    fetchMock.mockImplementation(async () =>
      makeRes({ success: true, data: [makeZone({ name: 'Europe', countries: ['DE', 'FR'] })] }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Europe'));

    const editButtons = container.querySelectorAll('button[class*="p-1.5"]');
    // First edit button (zone-level)
    fireEvent.click(editButtons[0]);
    await flush();

    expect(container.textContent).toContain('Edit Zone');
    const nameInput = container.querySelector('input[placeholder*="Domestic"]') as HTMLInputElement;
    expect(nameInput.value).toBe('Europe');
  });

  it('saves zone edit and shows Zone updated. banner', async () => {
    let getCount = 0;
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      const method = init?.method?.toUpperCase() || 'GET';
      if (method === 'GET') {
        getCount++;
        if (getCount === 1) return makeRes({ success: true, data: [makeZone({ name: 'Europe' })] });
        return makeRes({ success: true, data: [makeZone({ name: 'Updated Europe' })] });
      }
      if (method === 'PUT') return makeRes({ success: true });
      return makeRes({ success: true });
    });

    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Europe'));

    const editButtons = container.querySelectorAll('button[class*="p-1.5"]');
    fireEvent.click(editButtons[0]);
    await flush();

    const nameInput = container.querySelector('input[placeholder*="Domestic"]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Updated Europe' } });

    const form = container.querySelector('form') as HTMLFormElement;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(container.textContent).toContain('Zone updated.');
    });
  });
});

// ─── Zone delete ──────────────────────────────────────────────────────────────

describe('ShippingSettingsPage — delete zone', () => {
  it('confirm delete calls DELETE and shows Zone deleted.', async () => {
    let getCount = 0;
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      const method = init?.method?.toUpperCase() || 'GET';
      if (method === 'GET') {
        getCount++;
        if (getCount === 1) return makeRes({ success: true, data: [makeZone()] });
        return makeRes({ success: true, data: [] });
      }
      if (method === 'DELETE') return makeRes({ success: true });
      return makeRes({ success: true });
    });

    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Domestic'));

    // Second p-1.5 button is delete (after edit)
    const zoneButtons = container.querySelectorAll('button[class*="p-1.5"]');
    fireEvent.click(zoneButtons[1]);
    await flush();

    await waitFor(() => {
      expect(container.textContent).toContain('Zone deleted.');
    });

    const deleteCall = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit)?.method === 'DELETE',
    );
    expect(deleteCall).toBeTruthy();
  });

  it('cancelled confirm does NOT call DELETE', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false));
    fetchMock.mockImplementation(async () =>
      makeRes({ success: true, data: [makeZone()] }),
    );

    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Domestic'));

    const zoneButtons = container.querySelectorAll('button[class*="p-1.5"]');
    fireEvent.click(zoneButtons[1]);
    await flush();

    const deleteCall = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit)?.method === 'DELETE',
    );
    expect(deleteCall).toBeUndefined();
  });
});

// ─── Rate form — create (manual) ─────────────────────────────────────────────

describe('ShippingSettingsPage — create manual rate', () => {
  async function openRateForm(container: HTMLElement) {
    await waitFor(() => expect(container.textContent).toContain('Domestic'));
    // Expand zone
    const header = container.querySelector('[class*="cursor-pointer"]') as HTMLElement;
    fireEvent.click(header);
    await flush();
    // Click "Add Rate"
    const addRateBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Add Rate'),
    ) as HTMLElement;
    fireEvent.click(addRateBtn);
    await flush();
  }

  it('clicking Add Rate opens rate form', async () => {
    fetchMock.mockImplementation(async () =>
      makeRes({ success: true, data: [makeZone()] }),
    );
    const { container } = renderPage();
    await openRateForm(container);
    expect(container.textContent).toContain('New Rate');
  });

  it('manual mode is selected by default', async () => {
    fetchMock.mockImplementation(async () =>
      makeRes({ success: true, data: [makeZone()] }),
    );
    const { container } = renderPage();
    await openRateForm(container);
    const manualRadio = container.querySelector('input[value="manual"]') as HTMLInputElement;
    expect(manualRadio.checked).toBe(true);
  });

  it('manual mode shows Type and Price fields', async () => {
    fetchMock.mockImplementation(async () =>
      makeRes({ success: true, data: [makeZone()] }),
    );
    const { container } = renderPage();
    await openRateForm(container);
    expect(container.textContent).toContain('Flat Rate');
    expect(container.textContent).toContain('Price ($)');
  });

  it('saves a new manual rate and shows Rate created. banner', async () => {
    let getCount = 0;
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      const method = init?.method?.toUpperCase() || 'GET';
      if (method === 'GET') {
        getCount++;
        if (getCount === 1) return makeRes({ success: true, data: [makeZone()] });
        return makeRes({ success: true, data: [makeZone({ rates: [makeRate()] })] });
      }
      if (method === 'POST') return makeRes({ success: true, data: { id: 10 } });
      return makeRes({ success: true });
    });

    const { container } = renderPage();
    await openRateForm(container);

    const nameInput = container.querySelector('input[placeholder*="Standard"]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Standard Shipping' } });

    const form = container.querySelector('form') as HTMLFormElement;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(container.textContent).toContain('Rate created.');
    });
  });

  it('shows error when rate save returns failure message', async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      const method = init?.method?.toUpperCase() || 'GET';
      if (method === 'GET') return makeRes({ success: true, data: [makeZone()] });
      return makeRes({ success: false, message: 'Duplicate rate name.' });
    });

    const { container } = renderPage();
    await openRateForm(container);

    const nameInput = container.querySelector('input[placeholder*="Standard"]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Express' } });

    const form = container.querySelector('form') as HTMLFormElement;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(container.textContent).toContain('Duplicate rate name.');
    });
  });

  it('shows generic error when rate save throws', async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      const method = init?.method?.toUpperCase() || 'GET';
      if (method === 'GET') return makeRes({ success: true, data: [makeZone()] });
      throw new Error('network');
    });

    const { container } = renderPage();
    await openRateForm(container);

    const nameInput = container.querySelector('input[placeholder*="Standard"]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Express' } });

    const form = container.querySelector('form') as HTMLFormElement;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(container.textContent).toContain('Something went wrong.');
    });
  });

  it('Cancel button on rate form closes the form', async () => {
    fetchMock.mockImplementation(async () =>
      makeRes({ success: true, data: [makeZone()] }),
    );
    const { container } = renderPage();
    await openRateForm(container);

    const cancelBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Cancel',
    ) as HTMLElement;
    fireEvent.click(cancelBtn);
    await flush();

    expect(container.textContent).not.toContain('New Rate');
  });

  it('free shipping type disables price input', async () => {
    fetchMock.mockImplementation(async () =>
      makeRes({ success: true, data: [makeZone()] }),
    );
    const { container } = renderPage();
    await openRateForm(container);

    const typeSelect = container.querySelector('select') as HTMLSelectElement;
    fireEvent.change(typeSelect, { target: { value: 'free' } });
    await flush();

    const priceInput = container.querySelector('input[type="number"][min="0"][step="0.01"]') as HTMLInputElement;
    expect(priceInput.disabled).toBe(true);
  });
});

// ─── Rate form — EasyPost (live) mode ────────────────────────────────────────

describe('ShippingSettingsPage — create live carrier rate', () => {
  async function openRateFormLive(container: HTMLElement) {
    await waitFor(() => expect(container.textContent).toContain('Domestic'));
    const header = container.querySelector('[class*="cursor-pointer"]') as HTMLElement;
    fireEvent.click(header);
    await flush();
    const addRateBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Add Rate'),
    ) as HTMLElement;
    fireEvent.click(addRateBtn);
    await flush();
    // Switch to EasyPost mode
    const easypostRadio = container.querySelector('input[value="easypost"]') as HTMLInputElement;
    fireEvent.click(easypostRadio);
    await flush();
  }

  it('switching to EasyPost shows Carrier and Service fields', async () => {
    fetchMock.mockImplementation(async () =>
      makeRes({ success: true, data: [makeZone()] }),
    );
    const { container } = renderPage();
    await openRateFormLive(container);
    expect(container.textContent).toContain('Carrier');
    expect(container.textContent).toContain('Service');
  });

  it('EasyPost mode hides manual Type / Price / Free Above fields', async () => {
    fetchMock.mockImplementation(async () =>
      makeRes({ success: true, data: [makeZone()] }),
    );
    const { container } = renderPage();
    await openRateFormLive(container);
    expect(container.textContent).not.toContain('Flat Rate');
    expect(container.textContent).not.toContain('Price ($)');
    expect(container.textContent).not.toContain('Free Above ($)');
  });

  it('EasyPost form sends liveRateOnly=true in POST body', async () => {
    let postedBody: unknown;
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      const method = init?.method?.toUpperCase() || 'GET';
      if (method === 'GET') return makeRes({ success: true, data: [makeZone()] });
      if (method === 'POST') {
        postedBody = JSON.parse(init?.body as string);
        return makeRes({ success: true, data: { id: 11 } });
      }
      return makeRes({ success: true });
    });

    const { container } = renderPage();
    await openRateFormLive(container);

    const nameInput = container.querySelector('input[placeholder*="Live carrier"]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'UPS Live' } });

    const form = container.querySelector('form') as HTMLFormElement;
    fireEvent.submit(form);

    await waitFor(() => {
      expect((postedBody as Record<string, unknown>)?.liveRateOnly).toBe(true);
      expect((postedBody as Record<string, unknown>)?.provider).toBe('easypost');
    });
  });

  it('shows Rate created. after successful live rate save', async () => {
    let getCount = 0;
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      const method = init?.method?.toUpperCase() || 'GET';
      if (method === 'GET') {
        getCount++;
        if (getCount === 1) return makeRes({ success: true, data: [makeZone()] });
        return makeRes({ success: true, data: [makeZone({ rates: [makeRate({ liveRateOnly: true })] })] });
      }
      return makeRes({ success: true, data: { id: 11 } });
    });

    const { container } = renderPage();
    await openRateFormLive(container);

    const nameInput = container.querySelector('input[placeholder*="Live carrier"]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'USPS Priority' } });

    const form = container.querySelector('form') as HTMLFormElement;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(container.textContent).toContain('Rate created.');
    });
  });
});

// ─── Rate form — edit ─────────────────────────────────────────────────────────

describe('ShippingSettingsPage — edit rate', () => {
  it('clicking edit rate opens form pre-populated with rate name', async () => {
    fetchMock.mockImplementation(async () =>
      makeRes({ success: true, data: [makeZone({ rates: [makeRate({ name: 'Express' })] })] }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Domestic'));

    const header = container.querySelector('[class*="cursor-pointer"]') as HTMLElement;
    fireEvent.click(header);
    await flush();

    // Edit button in rate row (p-1 buttons inside expanded area)
    const editRateBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.querySelector('span.material-icons')?.textContent === 'edit' &&
             !b.className.includes('p-1.5'),
    ) as HTMLElement;
    fireEvent.click(editRateBtn);
    await flush();

    expect(container.textContent).toContain('Edit Rate');
    const nameInput = container.querySelector('input[placeholder*="Standard"]') as HTMLInputElement;
    expect(nameInput.value).toBe('Express');
  });

  it('saves rate edit and shows Rate updated. banner', async () => {
    let getCount = 0;
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      const method = init?.method?.toUpperCase() || 'GET';
      if (method === 'GET') {
        getCount++;
        return makeRes({ success: true, data: [makeZone({ rates: [makeRate({ name: 'Express' })] })] });
      }
      if (method === 'PUT') return makeRes({ success: true });
      return makeRes({ success: true });
    });

    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Domestic'));

    const header = container.querySelector('[class*="cursor-pointer"]') as HTMLElement;
    fireEvent.click(header);
    await flush();

    const editRateBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.querySelector('span.material-icons')?.textContent === 'edit' &&
             !b.className.includes('p-1.5'),
    ) as HTMLElement;
    fireEvent.click(editRateBtn);
    await flush();

    const form = container.querySelector('form') as HTMLFormElement;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(container.textContent).toContain('Rate updated.');
    });
  });

  it('opening edit for EasyPost rate sets source to easypost', async () => {
    const liveRate = makeRate({ liveRateOnly: true, provider: 'easypost', rateType: 'live', price: 0 });
    fetchMock.mockImplementation(async () =>
      makeRes({ success: true, data: [makeZone({ rates: [liveRate] })] }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Domestic'));

    const header = container.querySelector('[class*="cursor-pointer"]') as HTMLElement;
    fireEvent.click(header);
    await flush();

    const editRateBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.querySelector('span.material-icons')?.textContent === 'edit' &&
             !b.className.includes('p-1.5'),
    ) as HTMLElement;
    fireEvent.click(editRateBtn);
    await flush();

    const easypostRadio = container.querySelector('input[value="easypost"]') as HTMLInputElement;
    expect(easypostRadio.checked).toBe(true);
  });
});

// ─── Rate delete ──────────────────────────────────────────────────────────────

describe('ShippingSettingsPage — delete rate', () => {
  it('confirming delete calls DELETE /rates/:id and shows Rate deleted.', async () => {
    let getCount = 0;
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      const method = init?.method?.toUpperCase() || 'GET';
      if (method === 'GET') {
        getCount++;
        if (getCount === 1) return makeRes({ success: true, data: [makeZone({ rates: [makeRate()] })] });
        return makeRes({ success: true, data: [makeZone({ rates: [] })] });
      }
      if (method === 'DELETE') return makeRes({ success: true });
      return makeRes({ success: true });
    });

    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Domestic'));

    const header = container.querySelector('[class*="cursor-pointer"]') as HTMLElement;
    fireEvent.click(header);
    await flush();

    const deleteRateBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.querySelector('span.material-icons')?.textContent === 'delete' &&
             !b.className.includes('p-1.5'),
    ) as HTMLElement;
    fireEvent.click(deleteRateBtn);
    await flush();

    await waitFor(() => {
      expect(container.textContent).toContain('Rate deleted.');
    });

    const deleteCalls = fetchMock.mock.calls.filter(
      ([url, init]) => (init as RequestInit)?.method === 'DELETE' && url.includes('/rates/'),
    );
    expect(deleteCalls.length).toBeGreaterThan(0);
  });
});

// ─── Rate display in table ────────────────────────────────────────────────────

describe('ShippingSettingsPage — rate table display', () => {
  it('renders manual rate name and price', async () => {
    const rate = makeRate({ name: 'Ground', price: 799 });
    fetchMock.mockImplementation(async () =>
      makeRes({ success: true, data: [makeZone({ rates: [rate] })] }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Domestic'));

    const header = container.querySelector('[class*="cursor-pointer"]') as HTMLElement;
    fireEvent.click(header);
    await flush();

    expect(container.textContent).toContain('Ground');
    expect(container.textContent).toContain('$7.99');
  });

  it('renders EasyPost live badge for live rate', async () => {
    const rate = makeRate({ name: 'UPS Live', liveRateOnly: true, provider: 'easypost', rateType: 'live', price: 0 });
    fetchMock.mockImplementation(async () =>
      makeRes({ success: true, data: [makeZone({ rates: [rate] })] }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Domestic'));

    const header = container.querySelector('[class*="cursor-pointer"]') as HTMLElement;
    fireEvent.click(header);
    await flush();

    expect(container.textContent).toContain('EasyPost');
    expect(container.textContent).toContain('LIVE');
  });

  it('renders free shipping label for free rate', async () => {
    const rate = makeRate({ name: 'Free', rateType: 'free', price: 0 });
    fetchMock.mockImplementation(async () =>
      makeRes({ success: true, data: [makeZone({ rates: [rate] })] }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Domestic'));

    const header = container.querySelector('[class*="cursor-pointer"]') as HTMLElement;
    fireEvent.click(header);
    await flush();

    expect(container.textContent).toContain('Free');
  });

  it('renders delivery days range when both min and max set', async () => {
    const rate = makeRate({ minDeliveryDays: 2, maxDeliveryDays: 5 });
    fetchMock.mockImplementation(async () =>
      makeRes({ success: true, data: [makeZone({ rates: [rate] })] }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Domestic'));

    const header = container.querySelector('[class*="cursor-pointer"]') as HTMLElement;
    fireEvent.click(header);
    await flush();

    expect(container.textContent).toContain('2-5 days');
  });

  it('renders min+ days when only min is set', async () => {
    const rate = makeRate({ minDeliveryDays: 3, maxDeliveryDays: null });
    fetchMock.mockImplementation(async () =>
      makeRes({ success: true, data: [makeZone({ rates: [rate] })] }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Domestic'));

    const header = container.querySelector('[class*="cursor-pointer"]') as HTMLElement;
    fireEvent.click(header);
    await flush();

    expect(container.textContent).toContain('3+ days');
  });

  it('renders -- for delivery when neither min nor max set', async () => {
    const rate = makeRate({ minDeliveryDays: null, maxDeliveryDays: null });
    fetchMock.mockImplementation(async () =>
      makeRes({ success: true, data: [makeZone({ rates: [rate] })] }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Domestic'));

    const header = container.querySelector('[class*="cursor-pointer"]') as HTMLElement;
    fireEvent.click(header);
    await flush();

    // Delivery column: --
    expect(container.textContent).toContain('--');
  });

  it('renders free-above amount for manual rate', async () => {
    const rate = makeRate({ freeAbove: 5000 });
    fetchMock.mockImplementation(async () =>
      makeRes({ success: true, data: [makeZone({ rates: [rate] })] }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Domestic'));

    const header = container.querySelector('[class*="cursor-pointer"]') as HTMLElement;
    fireEvent.click(header);
    await flush();

    expect(container.textContent).toContain('$50.00');
  });

  it('renders carrier code for live rate', async () => {
    const rate = makeRate({ liveRateOnly: true, provider: 'easypost', rateType: 'live', price: 0, carrierCode: 'USPS' });
    fetchMock.mockImplementation(async () =>
      makeRes({ success: true, data: [makeZone({ rates: [rate] })] }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Domestic'));

    const header = container.querySelector('[class*="cursor-pointer"]') as HTMLElement;
    fireEvent.click(header);
    await flush();

    expect(container.textContent).toContain('USPS');
  });
});

// ─── Fetch failure on load ────────────────────────────────────────────────────

describe('ShippingSettingsPage — fetch failure on load', () => {
  it('fails silently and shows empty state when fetch throws', async () => {
    fetchMock.mockRejectedValue(new Error('network error'));
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('No shipping zones');
    });
  });

  it('fails silently when fetch returns non-success', async () => {
    fetchMock.mockResolvedValue(makeRes({ success: false }, false));
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('No shipping zones');
    });
  });
});

// ─── Error / success banner display ──────────────────────────────────────────

describe('ShippingSettingsPage — banners', () => {
  it('error banner is not visible initially', async () => {
    const { container } = renderPage();
    await flush();
    // Error banner uses bg-red-50 class
    const errorDiv = container.querySelector('[class*="bg-red-50"]') as HTMLElement | null;
    expect(errorDiv).toBeNull();
  });

  it('success banner is not visible initially', async () => {
    const { container } = renderPage();
    await flush();
    const successDiv = container.querySelector('[class*="bg-green-50"]') as HTMLElement | null;
    expect(successDiv).toBeNull();
  });
});
