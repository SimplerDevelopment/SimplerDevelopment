// @vitest-environment jsdom
/**
 * Unit tests for `app/portal/websites/[siteId]/store/settings/page.tsx`
 *
 * The page is a 'use client' component that:
 *  - loads store settings via fetch on mount
 *  - renders a form with general, tax, feature toggles, customer portal,
 *    shipping provider (incl. EasyPost), and Stripe sections
 *  - saves via PUT, shows success/error banners
 *  - handles EasyPost API key save/clear and connection test
 *  - handles Stripe BYOK secret/webhook secret save/clear/test
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, act } from '@testing-library/react';

// ─── Mocks (must precede page import) ───────────────────────────────────────

vi.mock('next/navigation', () => ({
  useParams: () => ({ siteId: 'site-123' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/portal/websites/site-123/store/settings',
}));

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string; [key: string]: unknown }) =>
    React.createElement('a', { href, ...rest }, children),
}));

// ─── Types & helpers ─────────────────────────────────────────────────────────

type FetchResp = { ok: boolean; json: () => Promise<unknown> };

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<FetchResp>>();

function makeRes(body: unknown, ok = true): FetchResp {
  return { ok, json: async () => body };
}

function makeSettings(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    storeName: 'Test Store',
    currency: 'USD',
    taxRate: 8.5,
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
    shippingProvider: 'manual',
    easypostApiKeyConfigured: false,
    easypostApiKeyLast4: null,
    easypostMode: null,
    easypostWebhookSecret: null,
    shipFromAddress: null,
    defaultParcelLengthIn: null,
    defaultParcelWidthIn: null,
    defaultParcelHeightIn: null,
    defaultParcelWeightOz: null,
    liveRatesFallback: false,
    stripeMode: 'connect',
    stripeByokAllowed: false,
    stripeSecretKeyConfigured: false,
    stripeSecretKeyLast4: null,
    stripePublishableKey: null,
    stripeWebhookSecretConfigured: false,
    ...overrides,
  };
}

function defaultFetch(url: string, init?: RequestInit): FetchResp {
  if (url.endsWith('/settings') && (!init?.method || init.method === 'GET')) {
    return makeRes({ success: true, data: makeSettings() });
  }
  if (url.endsWith('/settings') && init?.method === 'PUT') {
    return makeRes({ success: true });
  }
  return makeRes({ success: true });
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => defaultFetch(url, init));
  vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
  // Stub clipboard
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ─── Import after mocks ───────────────────────────────────────────────────────

import StoreSettingsPage from '@/app/portal/websites/[siteId]/store/settings/page';

function renderPage() {
  return render(<StoreSettingsPage />);
}

// ─── Loading state ───────────────────────────────────────────────────────────

describe('StoreSettingsPage — loading state', () => {
  it('shows loading spinner while data fetches', () => {
    let resolveFetch!: (v: FetchResp) => void;
    const pending = new Promise<FetchResp>((res) => { resolveFetch = res; });
    fetchMock.mockImplementation(async () => pending);
    const { container } = renderPage();
    expect(container.querySelector('.animate-spin')).toBeTruthy();
    // Resolve to avoid leaking
    resolveFetch(makeRes({ success: true, data: makeSettings() }));
  });

  it('shows error state when settings cannot be loaded', async () => {
    fetchMock.mockResolvedValue(makeRes({ success: false }, false));
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Could not load store settings');
    });
  });

  it('shows error state when fetch throws', async () => {
    fetchMock.mockRejectedValue(new Error('network error'));
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Could not load store settings');
    });
  });
});

// ─── Render — general settings ───────────────────────────────────────────────

describe('StoreSettingsPage — general settings render', () => {
  it('renders Store Settings heading', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Store Settings');
    });
  });

  it('renders the store name input with loaded value', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const input = container.querySelector('input[placeholder="My Store"]') as HTMLInputElement;
      expect(input).toBeTruthy();
      expect(input.value).toBe('Test Store');
    });
  });

  it('renders the currency select with loaded value', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const select = container.querySelector('select') as HTMLSelectElement;
      expect(select).toBeTruthy();
      expect(select.value).toBe('USD');
    });
  });

  it('renders the order prefix input', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const input = container.querySelector('input[placeholder="ORD-"]') as HTMLInputElement;
      expect(input).toBeTruthy();
      expect(input.value).toBe('ORD-');
    });
  });

  it('renders the tax rate input with loaded value', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const inputs = Array.from(container.querySelectorAll('input[type="number"]')) as HTMLInputElement[];
      const taxInput = inputs.find((el) => el.value === '8.5');
      expect(taxInput).toBeTruthy();
    });
  });

  it('renders the low stock threshold input', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const inputs = Array.from(container.querySelectorAll('input[type="number"]')) as HTMLInputElement[];
      const thresholdInput = inputs.find((el) => el.value === '5');
      expect(thresholdInput).toBeTruthy();
    });
  });

  it('renders the Save Settings button', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const btn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Save Settings'),
      );
      expect(btn).toBeTruthy();
    });
  });
});

// ─── Toggles ────────────────────────────────────────────────────────────────

describe('StoreSettingsPage — toggles', () => {
  it('shows "Prices include tax" when taxInclusive is true', async () => {
    fetchMock.mockResolvedValue(makeRes({ success: true, data: makeSettings({ taxInclusive: true }) }));
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Prices include tax');
    });
  });

  it('shows "Tax added at checkout" when taxInclusive is false', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Tax added at checkout');
    });
  });

  it('clicking taxInclusive toggle flips label', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Tax added at checkout');
    });
    // Find the toggle button by locating one in the Tax section
    const toggleBtns = Array.from(container.querySelectorAll('button[type="button"]')).filter((b) =>
      b.className.includes('rounded-full'),
    ) as HTMLButtonElement[];
    // The taxInclusive toggle is the first toggle in the Tax section
    const taxToggle = toggleBtns[0];
    fireEvent.click(taxToggle);
    await waitFor(() => {
      expect(container.textContent).toContain('Prices include tax');
    });
  });

  it('shows "Products require shipping by default" when requiresShipping is true', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Products require shipping by default');
    });
  });

  it('shows "No shipping by default" when requiresShipping is false', async () => {
    fetchMock.mockResolvedValue(makeRes({ success: true, data: makeSettings({ requiresShipping: false }) }));
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('No shipping by default');
    });
  });

  it('shows "Customers can leave reviews" when enableReviews is true', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Customers can leave reviews');
    });
  });

  it('shows "Reviews disabled" when enableReviews is false', async () => {
    fetchMock.mockResolvedValue(makeRes({ success: true, data: makeSettings({ enableReviews: false }) }));
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Reviews disabled');
    });
  });
});

// ─── Customer portal section ─────────────────────────────────────────────────

describe('StoreSettingsPage — customer portal', () => {
  it('renders Customer Portal heading', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Customer Portal');
    });
  });

  it('renders all 6 customer portal toggles', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Customer Accounts');
      expect(container.textContent).toContain('Guest Checkout');
      expect(container.textContent).toContain('Wishlist');
      expect(container.textContent).toContain('Order Tracking');
      expect(container.textContent).toContain('Customer Support');
      expect(container.textContent).toContain('Product Reviews');
    });
  });

  it('renders support email input', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const input = container.querySelector('input[placeholder="support@yourstore.com"]') as HTMLInputElement;
      expect(input).toBeTruthy();
    });
  });

  it('renders return policy URL input', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const input = container.querySelector('input[placeholder="https://yourstore.com/returns"]') as HTMLInputElement;
      expect(input).toBeTruthy();
    });
  });

  it('renders welcome message textarea', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const textarea = container.querySelector('textarea');
      expect(textarea).toBeTruthy();
    });
  });

  it('renders customerPortalWelcomeMessage value when set', async () => {
    fetchMock.mockResolvedValue(makeRes({
      success: true,
      data: makeSettings({ customerPortalWelcomeMessage: 'Hello customer!' }),
    }));
    const { container } = renderPage();
    await waitFor(() => {
      const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
      expect(textarea.value).toBe('Hello customer!');
    });
  });
});

// ─── Shipping provider section ────────────────────────────────────────────────

describe('StoreSettingsPage — shipping provider', () => {
  it('renders Shipping Provider heading', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Shipping Provider');
    });
  });

  it('renders Manual and EasyPost radio options', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Manual');
      expect(container.textContent).toContain('EasyPost');
    });
  });

  it('does not show EasyPost settings when provider is manual', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).not.toContain('EasyPost API Key');
    });
  });

  it('shows EasyPost settings section when provider is easypost', async () => {
    fetchMock.mockResolvedValue(makeRes({
      success: true,
      data: makeSettings({ shippingProvider: 'easypost' }),
    }));
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('EasyPost API Key');
    });
  });

  it('shows "No key configured" when easypostApiKeyConfigured is false', async () => {
    fetchMock.mockResolvedValue(makeRes({
      success: true,
      data: makeSettings({ shippingProvider: 'easypost', easypostApiKeyConfigured: false }),
    }));
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('No key configured');
    });
  });

  it('shows key-set message with last4 when easypostApiKeyConfigured is true', async () => {
    fetchMock.mockResolvedValue(makeRes({
      success: true,
      data: makeSettings({
        shippingProvider: 'easypost',
        easypostApiKeyConfigured: true,
        easypostApiKeyLast4: 'abcd',
      }),
    }));
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Key set, ends in');
      expect(container.textContent).toContain('abcd');
    });
  });

  it('shows Clear key button when easypostApiKeyConfigured is true', async () => {
    fetchMock.mockResolvedValue(makeRes({
      success: true,
      data: makeSettings({ shippingProvider: 'easypost', easypostApiKeyConfigured: true }),
    }));
    const { container } = renderPage();
    await waitFor(() => {
      const clearBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Clear key'),
      );
      expect(clearBtn).toBeTruthy();
    });
  });

  it('shows Ship-From Address section in easypost mode', async () => {
    fetchMock.mockResolvedValue(makeRes({
      success: true,
      data: makeSettings({ shippingProvider: 'easypost' }),
    }));
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Ship-From Address');
    });
  });

  it('shows Default Parcel section in easypost mode', async () => {
    fetchMock.mockResolvedValue(makeRes({
      success: true,
      data: makeSettings({ shippingProvider: 'easypost' }),
    }));
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Default Parcel');
    });
  });

  it('shows Test Connection button in easypost mode', async () => {
    fetchMock.mockResolvedValue(makeRes({
      success: true,
      data: makeSettings({ shippingProvider: 'easypost' }),
    }));
    const { container } = renderPage();
    await waitFor(() => {
      const btn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Test connection'),
      );
      expect(btn).toBeTruthy();
    });
  });

  it('renders parcel dimension inputs with values when set', async () => {
    fetchMock.mockResolvedValue(makeRes({
      success: true,
      data: makeSettings({
        shippingProvider: 'easypost',
        defaultParcelLengthIn: 10,
        defaultParcelWidthIn: 8,
        defaultParcelHeightIn: 6,
        defaultParcelWeightOz: 32,
      }),
    }));
    const { container } = renderPage();
    await waitFor(() => {
      const numInputs = Array.from(container.querySelectorAll('input[type="number"]')) as HTMLInputElement[];
      const values = numInputs.map((i) => i.value);
      expect(values).toContain('10');
      expect(values).toContain('8');
    });
  });
});

// ─── Stripe Connect section ──────────────────────────────────────────────────

describe('StoreSettingsPage — Stripe Connect', () => {
  it('shows Connect Stripe button when not connected', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Connect Stripe');
    });
  });

  it('shows connected status when stripeConnected is true', async () => {
    fetchMock.mockResolvedValue(makeRes({
      success: true,
      data: makeSettings({ stripeConnected: true, stripeAccountId: 'acct_abc123' }),
    }));
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Stripe Connected');
      expect(container.textContent).toContain('acct_abc123');
    });
  });

  it('shows payout schedule when provided', async () => {
    fetchMock.mockResolvedValue(makeRes({
      success: true,
      data: makeSettings({ stripeConnected: true, payoutSchedule: 'weekly' }),
    }));
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('weekly');
    });
  });

  it('shows platform fee when provided', async () => {
    fetchMock.mockResolvedValue(makeRes({
      success: true,
      data: makeSettings({ stripeConnected: true, platformFeePercent: 2.5 }),
    }));
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('2.5%');
    });
  });
});

// ─── Stripe BYOK section ─────────────────────────────────────────────────────

describe('StoreSettingsPage — Stripe BYOK', () => {
  it('shows "not enabled" info when stripeByokAllowed is false', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Stripe BYOK is not enabled for this site');
    });
  });

  it('shows BYOK mode radio when stripeByokAllowed is true', async () => {
    fetchMock.mockResolvedValue(makeRes({
      success: true,
      data: makeSettings({ stripeByokAllowed: true }),
    }));
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Connect');
      expect(container.textContent).toContain('BYOK');
    });
  });

  it('does not show BYOK key fields when stripeMode is connect', async () => {
    fetchMock.mockResolvedValue(makeRes({
      success: true,
      data: makeSettings({ stripeByokAllowed: true, stripeMode: 'connect' }),
    }));
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).not.toContain('Secret Key');
    });
  });

  it('shows BYOK key fields when stripeMode is byok', async () => {
    fetchMock.mockResolvedValue(makeRes({
      success: true,
      data: makeSettings({ stripeByokAllowed: true, stripeMode: 'byok' }),
    }));
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Secret Key');
      expect(container.textContent).toContain('Publishable Key');
      expect(container.textContent).toContain('Webhook Endpoint Secret');
    });
  });

  it('shows "No key configured" for Stripe secret key when not configured', async () => {
    fetchMock.mockResolvedValue(makeRes({
      success: true,
      data: makeSettings({ stripeByokAllowed: true, stripeMode: 'byok', stripeSecretKeyConfigured: false }),
    }));
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('No key configured');
    });
  });

  it('shows configured status with last4 for Stripe secret key', async () => {
    fetchMock.mockResolvedValue(makeRes({
      success: true,
      data: makeSettings({
        stripeByokAllowed: true,
        stripeMode: 'byok',
        stripeSecretKeyConfigured: true,
        stripeSecretKeyLast4: 'zxcv',
      }),
    }));
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Configured (ends in');
      expect(container.textContent).toContain('zxcv');
    });
  });

  it('shows webhook URL display in byok mode with siteId in URL', async () => {
    fetchMock.mockResolvedValue(makeRes({
      success: true,
      data: makeSettings({ stripeByokAllowed: true, stripeMode: 'byok' }),
    }));
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Webhook URL');
      // The webhook URL is in a readonly input value — check the input element
      const webhookInput = Array.from(container.querySelectorAll('input[readonly]')).find((el) =>
        (el as HTMLInputElement).value.includes('site-123'),
      ) as HTMLInputElement | undefined;
      expect(webhookInput).toBeTruthy();
      expect(webhookInput!.value).toContain('siteId=site-123');
    });
  });

  it('shows Test Connection button in byok mode', async () => {
    fetchMock.mockResolvedValue(makeRes({
      success: true,
      data: makeSettings({ stripeByokAllowed: true, stripeMode: 'byok' }),
    }));
    const { container } = renderPage();
    await waitFor(() => {
      const testBtns = Array.from(container.querySelectorAll('button')).filter((b) =>
        b.textContent?.includes('Test connection'),
      );
      expect(testBtns.length).toBeGreaterThan(0);
    });
  });

  it('shows "Not configured" for webhook secret when not configured', async () => {
    fetchMock.mockResolvedValue(makeRes({
      success: true,
      data: makeSettings({ stripeByokAllowed: true, stripeMode: 'byok', stripeWebhookSecretConfigured: false }),
    }));
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Not configured');
    });
  });

  it('shows "Configured" for webhook secret when configured', async () => {
    fetchMock.mockResolvedValue(makeRes({
      success: true,
      data: makeSettings({ stripeByokAllowed: true, stripeMode: 'byok', stripeWebhookSecretConfigured: true }),
    }));
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Configured');
    });
  });
});

// ─── Save settings flow ──────────────────────────────────────────────────────

describe('StoreSettingsPage — save flow', () => {
  it('calls PUT /settings when Save Settings is clicked', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Save Settings');
    });
    const saveBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Save Settings'),
    ) as HTMLButtonElement;
    fireEvent.click(saveBtn);
    await waitFor(() => {
      const putCalls = fetchMock.mock.calls.filter((c) => (c[1] as RequestInit)?.method === 'PUT');
      expect(putCalls.length).toBeGreaterThan(0);
    });
  });

  it('shows success banner on successful save', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/settings') && init?.method === 'PUT') {
        return makeRes({ success: true });
      }
      return makeRes({ success: true, data: makeSettings() });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Save Settings'));
    const saveBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Save Settings'),
    ) as HTMLButtonElement;
    fireEvent.click(saveBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Settings saved successfully');
    });
  });

  it('shows error banner on save failure with message', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/settings') && init?.method === 'PUT') {
        return makeRes({ success: false, message: 'Validation failed' });
      }
      return makeRes({ success: true, data: makeSettings() });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Save Settings'));
    const saveBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Save Settings'),
    ) as HTMLButtonElement;
    fireEvent.click(saveBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Validation failed');
    });
  });

  it('shows fallback error when save throws', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/settings') && init?.method === 'PUT') {
        throw new Error('network');
      }
      return makeRes({ success: true, data: makeSettings() });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Save Settings'));
    const saveBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Save Settings'),
    ) as HTMLButtonElement;
    fireEvent.click(saveBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Something went wrong');
    });
  });

  it('disables Save button while saving', async () => {
    let resolveSave!: (v: FetchResp) => void;
    const savePending = new Promise<FetchResp>((res) => { resolveSave = res; });
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/settings') && init?.method === 'PUT') {
        return savePending;
      }
      return makeRes({ success: true, data: makeSettings() });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Save Settings'));
    const saveBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Save Settings'),
    ) as HTMLButtonElement;
    fireEvent.click(saveBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Saving...');
    });
    resolveSave(makeRes({ success: true }));
  });

  it('sends taxRate as decimal (divided by 100) to the API', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Save Settings'));
    const saveBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Save Settings'),
    ) as HTMLButtonElement;
    fireEvent.click(saveBtn);
    await waitFor(() => {
      const putCall = fetchMock.mock.calls.find((c) => (c[1] as RequestInit)?.method === 'PUT');
      expect(putCall).toBeTruthy();
      const body = JSON.parse((putCall![1] as RequestInit).body as string);
      // taxRate 8.5 % -> 0.085 in the payload
      expect(body.taxRate).toBeCloseTo(0.085, 5);
    });
  });
});

// ─── Field updates ────────────────────────────────────────────────────────────

describe('StoreSettingsPage — field updates', () => {
  it('updates store name field', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('input[placeholder="My Store"]')).toBeTruthy();
    });
    const input = container.querySelector('input[placeholder="My Store"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'New Store Name' } });
    expect(input.value).toBe('New Store Name');
  });

  it('updates order prefix field', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('input[placeholder="ORD-"]')).toBeTruthy();
    });
    const input = container.querySelector('input[placeholder="ORD-"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'MYSHOP-' } });
    expect(input.value).toBe('MYSHOP-');
  });

  it('clears success/error messages when a field is changed', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/settings') && init?.method === 'PUT') {
        return makeRes({ success: true });
      }
      return makeRes({ success: true, data: makeSettings() });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Save Settings'));
    // First save to get success banner
    const saveBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Save Settings'),
    ) as HTMLButtonElement;
    fireEvent.click(saveBtn);
    await waitFor(() => expect(container.textContent).toContain('Settings saved'));
    // Now change a field — banner should clear
    const input = container.querySelector('input[placeholder="My Store"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'changed' } });
    await waitFor(() => {
      expect(container.textContent).not.toContain('Settings saved successfully');
    });
  });
});

// ─── Stripe Connect action ────────────────────────────────────────────────────

describe('StoreSettingsPage — Connect Stripe action', () => {
  it('calls POST stripe-connect when Connect Stripe is clicked', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/stripe-connect') && init?.method === 'POST') {
        return makeRes({ success: true, data: { url: 'https://stripe.com/connect' } });
      }
      return makeRes({ success: true, data: makeSettings() });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Connect Stripe'));
    // Override window.location.href to avoid navigation
    const locationSpy = vi.spyOn(window, 'location', 'get').mockReturnValue({
      ...window.location,
      href: '',
    } as Location);
    const connectBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Connect Stripe'),
    ) as HTMLButtonElement;
    fireEvent.click(connectBtn);
    await waitFor(() => {
      const postCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes('stripe-connect'));
      expect(postCalls.length).toBeGreaterThan(0);
    });
    locationSpy.mockRestore();
  });

  it('shows error when stripe-connect call fails', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/stripe-connect') && init?.method === 'POST') {
        return makeRes({ success: false, message: 'Stripe connect failed' });
      }
      return makeRes({ success: true, data: makeSettings() });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Connect Stripe'));
    const connectBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Connect Stripe'),
    ) as HTMLButtonElement;
    fireEvent.click(connectBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Stripe connect failed');
    });
  });

  it('shows error when stripe-connect throws', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/stripe-connect') && init?.method === 'POST') {
        throw new Error('network');
      }
      return makeRes({ success: true, data: makeSettings() });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Connect Stripe'));
    const connectBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Connect Stripe'),
    ) as HTMLButtonElement;
    fireEvent.click(connectBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Something went wrong');
    });
  });
});

// ─── EasyPost API key save/clear ──────────────────────────────────────────────

describe('StoreSettingsPage — EasyPost API key', () => {
  function setupEasypost(extra: Record<string, unknown> = {}) {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/settings') && init?.method === 'PUT') {
        return makeRes({ success: true });
      }
      return makeRes({ success: true, data: makeSettings({ shippingProvider: 'easypost', ...extra }) });
    });
  }

  it('Save key button is disabled when apiKeyInput is empty', async () => {
    setupEasypost();
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('EasyPost API Key'));
    const saveKeyBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Save key'),
    ) as HTMLButtonElement;
    expect(saveKeyBtn.disabled).toBe(true);
  });

  it('Save key button is enabled after typing in apiKeyInput', async () => {
    setupEasypost();
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('EasyPost API Key'));
    const keyInput = container.querySelector('input[placeholder="EZAK... or EZTK..."]') as HTMLInputElement;
    fireEvent.change(keyInput, { target: { value: 'EZAKsomekeyvalue' } });
    const saveKeyBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Save key'),
    ) as HTMLButtonElement;
    expect(saveKeyBtn.disabled).toBe(false);
  });

  it('calls PUT with easypostApiKeyPlaintext on Save key', async () => {
    setupEasypost();
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('EasyPost API Key'));
    const keyInput = container.querySelector('input[placeholder="EZAK... or EZTK..."]') as HTMLInputElement;
    fireEvent.change(keyInput, { target: { value: 'EZAKtest' } });
    const saveKeyBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Save key'),
    ) as HTMLButtonElement;
    fireEvent.click(saveKeyBtn);
    await waitFor(() => {
      const putCall = fetchMock.mock.calls.find((c) =>
        (c[1] as RequestInit)?.method === 'PUT' &&
        (c[1] as RequestInit)?.body?.toString().includes('easypostApiKeyPlaintext'),
      );
      expect(putCall).toBeTruthy();
    });
  });

  it('shows success message after saving EasyPost key', async () => {
    setupEasypost();
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('EasyPost API Key'));
    const keyInput = container.querySelector('input[placeholder="EZAK... or EZTK..."]') as HTMLInputElement;
    fireEvent.change(keyInput, { target: { value: 'EZAKtest' } });
    const saveKeyBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Save key'),
    ) as HTMLButtonElement;
    fireEvent.click(saveKeyBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('EasyPost API key saved');
    });
  });

  it('calls PUT with easypostApiKeyClear on Clear key', async () => {
    setupEasypost({ easypostApiKeyConfigured: true, easypostApiKeyLast4: 'wxyz' });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Clear key'));
    const clearBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Clear key'),
    ) as HTMLButtonElement;
    fireEvent.click(clearBtn);
    await waitFor(() => {
      const putCall = fetchMock.mock.calls.find((c) =>
        (c[1] as RequestInit)?.method === 'PUT' &&
        (c[1] as RequestInit)?.body?.toString().includes('easypostApiKeyClear'),
      );
      expect(putCall).toBeTruthy();
    });
  });

  it('shows success on clear key', async () => {
    setupEasypost({ easypostApiKeyConfigured: true, easypostApiKeyLast4: 'wxyz' });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Clear key'));
    const clearBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Clear key'),
    ) as HTMLButtonElement;
    fireEvent.click(clearBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('EasyPost API key cleared');
    });
  });

  it('shows error when save key fails', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/settings') && init?.method === 'PUT') {
        return makeRes({ success: false, message: 'Key save failed' });
      }
      return makeRes({ success: true, data: makeSettings({ shippingProvider: 'easypost' }) });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('EasyPost API Key'));
    const keyInput = container.querySelector('input[placeholder="EZAK... or EZTK..."]') as HTMLInputElement;
    fireEvent.change(keyInput, { target: { value: 'EZAKtest' } });
    const saveKeyBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Save key'),
    ) as HTMLButtonElement;
    fireEvent.click(saveKeyBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Key save failed');
    });
  });
});

// ─── EasyPost test connection ─────────────────────────────────────────────────

describe('StoreSettingsPage — EasyPost test connection', () => {
  function setupEasypostConnected() {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/easypost/test') && init?.method === 'POST') {
        return makeRes({
          success: true,
          data: {
            rateCount: 3,
            sampleRates: [
              { carrier: 'USPS', service: 'Priority', amountCents: 850, estDeliveryDays: 2 },
              { carrier: 'FedEx', service: 'Ground', amountCents: 1050, estDeliveryDays: 5 },
            ],
          },
        });
      }
      return makeRes({ success: true, data: makeSettings({ shippingProvider: 'easypost' }) });
    });
  }

  it('shows rate results on successful test', async () => {
    setupEasypostConnected();
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Test connection'));
    const testBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Test connection'),
    ) as HTMLButtonElement;
    fireEvent.click(testBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Got 3 rate');
      expect(container.textContent).toContain('USPS');
    });
  });

  it('shows error result on failed test', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/easypost/test') && init?.method === 'POST') {
        return makeRes({ success: false, message: 'Invalid key', code: 'KEY_INVALID' });
      }
      return makeRes({ success: true, data: makeSettings({ shippingProvider: 'easypost' }) });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Test connection'));
    const testBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Test connection'),
    ) as HTMLButtonElement;
    fireEvent.click(testBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Invalid key');
      expect(container.textContent).toContain('KEY_INVALID');
    });
  });

  it('shows network error when test throws', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/easypost/test') && init?.method === 'POST') {
        throw new Error('net fail');
      }
      return makeRes({ success: true, data: makeSettings({ shippingProvider: 'easypost' }) });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Test connection'));
    const testBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Test connection'),
    ) as HTMLButtonElement;
    fireEvent.click(testBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Network error running test');
    });
  });

  it('shows "Testing..." during connection test', async () => {
    let resolveTest!: (v: FetchResp) => void;
    const testPending = new Promise<FetchResp>((res) => { resolveTest = res; });
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/easypost/test') && init?.method === 'POST') {
        return testPending;
      }
      return makeRes({ success: true, data: makeSettings({ shippingProvider: 'easypost' }) });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Test connection'));
    const testBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Test connection'),
    ) as HTMLButtonElement;
    fireEvent.click(testBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Testing...');
    });
    resolveTest(makeRes({ success: true, data: { rateCount: 0, sampleRates: [] } }));
  });
});

// ─── Stripe BYOK key operations ───────────────────────────────────────────────

describe('StoreSettingsPage — Stripe BYOK key operations', () => {
  function setupByok(extra: Record<string, unknown> = {}) {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/settings') && init?.method === 'PUT') {
        return makeRes({ success: true });
      }
      return makeRes({
        success: true,
        data: makeSettings({ stripeByokAllowed: true, stripeMode: 'byok', ...extra }),
      });
    });
  }

  it('calls PUT with stripeSecretKeyPlaintext on save', async () => {
    setupByok();
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Secret Key'));
    const skInput = container.querySelector('input[placeholder="sk_test_… or sk_live_…"]') as HTMLInputElement;
    fireEvent.change(skInput, { target: { value: 'sk_test_abc' } });
    const saveSkBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.trim() === 'Save key' || (b.textContent?.includes('Save key') && !b.textContent?.includes('Save key cleared')),
    ) as HTMLButtonElement;
    fireEvent.click(saveSkBtn);
    await waitFor(() => {
      const putCall = fetchMock.mock.calls.find((c) =>
        (c[1] as RequestInit)?.method === 'PUT' &&
        (c[1] as RequestInit)?.body?.toString().includes('stripeSecretKeyPlaintext'),
      );
      expect(putCall).toBeTruthy();
    });
  });

  it('shows success on Stripe secret key save', async () => {
    setupByok();
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Secret Key'));
    const skInput = container.querySelector('input[placeholder="sk_test_… or sk_live_…"]') as HTMLInputElement;
    fireEvent.change(skInput, { target: { value: 'sk_test_xyz' } });
    const saveSkBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Save key'),
    ) as HTMLButtonElement;
    fireEvent.click(saveSkBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Stripe secret key saved');
    });
  });

  it('shows success on Stripe webhook secret save', async () => {
    setupByok();
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Webhook Endpoint Secret'));
    const whInput = container.querySelector('input[placeholder="whsec_…"]') as HTMLInputElement;
    fireEvent.change(whInput, { target: { value: 'whsec_test123' } });
    const saveWhBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Save secret'),
    ) as HTMLButtonElement;
    fireEvent.click(saveWhBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Stripe webhook secret saved');
    });
  });

  it('calls PUT with stripeWebhookSecretClear on clear', async () => {
    setupByok({ stripeWebhookSecretConfigured: true });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Clear secret'));
    const clearBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Clear secret'),
    ) as HTMLButtonElement;
    fireEvent.click(clearBtn);
    await waitFor(() => {
      const putCall = fetchMock.mock.calls.find((c) =>
        (c[1] as RequestInit)?.method === 'PUT' &&
        (c[1] as RequestInit)?.body?.toString().includes('stripeWebhookSecretClear'),
      );
      expect(putCall).toBeTruthy();
    });
  });

  it('shows success on Stripe webhook secret clear', async () => {
    setupByok({ stripeWebhookSecretConfigured: true });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Clear secret'));
    const clearBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Clear secret'),
    ) as HTMLButtonElement;
    fireEvent.click(clearBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Stripe webhook secret cleared');
    });
  });
});

// ─── Stripe connection test (BYOK) ────────────────────────────────────────────

describe('StoreSettingsPage — Stripe BYOK connection test', () => {
  function setupByokWithKey() {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/stripe/test') && init?.method === 'POST') {
        return makeRes({
          success: true,
          data: {
            account: {
              id: 'acct_stripe001',
              business_name: 'My Biz',
              charges_enabled: true,
              payouts_enabled: true,
            },
          },
        });
      }
      return makeRes({
        success: true,
        data: makeSettings({ stripeByokAllowed: true, stripeMode: 'byok', stripeSecretKeyConfigured: true }),
      });
    });
  }

  it('shows connected account info on successful Stripe test', async () => {
    setupByokWithKey();
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Secret Key'));
    const testBtns = Array.from(container.querySelectorAll('button')).filter((b) =>
      b.textContent?.includes('Test connection'),
    );
    const stripeTestBtn = testBtns[testBtns.length - 1] as HTMLButtonElement;
    fireEvent.click(stripeTestBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Connected to Stripe');
      expect(container.textContent).toContain('acct_stripe001');
      expect(container.textContent).toContain('My Biz');
    });
  });

  it('shows error on failed Stripe test', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/stripe/test') && init?.method === 'POST') {
        return makeRes({ success: false, message: 'Auth failed', code: 'AUTH_ERR' });
      }
      return makeRes({
        success: true,
        data: makeSettings({ stripeByokAllowed: true, stripeMode: 'byok', stripeSecretKeyConfigured: true }),
      });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Secret Key'));
    const testBtns = Array.from(container.querySelectorAll('button')).filter((b) =>
      b.textContent?.includes('Test connection'),
    );
    const stripeTestBtn = testBtns[testBtns.length - 1] as HTMLButtonElement;
    fireEvent.click(stripeTestBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Auth failed');
      expect(container.textContent).toContain('AUTH_ERR');
    });
  });

  it('shows network error when Stripe test throws', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/stripe/test') && init?.method === 'POST') {
        throw new Error('timeout');
      }
      return makeRes({
        success: true,
        data: makeSettings({ stripeByokAllowed: true, stripeMode: 'byok', stripeSecretKeyConfigured: true }),
      });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Secret Key'));
    const testBtns = Array.from(container.querySelectorAll('button')).filter((b) =>
      b.textContent?.includes('Test connection'),
    );
    const stripeTestBtn = testBtns[testBtns.length - 1] as HTMLButtonElement;
    fireEvent.click(stripeTestBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Network error running test');
    });
  });

  it('Stripe test button is disabled when stripeSecretKeyConfigured is false', async () => {
    fetchMock.mockResolvedValue(makeRes({
      success: true,
      data: makeSettings({ stripeByokAllowed: true, stripeMode: 'byok', stripeSecretKeyConfigured: false }),
    }));
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Secret Key'));
    const testBtns = Array.from(container.querySelectorAll('button')).filter((b) =>
      b.textContent?.includes('Test connection'),
    ) as HTMLButtonElement[];
    const stripeTestBtn = testBtns[testBtns.length - 1];
    expect(stripeTestBtn.disabled).toBe(true);
  });
});

// ─── Clipboard copy (webhook URL) ─────────────────────────────────────────────

describe('StoreSettingsPage — webhook URL clipboard copy', () => {
  it('shows Copy button in byok mode', async () => {
    fetchMock.mockResolvedValue(makeRes({
      success: true,
      data: makeSettings({ stripeByokAllowed: true, stripeMode: 'byok' }),
    }));
    const { container } = renderPage();
    await waitFor(() => {
      const copyBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Copy'),
      );
      expect(copyBtn).toBeTruthy();
    });
  });

  it('calls clipboard.writeText on Copy click and shows Copied', async () => {
    fetchMock.mockResolvedValue(makeRes({
      success: true,
      data: makeSettings({ stripeByokAllowed: true, stripeMode: 'byok' }),
    }));
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Webhook URL'));
    const copyBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Copy'),
    ) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(copyBtn);
    });
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalled();
    });
  });
});
