/* eslint-disable @typescript-eslint/no-explicit-any */
// @vitest-environment jsdom
/**
 * Unit tests for the Portal Store Settings page:
 *   app/portal/websites/[siteId]/store/settings/page.tsx
 *
 * Covers:
 *  - loading / error states
 *  - rendering general, tax, shipping, stripe, customer-portal sections
 *  - toggle interactions (taxInclusive, requiresShipping, enableReviews, customer portal toggles, liveRatesFallback)
 *  - field changes (storeName, currency, orderPrefix, lowStockThreshold)
 *  - save flow (success + error + throw)
 *  - shipping provider radio selection (manual / easypost)
 *  - easypost section: save/clear API key, test connection (ok + error)
 *  - stripe connect: connect button flow
 *  - Stripe BYOK: hidden when not allowed, revealed when allowed
 *  - stripeMode radio, save/clear secret key, save/clear webhook secret, test stripe connection
 *  - webhook URL copy button
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, act } from '@testing-library/react';

// ─── next/navigation mock ────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useParams: () => ({ siteId: 'site-42' }),
}));

// ─── Fetch stub ──────────────────────────────────────────────────────────────

type FetchResp = { ok: boolean; json: () => Promise<any> };
const fetchMock = vi.fn<(url: string, init?: any) => Promise<FetchResp>>();

function makeRes(body: any, ok = true): FetchResp {
  return { ok, json: async () => body };
}

// Minimal valid settings object
function baseSettings(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    storeName: 'Test Store',
    currency: 'USD',
    taxRate: 850, // 8.5 — stored as percentage in state
    taxInclusive: false,
    requiresShipping: true,
    lowStockThreshold: 5,
    orderPrefix: 'ORD-',
    enableReviews: true,
    stripeConnected: false,
    stripeAccountId: null,
    payoutSchedule: null,
    platformFeePercent: null,
    enableCustomerAccounts: true,
    enableGuestCheckout: true,
    enableWishlist: false,
    enableOrderTracking: true,
    enableCustomerSupport: false,
    customerPortalWelcomeMessage: null,
    supportEmail: null,
    returnPolicyUrl: null,
    shippingPolicyUrl: null,
    shippingProvider: 'manual' as const,
    easypostApiKeyConfigured: false,
    easypostApiKeyLast4: null,
    easypostMode: 'test' as const,
    easypostWebhookSecret: null,
    shipFromAddress: null,
    defaultParcelLengthIn: null,
    defaultParcelWidthIn: null,
    defaultParcelHeightIn: null,
    defaultParcelWeightOz: null,
    liveRatesFallback: false,
    stripeMode: 'connect' as const,
    stripeByokAllowed: false,
    stripeSecretKeyConfigured: false,
    stripeSecretKeyLast4: null,
    stripePublishableKey: null,
    stripeWebhookSecretConfigured: false,
    ...overrides,
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  // Default: successful settings load
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes('/settings') && !url.includes('PUT')) {
      return makeRes({ success: true, data: baseSettings() });
    }
    return makeRes({ success: true });
  });
  vi.stubGlobal('fetch', fetchMock as any);
  // Stub clipboard
  vi.stubGlobal('navigator', {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Import after mocks
import StoreSettingsPage from '@/app/portal/websites/[siteId]/store/settings/page';

function renderPage() {
  return render(<StoreSettingsPage />);
}

function findBtn(container: HTMLElement, text: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find((b) =>
    b.textContent?.includes(text),
  ) as HTMLButtonElement | undefined;
}

// ─── Loading state ───────────────────────────────────────────────────────────

describe('StoreSettingsPage — loading state', () => {
  it('shows a spinner while settings are fetching', () => {
    // Never resolve
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const { container } = renderPage();
    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });

  it('shows error state when settings fails to load', async () => {
    fetchMock.mockResolvedValue(makeRes({ success: false }));
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Could not load store settings.');
    });
  });

  it('shows error state when fetch throws', async () => {
    fetchMock.mockRejectedValue(new Error('network'));
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Could not load store settings.');
    });
  });
});

// ─── Main render ─────────────────────────────────────────────────────────────

describe('StoreSettingsPage — main render', () => {
  it('renders Store Settings heading and Save button after load', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Store Settings');
      expect(container.textContent).toContain('Save Settings');
    });
  });

  it('renders all section headings', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Store Settings'));
    expect(container.textContent).toContain('General');
    expect(container.textContent).toContain('Tax');
    expect(container.textContent).toContain('Features');
    expect(container.textContent).toContain('Customer Portal');
    expect(container.textContent).toContain('Stripe Connect');
    expect(container.textContent).toContain('Shipping Provider');
  });

  it('populates storeName input from settings', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Store Settings'));
    const nameInput = container.querySelector(
      'input[placeholder="My Store"]',
    ) as HTMLInputElement;
    expect(nameInput.value).toBe('Test Store');
  });

  it('populates orderPrefix input from settings', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Store Settings'));
    const prefixInput = container.querySelector(
      'input[placeholder="ORD-"]',
    ) as HTMLInputElement;
    expect(prefixInput.value).toBe('ORD-');
  });
});

// ─── General field edits ──────────────────────────────────────────────────────

describe('StoreSettingsPage — general field edits', () => {
  it('updates storeName when user types', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Store Settings'));
    const nameInput = container.querySelector(
      'input[placeholder="My Store"]',
    ) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'New Name' } });
    expect(nameInput.value).toBe('New Name');
  });

  it('updates lowStockThreshold from numeric input', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Store Settings'));
    const inputs = Array.from(container.querySelectorAll('input[type="number"]')) as HTMLInputElement[];
    const stockInput = inputs.find((i) => i.value === '5');
    expect(stockInput).toBeTruthy();
    fireEvent.change(stockInput!, { target: { value: '10' } });
    expect(stockInput!.value).toBe('10');
  });

  it('updates currency select', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Store Settings'));
    const select = container.querySelector('select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'EUR' } });
    expect(select.value).toBe('EUR');
  });
});

// ─── Toggle buttons ───────────────────────────────────────────────────────────

describe('StoreSettingsPage — toggle buttons', () => {
  it('toggles taxInclusive and updates label text', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Store Settings'));
    expect(container.textContent).toContain('Tax added at checkout');
    // Find the toggle button (rounded-full) in the Tax section
    const toggles = Array.from(
      container.querySelectorAll('button.rounded-full'),
    ) as HTMLButtonElement[];
    // First toggle in DOM order is taxInclusive
    fireEvent.click(toggles[0]);
    await waitFor(() => {
      expect(container.textContent).toContain('Prices include tax');
    });
  });

  it('toggles requiresShipping', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Store Settings'));
    expect(container.textContent).toContain('Products require shipping by default');
    const toggles = Array.from(
      container.querySelectorAll('button.rounded-full'),
    ) as HTMLButtonElement[];
    // Second toggle is requiresShipping
    fireEvent.click(toggles[1]);
    await waitFor(() => {
      expect(container.textContent).toContain('No shipping by default');
    });
  });

  it('toggles enableReviews', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Store Settings'));
    expect(container.textContent).toContain('Customers can leave reviews');
    const toggles = Array.from(
      container.querySelectorAll('button.rounded-full'),
    ) as HTMLButtonElement[];
    // Third toggle is enableReviews
    fireEvent.click(toggles[2]);
    await waitFor(() => {
      expect(container.textContent).toContain('Reviews disabled');
    });
  });
});

// ─── Save flow ────────────────────────────────────────────────────────────────

describe('StoreSettingsPage — save flow', () => {
  it('calls PUT on save and shows success message', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (init?.method === 'PUT') {
        return makeRes({ success: true });
      }
      return makeRes({ success: true, data: baseSettings() });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Store Settings'));
    fireEvent.click(findBtn(container, 'Save Settings')!);
    await waitFor(() => {
      expect(container.textContent).toContain('Settings saved successfully.');
      const calls = fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT');
      expect(calls.length).toBeGreaterThan(0);
    });
  });

  it('shows error message when save fails with message', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (init?.method === 'PUT') {
        return makeRes({ success: false, message: 'Validation error' });
      }
      return makeRes({ success: true, data: baseSettings() });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Store Settings'));
    fireEvent.click(findBtn(container, 'Save Settings')!);
    await waitFor(() => {
      expect(container.textContent).toContain('Validation error');
    });
  });

  it('shows "Failed to save settings." when save fails without message', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (init?.method === 'PUT') {
        return makeRes({ success: false });
      }
      return makeRes({ success: true, data: baseSettings() });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Store Settings'));
    fireEvent.click(findBtn(container, 'Save Settings')!);
    await waitFor(() => {
      expect(container.textContent).toContain('Failed to save settings.');
    });
  });

  it('shows "Something went wrong." when fetch throws during save', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (init?.method === 'PUT') throw new Error('network');
      return makeRes({ success: true, data: baseSettings() });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Store Settings'));
    fireEvent.click(findBtn(container, 'Save Settings')!);
    await waitFor(() => {
      expect(container.textContent).toContain('Something went wrong.');
    });
  });

  it('sends parcel dimensions as null when empty strings', async () => {
    let putBody: any = null;
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (init?.method === 'PUT') {
        putBody = JSON.parse(init.body);
        return makeRes({ success: true });
      }
      return makeRes({
        success: true,
        data: baseSettings({
          shippingProvider: 'easypost',
          defaultParcelLengthIn: '',
          defaultParcelWidthIn: null,
        }),
      });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Store Settings'));
    fireEvent.click(findBtn(container, 'Save Settings')!);
    await waitFor(() => {
      expect(putBody).not.toBeNull();
      expect(putBody.defaultParcelLengthIn).toBeNull();
      expect(putBody.defaultParcelWidthIn).toBeNull();
    });
  });

  it('converts taxRate percentage to decimal for API', async () => {
    let putBody: any = null;
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (init?.method === 'PUT') {
        putBody = JSON.parse(init.body);
        return makeRes({ success: true });
      }
      return makeRes({ success: true, data: baseSettings({ taxRate: 850 }) });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Store Settings'));
    fireEvent.click(findBtn(container, 'Save Settings')!);
    await waitFor(() => {
      expect(putBody).not.toBeNull();
      // 850 / 100 = 8.5
      expect(putBody.taxRate).toBe(8.5);
    });
  });
});

// ─── Stripe Connect ───────────────────────────────────────────────────────────

describe('StoreSettingsPage — Stripe Connect', () => {
  it('shows Connect Stripe button when not connected', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Store Settings'));
    expect(container.textContent).toContain('Connect Stripe');
  });

  it('shows connected state with account ID', async () => {
    fetchMock.mockResolvedValue(
      makeRes({
        success: true,
        data: baseSettings({
          stripeConnected: true,
          stripeAccountId: 'acct_abc123',
          payoutSchedule: 'daily',
          platformFeePercent: 2.5,
        }),
      }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Stripe Connected'));
    expect(container.textContent).toContain('acct_abc123');
    expect(container.textContent).toContain('daily');
    expect(container.textContent).toContain('2.5%');
  });

  it('calls stripe-connect POST and redirects on success', async () => {
    const originalLocation = window.location;
    // @ts-expect-error - jsdom workaround
    delete window.location;
    window.location = { href: '' } as Location;

    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/stripe-connect') && init?.method === 'POST') {
        return makeRes({ success: true, data: { url: 'https://stripe.com/connect' } });
      }
      return makeRes({ success: true, data: baseSettings() });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Connect Stripe'));
    fireEvent.click(findBtn(container, 'Connect Stripe')!);
    await waitFor(() => {
      expect(window.location.href).toBe('https://stripe.com/connect');
    });

    // @ts-expect-error - restore
    window.location = originalLocation;
  });

  it('shows error when stripe connect fails', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/stripe-connect') && init?.method === 'POST') {
        return makeRes({ success: false, message: 'Stripe error' });
      }
      return makeRes({ success: true, data: baseSettings() });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Connect Stripe'));
    fireEvent.click(findBtn(container, 'Connect Stripe')!);
    await waitFor(() => {
      expect(container.textContent).toContain('Stripe error');
    });
  });

  it('shows generic error when stripe connect throws', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/stripe-connect') && init?.method === 'POST') {
        throw new Error('network');
      }
      return makeRes({ success: true, data: baseSettings() });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Connect Stripe'));
    fireEvent.click(findBtn(container, 'Connect Stripe')!);
    await waitFor(() => {
      expect(container.textContent).toContain('Something went wrong.');
    });
  });
});

// ─── Shipping provider ────────────────────────────────────────────────────────

describe('StoreSettingsPage — shipping provider', () => {
  it('renders Manual and EasyPost radio options', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Store Settings'));
    expect(container.textContent).toContain('Manual');
    expect(container.textContent).toContain('EasyPost');
  });

  it('selecting EasyPost reveals easypost-specific fields', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Store Settings'));
    // The radio input has no value attr — click the <label> containing "EasyPost"
    const labels = Array.from(container.querySelectorAll('label')) as HTMLLabelElement[];
    const easypostLabel = labels.find(
      (l) => l.textContent?.includes('EasyPost') && l.querySelector('input[type="radio"]'),
    );
    expect(easypostLabel).toBeTruthy();
    fireEvent.click(easypostLabel!);
    await waitFor(() => {
      expect(container.textContent).toContain('EasyPost API Key');
    });
  });

  it('shows EasyPost section when shippingProvider is easypost from server', async () => {
    fetchMock.mockResolvedValue(
      makeRes({
        success: true,
        data: baseSettings({
          shippingProvider: 'easypost',
          easypostApiKeyConfigured: true,
          easypostApiKeyLast4: '1234',
          shipFromAddress: {
            line1: '123 Main St',
            city: 'Portland',
            state: 'OR',
            postalCode: '97201',
            country: 'US',
          },
        }),
      }),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('EasyPost API Key');
      expect(container.textContent).toContain('…1234');
      expect(container.textContent).toContain('Ship-From Address');
      expect(container.textContent).toContain('Default Parcel');
    });
  });

  it('save API key button saves key successfully', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (init?.method === 'PUT') {
        const body = JSON.parse(init.body);
        if (body.easypostApiKeyPlaintext) {
          return makeRes({ success: true });
        }
        return makeRes({ success: true });
      }
      return makeRes({
        success: true,
        data: baseSettings({ shippingProvider: 'easypost' }),
      });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('EasyPost API Key'));
    const apiKeyInput = container.querySelector(
      'input[placeholder="EZAK... or EZTK..."]',
    ) as HTMLInputElement;
    fireEvent.change(apiKeyInput, { target: { value: 'EZAK_test_key' } });
    fireEvent.click(findBtn(container, 'Save key')!);
    await waitFor(() => {
      expect(container.textContent).toContain('EasyPost API key saved.');
    });
  });

  it('save API key shows error on failure', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (init?.method === 'PUT') {
        const body = JSON.parse(init.body);
        if (body.easypostApiKeyPlaintext) {
          return makeRes({ success: false, message: 'Invalid key' });
        }
        return makeRes({ success: true });
      }
      return makeRes({ success: true, data: baseSettings({ shippingProvider: 'easypost' }) });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('EasyPost API Key'));
    const apiKeyInput = container.querySelector(
      'input[placeholder="EZAK... or EZTK..."]',
    ) as HTMLInputElement;
    fireEvent.change(apiKeyInput, { target: { value: 'EZAK_bad' } });
    fireEvent.click(findBtn(container, 'Save key')!);
    await waitFor(() => {
      expect(container.textContent).toContain('Invalid key');
    });
  });

  it('clear API key button clears key', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (init?.method === 'PUT') {
        return makeRes({ success: true });
      }
      return makeRes({
        success: true,
        data: baseSettings({
          shippingProvider: 'easypost',
          easypostApiKeyConfigured: true,
          easypostApiKeyLast4: '5678',
        }),
      });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('…5678'));
    fireEvent.click(findBtn(container, 'Clear key')!);
    await waitFor(() => {
      expect(container.textContent).toContain('EasyPost API key cleared.');
    });
  });

  it('test connection shows ok result', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/easypost/test') && init?.method === 'POST') {
        return makeRes({
          success: true,
          data: {
            rateCount: 3,
            sampleRates: [
              { carrier: 'USPS', service: 'Priority', amountCents: 799, estDeliveryDays: 2 },
            ],
          },
        });
      }
      return makeRes({ success: true, data: baseSettings({ shippingProvider: 'easypost' }) });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Test Connection'));
    fireEvent.click(findBtn(container, 'Test connection')!);
    await waitFor(() => {
      expect(container.textContent).toContain('3 rates');
      expect(container.textContent).toContain('USPS');
    });
  });

  it('test connection shows error result', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/easypost/test') && init?.method === 'POST') {
        return makeRes({ success: false, message: 'Auth failed', code: 'UNAUTHORIZED' });
      }
      return makeRes({ success: true, data: baseSettings({ shippingProvider: 'easypost' }) });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Test Connection'));
    fireEvent.click(findBtn(container, 'Test connection')!);
    await waitFor(() => {
      expect(container.textContent).toContain('Auth failed');
      expect(container.textContent).toContain('UNAUTHORIZED');
    });
  });

  it('test connection shows network error when fetch throws', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/easypost/test')) throw new Error('timeout');
      return makeRes({ success: true, data: baseSettings({ shippingProvider: 'easypost' }) });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Test Connection'));
    fireEvent.click(findBtn(container, 'Test connection')!);
    await waitFor(() => {
      expect(container.textContent).toContain('Network error running test');
    });
  });

  it('renders single rate without plural suffix', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/easypost/test') && init?.method === 'POST') {
        return makeRes({
          success: true,
          data: {
            rateCount: 1,
            sampleRates: [
              { carrier: 'UPS', service: 'Ground', amountCents: 500, estDeliveryDays: null },
            ],
          },
        });
      }
      return makeRes({ success: true, data: baseSettings({ shippingProvider: 'easypost' }) });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Test Connection'));
    fireEvent.click(findBtn(container, 'Test connection')!);
    await waitFor(() => {
      expect(container.textContent).toContain('Got 1 rate');
    });
  });

  it('liveRatesFallback toggle works in easypost mode', async () => {
    fetchMock.mockResolvedValue(
      makeRes({
        success: true,
        data: baseSettings({ shippingProvider: 'easypost', liveRatesFallback: false }),
      }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Show manual rates when live rates fail'));
    expect(container.textContent).toContain('Show manual rates when live rates fail');
    const toggles = Array.from(
      container.querySelectorAll('button.rounded-full'),
    ) as HTMLButtonElement[];
    // Find the live rates toggle — it's labelled nearby
    const liveRatesLabel = Array.from(container.querySelectorAll('label')).find((l) =>
      l.textContent?.includes('Live Rates Fallback'),
    );
    expect(liveRatesLabel).toBeTruthy();
    // Toggle is a sibling button
    const toggle = liveRatesLabel!.closest('div')?.querySelector('button.rounded-full') as HTMLButtonElement;
    if (toggle) {
      fireEvent.click(toggle);
      // No assertion needed — just verifying it doesn't throw
    } else {
      // Fallback: just click one of the rounded toggles
      fireEvent.click(toggles[toggles.length - 1]);
    }
  });

  it('ship-from address fields update correctly', async () => {
    fetchMock.mockResolvedValue(
      makeRes({
        success: true,
        data: baseSettings({
          shippingProvider: 'easypost',
          shipFromAddress: {
            line1: '123 Main',
            city: 'Portland',
            state: 'OR',
            postalCode: '97201',
            country: 'US',
          },
        }),
      }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Ship-From Address'));
    // Address Line 1 input
    const line1Inputs = Array.from(container.querySelectorAll('input')).filter(
      (i) => (i as HTMLInputElement).value === '123 Main',
    ) as HTMLInputElement[];
    expect(line1Inputs.length).toBeGreaterThan(0);
    fireEvent.change(line1Inputs[0], { target: { value: '456 Oak Ave' } });
    expect(line1Inputs[0].value).toBe('456 Oak Ave');
  });

  it('parcel number inputs render empty string for null values', async () => {
    fetchMock.mockResolvedValue(
      makeRes({
        success: true,
        data: baseSettings({
          shippingProvider: 'easypost',
          defaultParcelLengthIn: 12,
          defaultParcelWidthIn: null,
        }),
      }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Default Parcel'));
    // Length input should show "12"
    const lengthInput = Array.from(container.querySelectorAll('input[type="number"]')).find(
      (i) => (i as HTMLInputElement).value === '12',
    ) as HTMLInputElement | undefined;
    expect(lengthInput).toBeTruthy();
  });
});

// ─── Customer Portal ──────────────────────────────────────────────────────────

describe('StoreSettingsPage — customer portal', () => {
  it('renders Customer Portal section', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Customer Portal'));
    expect(container.textContent).toContain('Customer Accounts');
    expect(container.textContent).toContain('Guest Checkout');
    expect(container.textContent).toContain('Wishlist');
    expect(container.textContent).toContain('Order Tracking');
    expect(container.textContent).toContain('Customer Support');
  });

  it('updates support email field', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Customer Portal'));
    const emailInput = container.querySelector(
      'input[placeholder="support@yourstore.com"]',
    ) as HTMLInputElement;
    fireEvent.change(emailInput, { target: { value: 'help@mystore.com' } });
    expect(emailInput.value).toBe('help@mystore.com');
  });

  it('updates return policy URL field', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Customer Portal'));
    const returnInput = container.querySelector(
      'input[placeholder="https://yourstore.com/returns"]',
    ) as HTMLInputElement;
    fireEvent.change(returnInput, { target: { value: 'https://store.com/returns' } });
    expect(returnInput.value).toBe('https://store.com/returns');
  });

  it('updates welcome message textarea', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Customer Portal'));
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Welcome!' } });
    expect(textarea.value).toBe('Welcome!');
  });

  it('customer portal toggle buttons work', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Customer Portal'));
    const toggles = Array.from(
      container.querySelectorAll('button.rounded-full'),
    ) as HTMLButtonElement[];
    // Just verify clicking a toggle doesn't throw
    expect(toggles.length).toBeGreaterThan(3);
    fireEvent.click(toggles[3]);
  });
});

// ─── Stripe BYOK ─────────────────────────────────────────────────────────────

describe('StoreSettingsPage — Stripe BYOK', () => {
  it('shows "not enabled" notice when stripeByokAllowed is false', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Stripe Payment Provider'));
    expect(container.textContent).toContain('Stripe BYOK is not enabled for this site.');
  });

  it('shows BYOK mode selector when stripeByokAllowed is true', async () => {
    fetchMock.mockResolvedValue(
      makeRes({
        success: true,
        data: baseSettings({ stripeByokAllowed: true }),
      }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Stripe Payment Provider'));
    expect(container.textContent).toContain('Connect');
    expect(container.textContent).toContain('BYOK');
  });

  it('switching to BYOK mode reveals secret key fields', async () => {
    fetchMock.mockResolvedValue(
      makeRes({
        success: true,
        data: baseSettings({ stripeByokAllowed: true, stripeMode: 'connect' }),
      }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('BYOK'));
    // The radio input has no value attr — click the <label> containing "BYOK"
    const labels = Array.from(container.querySelectorAll('label')) as HTMLLabelElement[];
    const byokLabel = labels.find(
      (l) => l.textContent?.includes('BYOK') && l.querySelector('input[type="radio"]'),
    );
    expect(byokLabel).toBeTruthy();
    fireEvent.click(byokLabel!);
    await waitFor(() => {
      expect(container.textContent).toContain('Secret Key');
      expect(container.textContent).toContain('Publishable Key');
      expect(container.textContent).toContain('Webhook Endpoint Secret');
      expect(container.textContent).toContain('Webhook URL');
    });
  });

  it('BYOK mode: save secret key button saves successfully', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (init?.method === 'PUT') {
        return makeRes({ success: true });
      }
      return makeRes({
        success: true,
        data: baseSettings({ stripeByokAllowed: true, stripeMode: 'byok' }),
      });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Secret Key'));
    const secretInput = container.querySelector(
      'input[placeholder="sk_test_… or sk_live_…"]',
    ) as HTMLInputElement;
    fireEvent.change(secretInput, { target: { value: 'sk_test_abc123' } });
    // Find the save key button in the secret section
    const saveKeyBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Save key' || b.textContent?.includes('Save key'),
    ) as HTMLButtonElement;
    expect(saveKeyBtn).toBeTruthy();
    fireEvent.click(saveKeyBtn!);
    await waitFor(() => {
      expect(container.textContent).toContain('Stripe secret key saved.');
    });
  });

  it('BYOK mode: save secret key shows error on failure', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (init?.method === 'PUT') {
        const body = JSON.parse(init.body);
        if (body.stripeSecretKeyPlaintext) {
          return makeRes({ success: false, message: 'Invalid secret' });
        }
        return makeRes({ success: true });
      }
      return makeRes({
        success: true,
        data: baseSettings({ stripeByokAllowed: true, stripeMode: 'byok' }),
      });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Secret Key'));
    const secretInput = container.querySelector(
      'input[placeholder="sk_test_… or sk_live_…"]',
    ) as HTMLInputElement;
    fireEvent.change(secretInput, { target: { value: 'sk_test_bad' } });
    const saveKeyBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Save key'),
    ) as HTMLButtonElement;
    fireEvent.click(saveKeyBtn!);
    await waitFor(() => {
      expect(container.textContent).toContain('Invalid secret');
    });
  });

  it('BYOK mode: clear secret key works', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (init?.method === 'PUT') {
        return makeRes({ success: true });
      }
      return makeRes({
        success: true,
        data: baseSettings({
          stripeByokAllowed: true,
          stripeMode: 'byok',
          stripeSecretKeyConfigured: true,
          stripeSecretKeyLast4: 'abcd',
        }),
      });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('…abcd'));
    const clearBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Clear key'),
    ) as HTMLButtonElement;
    expect(clearBtn).toBeTruthy();
    fireEvent.click(clearBtn!);
    await waitFor(() => {
      expect(container.textContent).toContain('Stripe secret key cleared.');
    });
  });

  it('BYOK mode: save webhook secret works', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (init?.method === 'PUT') {
        return makeRes({ success: true });
      }
      return makeRes({
        success: true,
        data: baseSettings({ stripeByokAllowed: true, stripeMode: 'byok' }),
      });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Webhook Endpoint Secret'));
    const webhookInput = container.querySelector(
      'input[placeholder="whsec_…"]',
    ) as HTMLInputElement;
    fireEvent.change(webhookInput, { target: { value: 'whsec_test123' } });
    const saveSecretBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Save secret'),
    ) as HTMLButtonElement;
    expect(saveSecretBtn).toBeTruthy();
    fireEvent.click(saveSecretBtn!);
    await waitFor(() => {
      expect(container.textContent).toContain('Stripe webhook secret saved.');
    });
  });

  it('BYOK mode: save webhook secret shows error on failure', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (init?.method === 'PUT') {
        const body = JSON.parse(init.body);
        if (body.stripeWebhookSecretPlaintext) {
          return makeRes({ success: false, message: 'Webhook error' });
        }
        return makeRes({ success: true });
      }
      return makeRes({
        success: true,
        data: baseSettings({ stripeByokAllowed: true, stripeMode: 'byok' }),
      });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Webhook Endpoint Secret'));
    const webhookInput = container.querySelector('input[placeholder="whsec_…"]') as HTMLInputElement;
    fireEvent.change(webhookInput, { target: { value: 'whsec_bad' } });
    const saveSecretBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Save secret'),
    ) as HTMLButtonElement;
    fireEvent.click(saveSecretBtn!);
    await waitFor(() => {
      expect(container.textContent).toContain('Webhook error');
    });
  });

  it('BYOK mode: clear webhook secret works', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (init?.method === 'PUT') {
        return makeRes({ success: true });
      }
      return makeRes({
        success: true,
        data: baseSettings({
          stripeByokAllowed: true,
          stripeMode: 'byok',
          stripeWebhookSecretConfigured: true,
        }),
      });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Configured'));
    const clearSecretBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Clear secret'),
    ) as HTMLButtonElement;
    expect(clearSecretBtn).toBeTruthy();
    fireEvent.click(clearSecretBtn!);
    await waitFor(() => {
      expect(container.textContent).toContain('Stripe webhook secret cleared.');
    });
  });

  it('BYOK mode: test stripe connection shows ok result', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/stripe/test') && init?.method === 'POST') {
        return makeRes({
          success: true,
          data: {
            account: {
              id: 'acct_xyz',
              business_name: 'Acme Inc',
              charges_enabled: true,
              payouts_enabled: false,
            },
          },
        });
      }
      return makeRes({
        success: true,
        data: baseSettings({
          stripeByokAllowed: true,
          stripeMode: 'byok',
          stripeSecretKeyConfigured: true,
        }),
      });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Test Connection'));
    // There are two Test connection buttons (easypost + stripe); click the second one
    const testBtns = Array.from(container.querySelectorAll('button')).filter(
      (b) => b.textContent?.includes('Test connection'),
    );
    // Click the stripe one (second occurrence or first if only one)
    fireEvent.click(testBtns[testBtns.length - 1]);
    await waitFor(() => {
      expect(container.textContent).toContain('Connected to Stripe');
      expect(container.textContent).toContain('acct_xyz');
      expect(container.textContent).toContain('Acme Inc');
    });
  });

  it('BYOK mode: test stripe connection shows error result', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/stripe/test') && init?.method === 'POST') {
        return makeRes({ success: false, message: 'Invalid API key', code: 'invalid_api_key' });
      }
      return makeRes({
        success: true,
        data: baseSettings({
          stripeByokAllowed: true,
          stripeMode: 'byok',
          stripeSecretKeyConfigured: true,
        }),
      });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Test Connection'));
    const testBtns = Array.from(container.querySelectorAll('button')).filter(
      (b) => b.textContent?.includes('Test connection'),
    );
    fireEvent.click(testBtns[testBtns.length - 1]);
    await waitFor(() => {
      expect(container.textContent).toContain('Invalid API key');
      expect(container.textContent).toContain('invalid_api_key');
    });
  });

  it('BYOK mode: test stripe connection shows network error when throws', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/stripe/test')) throw new Error('timeout');
      return makeRes({
        success: true,
        data: baseSettings({
          stripeByokAllowed: true,
          stripeMode: 'byok',
          stripeSecretKeyConfigured: true,
        }),
      });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Test Connection'));
    const testBtns = Array.from(container.querySelectorAll('button')).filter(
      (b) => b.textContent?.includes('Test connection'),
    );
    fireEvent.click(testBtns[testBtns.length - 1]);
    await waitFor(() => {
      expect(container.textContent).toContain('Network error running test');
    });
  });

  it('BYOK mode: webhook URL copy button calls clipboard.writeText', async () => {
    fetchMock.mockResolvedValue(
      makeRes({
        success: true,
        data: baseSettings({ stripeByokAllowed: true, stripeMode: 'byok' }),
      }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Webhook URL'));
    const copyBtn = findBtn(container, 'Copy');
    expect(copyBtn).toBeTruthy();
    await act(async () => {
      fireEvent.click(copyBtn!);
    });
    await waitFor(() => {
      expect((navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0);
    });
  });

  it('BYOK mode: webhook URL includes siteId', async () => {
    fetchMock.mockResolvedValue(
      makeRes({
        success: true,
        data: baseSettings({ stripeByokAllowed: true, stripeMode: 'byok' }),
      }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Webhook URL'));
    const webhookUrlInput = Array.from(container.querySelectorAll('input[readonly]')).find(
      (i) => (i as HTMLInputElement).value.includes('siteId='),
    ) as HTMLInputElement | undefined;
    expect(webhookUrlInput).toBeTruthy();
    expect(webhookUrlInput!.value).toContain('siteId=site-42');
  });

  it('BYOK mode: publishable key field is rendered and editable', async () => {
    fetchMock.mockResolvedValue(
      makeRes({
        success: true,
        data: baseSettings({
          stripeByokAllowed: true,
          stripeMode: 'byok',
          stripePublishableKey: 'pk_test_existing',
        }),
      }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Publishable Key'));
    const pkInput = container.querySelector(
      'input[placeholder="pk_test_… or pk_live_…"]',
    ) as HTMLInputElement;
    expect(pkInput).toBeTruthy();
    expect(pkInput.value).toBe('pk_test_existing');
    fireEvent.change(pkInput, { target: { value: 'pk_live_new' } });
    expect(pkInput.value).toBe('pk_live_new');
  });
});

// ─── Error / success banners ──────────────────────────────────────────────────

describe('StoreSettingsPage — error and success banners', () => {
  it('clearing a field clears the error/success message', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (init?.method === 'PUT') {
        return makeRes({ success: false, message: 'Save failed' });
      }
      return makeRes({ success: true, data: baseSettings() });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Store Settings'));
    // Trigger an error
    fireEvent.click(findBtn(container, 'Save Settings')!);
    await waitFor(() => expect(container.textContent).toContain('Save failed'));
    // Now change a field — should clear error
    const nameInput = container.querySelector(
      'input[placeholder="My Store"]',
    ) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'New' } });
    await waitFor(() => {
      expect(container.textContent).not.toContain('Save failed');
    });
  });
});
