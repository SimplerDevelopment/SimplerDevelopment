/**
 * Portal websites — STORE settings (Stripe BYOK) + Stripe connection test.
 *
 * Routes covered:
 *   GET  /api/portal/websites/[siteId]/store/settings   (Stripe BYOK projection)
 *   PUT  /api/portal/websites/[siteId]/store/settings   (Stripe BYOK writes)
 *   POST /api/portal/websites/[siteId]/store/stripe/test (connection test)
 *
 * Focus areas:
 *   - The Stripe secret key is encrypted at rest. The response NEVER carries
 *     the ciphertext or plaintext — only `stripeSecretKeyConfigured` boolean
 *     and `stripeSecretKeyLast4` for UI display.
 *   - Key/webhook/publishable formats are validated (`sk_test_…`, `sk_live_…`,
 *     `pk_test_…`, `pk_live_…`, `whsec_…`).
 *   - `stripeMode='byok'` is admin-gated via `stripeByokAllowed` on the row.
 *   - Connection test surfaces 'not_byok' / 'byok_no_key' / 'auth' codes.
 *
 * Deviation from spec: the Stripe Node SDK v20 uses Node's built-in `http`
 * (not `globalThis.fetch`) so a fetch spy never fires. We instead inject a
 * fake Stripe via `vi.mock('stripe', ...)` — same coverage, different seam.
 */
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { randomBytes } from 'node:crypto';

// The settings PUT path encrypts the key at write time via lib/crypto/api-key,
// which reads ENCRYPTION_KEY from process.env at call time. Set it before any
// module that touches the crypto helper is imported.
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? randomBytes(32).toString('hex');

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

// Stripe SDK is HTTP-via-node-http; we replace the constructor with a fake
// whose `accounts.retrieve()` is driven per-test via a module-scoped handler.
type StripeAccountsRetrieve = () => Promise<unknown>;
const stripeAccountsRetrieveImpl: { fn: StripeAccountsRetrieve | null } = { fn: null };

vi.mock('stripe', async () => {
  // Real Stripe errors so `instanceof Stripe.errors.StripeAuthenticationError`
  // checks in the route still succeed when our fake throws them.
  const actual = await vi.importActual<typeof import('stripe')>('stripe');
  class FakeStripe {
    accounts = {
      retrieve: async () => {
        if (!stripeAccountsRetrieveImpl.fn) {
          throw new Error('stripeAccountsRetrieveImpl.fn not set in test');
        }
        return stripeAccountsRetrieveImpl.fn();
      },
    };
  }
  // Stripe SDK is a default export with `errors` etc. attached.
  const FakeStripeDefault = FakeStripe as unknown as typeof actual.default;
  (FakeStripeDefault as unknown as { errors: typeof actual.default.errors }).errors = actual.default.errors;
  return { default: FakeStripeDefault };
});

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import Stripe from 'stripe';

import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

async function seedSite(ctx: TenantCtx, label = 'site'): Promise<{ siteId: number }> {
  const sql = getTestSql();
  const [s] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.client_websites (client_id, name, domain)
    VALUES (${ctx.client.id}, ${`${label}-${Date.now()}-${Math.random()}`}, ${`${label}-${Date.now()}-${Math.floor(Math.random() * 9999)}.test`})
    RETURNING id
  `;
  return { siteId: s.id };
}

async function setByokAllowed(siteId: number, allowed: boolean) {
  const sql = getTestSql();
  // Upsert: ensure a row exists, then flip the flag.
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.store_settings (website_id, stripe_byok_allowed)
    VALUES (${siteId}, ${allowed})
    ON CONFLICT (website_id) DO UPDATE SET stripe_byok_allowed = ${allowed}
  `;
}

const FIXTURE_SECRET = 'sk_test_abc123';
const FIXTURE_WEBHOOK = 'whsec_signing_secret_fixture';
const FIXTURE_PUBLISHABLE = 'pk_test_publishable_fixture';

describe('GET /api/portal/websites/[siteId]/store/settings — Stripe BYOK projection @websites @store @stripe', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('stripe-byok-get'); });

  it('returns BYOK defaults (mode=connect, allowed=false, configured=false, last4=null) with no config', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);

    const route = await import('@/app/api/portal/websites/[siteId]/store/settings/route');
    const res = await callHandler<{
      success: boolean;
      data: {
        stripeMode: string;
        stripeByokAllowed: boolean;
        stripeSecretKeyConfigured: boolean;
        stripeSecretKeyLast4: string | null;
      };
    }>(route as unknown as Record<string, unknown>, 'GET', {
      params: { siteId: String(siteId) },
    });

    expect(res.status).toBe(200);
    expect(res.data?.data.stripeMode).toBe('connect');
    expect(res.data?.data.stripeByokAllowed).toBe(false);
    expect(res.data?.data.stripeSecretKeyConfigured).toBe(false);
    expect(res.data?.data.stripeSecretKeyLast4).toBeNull();
    // Ciphertext columns must never leak.
    const json = JSON.stringify(res.data);
    expect(json).not.toContain('stripeSecretKeyEncrypted');
    expect(json).not.toContain('stripeWebhookSecretEncrypted');
  });
});

describe('PUT /api/portal/websites/[siteId]/store/settings — Stripe BYOK writes @websites @store @stripe', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('stripe-byok-put'); });

  it('PUT with stripeSecretKeyPlaintext stores encrypted; subsequent GET shows configured + last4', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    const route = await import('@/app/api/portal/websites/[siteId]/store/settings/route');

    const put = await callHandler<{ success: boolean }>(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { siteId: String(siteId) }, body: { stripeSecretKeyPlaintext: FIXTURE_SECRET } },
    );
    expect(put.status).toBe(200);

    // Persisted ciphertext: not plaintext, not null.
    const sql = getTestSql();
    const [row] = await sql<{ stripe_secret_key_encrypted: string | null }[]>`
      SELECT stripe_secret_key_encrypted FROM ${sql(TEST_SCHEMA)}.store_settings WHERE website_id = ${siteId}
    `;
    expect(row.stripe_secret_key_encrypted).toBeTruthy();
    expect(row.stripe_secret_key_encrypted).not.toBe(FIXTURE_SECRET);
    expect(row.stripe_secret_key_encrypted!.includes(FIXTURE_SECRET)).toBe(false);

    const get = await callHandler<{
      success: boolean;
      data: { stripeSecretKeyConfigured: boolean; stripeSecretKeyLast4: string | null };
    }>(route as unknown as Record<string, unknown>, 'GET', { params: { siteId: String(siteId) } });
    expect(get.status).toBe(200);
    expect(get.data?.data.stripeSecretKeyConfigured).toBe(true);
    expect(get.data?.data.stripeSecretKeyLast4).toBe(FIXTURE_SECRET.slice(-4));
    expect(JSON.stringify(get.data)).not.toContain(FIXTURE_SECRET);
  });

  it('PUT with stripeSecretKeyClear:true removes the key', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    const route = await import('@/app/api/portal/websites/[siteId]/store/settings/route');

    await callHandler(route as unknown as Record<string, unknown>, 'PUT', {
      params: { siteId: String(siteId) }, body: { stripeSecretKeyPlaintext: FIXTURE_SECRET },
    });

    const clear = await callHandler<{ success: boolean }>(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { siteId: String(siteId) }, body: { stripeSecretKeyClear: true } },
    );
    expect(clear.status).toBe(200);

    const sql = getTestSql();
    const [row] = await sql<{ stripe_secret_key_encrypted: string | null }[]>`
      SELECT stripe_secret_key_encrypted FROM ${sql(TEST_SCHEMA)}.store_settings WHERE website_id = ${siteId}
    `;
    expect(row.stripe_secret_key_encrypted).toBeNull();

    const get = await callHandler<{ success: boolean; data: { stripeSecretKeyConfigured: boolean } }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { siteId: String(siteId) } },
    );
    expect(get.data?.data.stripeSecretKeyConfigured).toBe(false);
  });

  it('PUT with both clear:true AND plaintext clears the key (precedence) and emits a warning', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    const route = await import('@/app/api/portal/websites/[siteId]/store/settings/route');

    await callHandler(route as unknown as Record<string, unknown>, 'PUT', {
      params: { siteId: String(siteId) }, body: { stripeSecretKeyPlaintext: 'sk_test_old_to_replace' },
    });

    const res = await callHandler<{ success: boolean; warnings?: string[] }>(
      route as unknown as Record<string, unknown>, 'PUT',
      {
        params: { siteId: String(siteId) },
        body: { stripeSecretKeyPlaintext: FIXTURE_SECRET, stripeSecretKeyClear: true },
      },
    );
    expect(res.status).toBe(200);
    expect(res.data?.warnings).toBeDefined();
    expect((res.data?.warnings ?? []).join(' ')).toMatch(/ignored/i);

    const sql = getTestSql();
    const [row] = await sql<{ stripe_secret_key_encrypted: string | null }[]>`
      SELECT stripe_secret_key_encrypted FROM ${sql(TEST_SCHEMA)}.store_settings WHERE website_id = ${siteId}
    `;
    expect(row.stripe_secret_key_encrypted).toBeNull();
  });

  it('400 on bad secret-key format (sk_typo_…)', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    const route = await import('@/app/api/portal/websites/[siteId]/store/settings/route');
    const res = await callHandler<{ success: boolean; message?: string }>(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { siteId: String(siteId) }, body: { stripeSecretKeyPlaintext: 'sk_typo_abc' } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.success).toBe(false);
  });

  it('400 on bad publishable-key format (pk_typo_…)', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    const route = await import('@/app/api/portal/websites/[siteId]/store/settings/route');
    const res = await callHandler<{ success: boolean }>(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { siteId: String(siteId) }, body: { stripePublishableKey: 'pk_typo_abc' } },
    );
    expect(res.status).toBe(400);
  });

  it('400 on bad webhook-secret format (not_whsec)', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    const route = await import('@/app/api/portal/websites/[siteId]/store/settings/route');
    const res = await callHandler<{ success: boolean }>(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { siteId: String(siteId) }, body: { stripeWebhookSecretPlaintext: 'not_whsec' } },
    );
    expect(res.status).toBe(400);
  });

  it('PUT stripeMode=byok with persisted stripeByokAllowed=false → 403', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    // Force a row to exist so the gate sees stripeByokAllowed=false (the default).
    await setByokAllowed(siteId, false);

    const route = await import('@/app/api/portal/websites/[siteId]/store/settings/route');
    const res = await callHandler<{ success: boolean; message?: string }>(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { siteId: String(siteId) }, body: { stripeMode: 'byok' } },
    );
    expect(res.status).toBe(403);
    expect(res.data?.success).toBe(false);
    expect((res.data?.message ?? '').toLowerCase()).toMatch(/admin|byok/);
  });

  it('PUT stripeMode=byok when stripeByokAllowed=true + key configured → accepted, GET shows mode=byok', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    await setByokAllowed(siteId, true);

    const route = await import('@/app/api/portal/websites/[siteId]/store/settings/route');
    // Pre-seed a secret key so the BYOK config is complete.
    const seedKey = await callHandler<{ success: boolean }>(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { siteId: String(siteId) }, body: { stripeSecretKeyPlaintext: FIXTURE_SECRET } },
    );
    expect(seedKey.status).toBe(200);

    const flip = await callHandler<{ success: boolean }>(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { siteId: String(siteId) }, body: { stripeMode: 'byok' } },
    );
    expect(flip.status).toBe(200);

    const get = await callHandler<{
      success: boolean;
      data: { stripeMode: string; stripeByokAllowed: boolean };
    }>(route as unknown as Record<string, unknown>, 'GET',
      { params: { siteId: String(siteId) } },
    );
    expect(get.data?.data.stripeMode).toBe('byok');
    expect(get.data?.data.stripeByokAllowed).toBe(true);
  });
});

describe('POST /api/portal/websites/[siteId]/store/stripe/test — connection test @websites @store @stripe', () => {
  let A: TenantCtx;

  beforeEach(async () => {
    A = await sessionForNewClientUser('stripe-byok-test');
    stripeAccountsRetrieveImpl.fn = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    stripeAccountsRetrieveImpl.fn = null;
  });

  it("400 with code='not_byok' when mode=connect", async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    // Touch settings via GET so the row exists; mode stays 'connect' by default.
    const settings = await import('@/app/api/portal/websites/[siteId]/store/settings/route');
    await callHandler(settings as unknown as Record<string, unknown>, 'GET', {
      params: { siteId: String(siteId) },
    });

    const route = await import('@/app/api/portal/websites/[siteId]/store/stripe/test/route');
    const res = await callHandler<{ success: boolean; code?: string; message?: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { siteId: String(siteId) } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.success).toBe(false);
    expect(res.data?.code).toBe('not_byok');
  });

  it("400 with code='byok_no_key' when mode=byok but no key set", async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    // Force stripeByokAllowed=true + stripeMode='byok' directly without a secret key.
    const sql = getTestSql();
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.store_settings (website_id, stripe_byok_allowed, stripe_mode)
      VALUES (${siteId}, true, 'byok')
      ON CONFLICT (website_id) DO UPDATE SET stripe_byok_allowed = true, stripe_mode = 'byok'
    `;

    const route = await import('@/app/api/portal/websites/[siteId]/store/stripe/test/route');
    const res = await callHandler<{ success: boolean; code?: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { siteId: String(siteId) } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.code).toBe('byok_no_key');
  });

  it('happy path — returns account.id + business_name + flags from mocked Stripe', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    await setByokAllowed(siteId, true);

    const settings = await import('@/app/api/portal/websites/[siteId]/store/settings/route');
    // Configure key + flip mode → byok.
    await callHandler(settings as unknown as Record<string, unknown>, 'PUT', {
      params: { siteId: String(siteId) },
      body: { stripeSecretKeyPlaintext: FIXTURE_SECRET, stripeWebhookSecretPlaintext: FIXTURE_WEBHOOK, stripePublishableKey: FIXTURE_PUBLISHABLE },
    });
    await callHandler(settings as unknown as Record<string, unknown>, 'PUT', {
      params: { siteId: String(siteId) }, body: { stripeMode: 'byok' },
    });

    stripeAccountsRetrieveImpl.fn = async () => ({
      id: 'acct_test',
      business_profile: { name: 'Acme Co' },
      charges_enabled: true,
      payouts_enabled: true,
      default_currency: 'usd',
      country: 'US',
    });

    const route = await import('@/app/api/portal/websites/[siteId]/store/stripe/test/route');
    const res = await callHandler<{
      success: boolean;
      data: {
        account: {
          id: string;
          business_name: string | null;
          charges_enabled: boolean;
          payouts_enabled: boolean;
          default_currency: string;
          country: string;
        };
        webhookConfigured: boolean;
      };
    }>(route as unknown as Record<string, unknown>, 'POST',
      { params: { siteId: String(siteId) } },
    );

    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    expect(res.data?.data.account.id).toBe('acct_test');
    expect(res.data?.data.account.business_name).toBe('Acme Co');
    expect(res.data?.data.account.charges_enabled).toBe(true);
    expect(res.data?.data.account.payouts_enabled).toBe(true);
    expect(res.data?.data.account.default_currency).toBe('usd');
    expect(res.data?.data.account.country).toBe('US');
    expect(res.data?.data.webhookConfigured).toBe(true);
  });

  it("400 with code='auth' when Stripe rejects the key (401)", async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    await setByokAllowed(siteId, true);

    const settings = await import('@/app/api/portal/websites/[siteId]/store/settings/route');
    await callHandler(settings as unknown as Record<string, unknown>, 'PUT', {
      params: { siteId: String(siteId) }, body: { stripeSecretKeyPlaintext: FIXTURE_SECRET },
    });
    await callHandler(settings as unknown as Record<string, unknown>, 'PUT', {
      params: { siteId: String(siteId) }, body: { stripeMode: 'byok' },
    });

    stripeAccountsRetrieveImpl.fn = async () => {
      // Throw a real StripeAuthenticationError so the route's instanceof check
      // matches and maps to { code: 'auth', status: 400 }.
      throw new Stripe.errors.StripeAuthenticationError({
        type: 'invalid_request_error',
        message: 'Invalid API key',
      });
    };

    const route = await import('@/app/api/portal/websites/[siteId]/store/stripe/test/route');
    const res = await callHandler<{ success: boolean; code?: string; message?: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { siteId: String(siteId) } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.success).toBe(false);
    expect(res.data?.code).toBe('auth');
  });
});
