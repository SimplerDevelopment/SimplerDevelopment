// @vitest-environment node
/**
 * Unit tests for `lib/stripe/site-stripe.ts` — the per-site Stripe resolver.
 *
 * Strategy:
 *   - Mock `@/lib/db` with a fluent chain that resolves to a single canned
 *     row (or empty array) per call to `resolveSiteStripe`.
 *   - Mock `@/lib/crypto/api-key` so we can simulate decrypt success/failure
 *     for both the secret key and the webhook secret independently.
 *   - Mock `@/lib/stripe/index` so the platform-client sentinel is
 *     identity-checkable in assertions.
 *   - DON'T mock `stripe` — `new Stripe('sk_test_...')` is a cheap, fully
 *     offline operation; the SDK only reaches the network at method-call
 *     time, which we never trigger here.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const dbState: { rows: unknown[] } = { rows: [] };

vi.mock('@/lib/db', () => {
  function makeSelectChain() {
    const chain: Record<string, unknown> = {};
    const passthrough = ['from', 'where', 'limit', 'orderBy'];
    for (const m of passthrough) chain[m] = () => chain;
    chain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(dbState.rows).then(resolve);
    return chain;
  }
  return {
    db: {
      select: () => makeSelectChain(),
    },
  };
});

vi.mock('@/lib/crypto/api-key', () => ({
  decryptApiKey: vi.fn(),
}));

const PLATFORM_CLIENT_SENTINEL = { _platform: true } as unknown as import('stripe').default;

vi.mock('@/lib/stripe/index', () => ({
  getStripeClient: vi.fn(() => PLATFORM_CLIENT_SENTINEL),
}));

import Stripe from 'stripe';
import { decryptApiKey } from '@/lib/crypto/api-key';
import { getStripeClient } from '@/lib/stripe/index';
import {
  resolveSiteStripe,
  SiteStripeError,
  type SiteStripeContext,
} from '@/lib/stripe/site-stripe';

const decryptApiKeyMock = decryptApiKey as unknown as ReturnType<typeof vi.fn>;
const getStripeClientMock = getStripeClient as unknown as ReturnType<typeof vi.fn>;

type StoreSettingsRow = SiteStripeContext['settings'];

/**
 * Build a `store_settings` row with sensible Connect-mode defaults. Tests
 * override only the fields they care about so each case stays readable.
 */
function mockStoreSettings(overrides: Partial<StoreSettingsRow> = {}): StoreSettingsRow {
  const base = {
    id: 1,
    websiteId: 42,
    enabled: true,
    storeName: 'Test Store',
    currency: 'USD',
    taxRate: '0',
    taxInclusive: false,
    stripeAccountId: 'acct_test_123',
    stripeOnboardingComplete: true,
    stripeMode: 'connect',
    stripeByokAllowed: false,
    stripeSecretKeyEncrypted: null,
    stripePublishableKey: null,
    stripeWebhookSecretEncrypted: null,
    payoutSchedule: 'weekly',
    platformFeePercent: '5.00',
    requiresShipping: true,
    lowStockThreshold: 5,
    orderPrefix: 'ORD',
    enableReviews: true,
    enableCustomerAccounts: true,
    enableGuestCheckout: true,
    enableWishlist: true,
    enableOrderTracking: true,
    enableCustomerSupport: true,
    customerPortalWelcomeMessage: null,
    supportEmail: null,
    returnPolicyUrl: null,
  } as unknown as StoreSettingsRow;
  return { ...base, ...overrides } as StoreSettingsRow;
}

beforeEach(() => {
  dbState.rows = [];
  decryptApiKeyMock.mockReset();
  getStripeClientMock.mockClear();
  getStripeClientMock.mockReturnValue(PLATFORM_CLIENT_SENTINEL);
});

describe('resolveSiteStripe', () => {
  it('throws SiteStripeError(no_settings) when no row found', async () => {
    dbState.rows = [];
    await expect(resolveSiteStripe(42)).rejects.toMatchObject({
      name: 'SiteStripeError',
      code: 'no_settings',
    });
    await expect(resolveSiteStripe(42)).rejects.toBeInstanceOf(SiteStripeError);
  });

  it('connect mode default: returns platform client, stripeAccountId, fee=500bps for "5.00"', async () => {
    dbState.rows = [mockStoreSettings()];
    const ctx = await resolveSiteStripe(42);
    expect(ctx.mode).toBe('connect');
    expect(ctx.stripe).toBe(PLATFORM_CLIENT_SENTINEL);
    expect(ctx.stripeAccountId).toBe('acct_test_123');
    expect(ctx.applicationFeeBps).toBe(500);
    expect(ctx.webhookSecret).toBeNull();
    expect(getStripeClientMock).toHaveBeenCalledTimes(1);
  });

  it('connect mode with platformFeePercent="0.00": applicationFeeBps = 0', async () => {
    dbState.rows = [mockStoreSettings({ platformFeePercent: '0.00' })];
    const ctx = await resolveSiteStripe(42);
    expect(ctx.mode).toBe('connect');
    expect(ctx.applicationFeeBps).toBe(0);
  });

  it('connect mode with null platformFeePercent: applicationFeeBps = null', async () => {
    dbState.rows = [mockStoreSettings({ platformFeePercent: null as unknown as string })];
    const ctx = await resolveSiteStripe(42);
    expect(ctx.mode).toBe('connect');
    expect(ctx.applicationFeeBps).toBeNull();
  });

  it('connect mode with null stripeAccountId: surfaces null (does not throw)', async () => {
    dbState.rows = [
      mockStoreSettings({ stripeAccountId: null, stripeOnboardingComplete: false }),
    ];
    const ctx = await resolveSiteStripe(42);
    expect(ctx.mode).toBe('connect');
    expect(ctx.stripeAccountId).toBeNull();
  });

  it('byok mode with no encrypted key throws SiteStripeError(byok_no_key)', async () => {
    dbState.rows = [
      mockStoreSettings({
        stripeMode: 'byok',
        stripeByokAllowed: true,
        stripeSecretKeyEncrypted: null,
      }),
    ];
    await expect(resolveSiteStripe(42)).rejects.toMatchObject({
      name: 'SiteStripeError',
      code: 'byok_no_key',
    });
    expect(decryptApiKeyMock).not.toHaveBeenCalled();
  });

  it('byok mode with encrypted key: returns NEW Stripe instance built from decrypted secret', async () => {
    decryptApiKeyMock.mockImplementation((cipher: string) => {
      if (cipher === 'ciphertext-secret') return 'sk_test_tenant_secret';
      throw new Error('unexpected ciphertext: ' + cipher);
    });
    dbState.rows = [
      mockStoreSettings({
        stripeMode: 'byok',
        stripeByokAllowed: true,
        stripeSecretKeyEncrypted: 'ciphertext-secret',
        stripeAccountId: null,
      }),
    ];
    const ctx = await resolveSiteStripe(42);
    expect(ctx.mode).toBe('byok');
    expect(ctx.stripe).toBeInstanceOf(Stripe);
    // Not the platform sentinel — must be a fresh tenant-scoped instance.
    expect(ctx.stripe).not.toBe(PLATFORM_CLIENT_SENTINEL);
    expect(ctx.stripeAccountId).toBeNull();
    expect(ctx.applicationFeeBps).toBeNull();
    expect(getStripeClientMock).not.toHaveBeenCalled();
    expect(decryptApiKeyMock).toHaveBeenCalledWith('ciphertext-secret');

    // Second call must yield a DIFFERENT instance (no caching by websiteId).
    const ctx2 = await resolveSiteStripe(42);
    expect(ctx2.stripe).not.toBe(ctx.stripe);
  });

  it('byok mode with encrypted webhook secret: webhookSecret is the decrypted value', async () => {
    decryptApiKeyMock.mockImplementation((cipher: string) => {
      if (cipher === 'ciphertext-secret') return 'sk_test_tenant_secret';
      if (cipher === 'ciphertext-webhook') return 'whsec_tenant_endpoint';
      throw new Error('unexpected ciphertext: ' + cipher);
    });
    dbState.rows = [
      mockStoreSettings({
        stripeMode: 'byok',
        stripeByokAllowed: true,
        stripeSecretKeyEncrypted: 'ciphertext-secret',
        stripeWebhookSecretEncrypted: 'ciphertext-webhook',
      }),
    ];
    const ctx = await resolveSiteStripe(42);
    expect(ctx.mode).toBe('byok');
    expect(ctx.webhookSecret).toBe('whsec_tenant_endpoint');
    expect(decryptApiKeyMock).toHaveBeenCalledWith('ciphertext-webhook');
  });

  it('byok mode with corrupt webhook secret: webhookSecret = null, console.warn called, no throw', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    decryptApiKeyMock.mockImplementation((cipher: string) => {
      if (cipher === 'ciphertext-secret') return 'sk_test_tenant_secret';
      if (cipher === 'ciphertext-webhook-corrupt') throw new Error('auth tag mismatch');
      throw new Error('unexpected ciphertext: ' + cipher);
    });
    dbState.rows = [
      mockStoreSettings({
        stripeMode: 'byok',
        stripeByokAllowed: true,
        stripeSecretKeyEncrypted: 'ciphertext-secret',
        stripeWebhookSecretEncrypted: 'ciphertext-webhook-corrupt',
      }),
    ];
    const ctx = await resolveSiteStripe(42);
    expect(ctx.mode).toBe('byok');
    expect(ctx.webhookSecret).toBeNull();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain('Failed to decrypt webhook secret');
    warnSpy.mockRestore();
  });

  it('byok mode with corrupt secret key (decrypt throws): throws SiteStripeError(byok_decrypt_failed)', async () => {
    decryptApiKeyMock.mockImplementation(() => {
      throw new Error('auth tag mismatch');
    });
    dbState.rows = [
      mockStoreSettings({
        stripeMode: 'byok',
        stripeByokAllowed: true,
        stripeSecretKeyEncrypted: 'ciphertext-secret-corrupt',
      }),
    ];
    await expect(resolveSiteStripe(42)).rejects.toMatchObject({
      name: 'SiteStripeError',
      code: 'byok_decrypt_failed',
    });
  });
});
