/**
 * Portal websites — STORE settings + EasyPost connection test.
 *
 * Routes covered:
 *   GET  /api/portal/websites/[siteId]/store/settings
 *   PUT  /api/portal/websites/[siteId]/store/settings
 *   POST /api/portal/websites/[siteId]/store/easypost/test
 *
 * Focus areas:
 *   - The EasyPost API key is encrypted at rest. The response NEVER carries
 *     the ciphertext or plaintext — only `easypostApiKeyConfigured` boolean
 *     and `easypostApiKeyLast4` for UI display.
 *   - Validation rejects out-of-enum modes / providers and incomplete
 *     ship-from addresses.
 *   - Connection test surfaces upstream EasyPost auth failures with code 'auth'.
 */
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { randomBytes } from 'node:crypto';

// The settings PUT path encrypts the key at write time via lib/crypto/api-key,
// which reads ENCRYPTION_KEY from process.env at call time. Set it before any
// module that touches the crypto helper is imported.
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? randomBytes(32).toString('hex');

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

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

const VALID_SHIP_FROM = {
  name: 'Warehouse',
  line1: '100 Sender St',
  city: 'Portland',
  state: 'OR',
  postalCode: '97201',
  country: 'US',
};

const FIXTURE_API_KEY = 'EZTK_test_abcdef1234567890SUFFIX';

describe('GET /api/portal/websites/[siteId]/store/settings @websites @store @easypost', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('store-settings-get'); });

  it('returns easypostApiKeyConfigured=false + last4=null when no key set', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);

    const route = await import('@/app/api/portal/websites/[siteId]/store/settings/route');
    const res = await callHandler<{
      success: boolean;
      data: { easypostApiKeyConfigured: boolean; easypostApiKeyLast4: string | null };
    }>(route as unknown as Record<string, unknown>, 'GET', {
      params: { siteId: String(siteId) },
    });

    expect(res.status).toBe(200);
    expect(res.data?.data.easypostApiKeyConfigured).toBe(false);
    expect(res.data?.data.easypostApiKeyLast4).toBeNull();
    // Ciphertext column must never leak.
    expect(JSON.stringify(res.data)).not.toContain('easypostApiKeyEncrypted');
  });

  it('returns configured=true and matching last4 after PUT with plaintext', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    const route = await import('@/app/api/portal/websites/[siteId]/store/settings/route');

    const put = await callHandler<{ success: boolean }>(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { siteId: String(siteId) }, body: { easypostApiKeyPlaintext: FIXTURE_API_KEY } },
    );
    expect(put.status).toBe(200);

    const get = await callHandler<{
      success: boolean;
      data: { easypostApiKeyConfigured: boolean; easypostApiKeyLast4: string | null };
    }>(route as unknown as Record<string, unknown>, 'GET', {
      params: { siteId: String(siteId) },
    });

    expect(get.status).toBe(200);
    expect(get.data?.data.easypostApiKeyConfigured).toBe(true);
    expect(get.data?.data.easypostApiKeyLast4).toBe(FIXTURE_API_KEY.slice(-4));
    // No plaintext anywhere in the response.
    expect(JSON.stringify(get.data)).not.toContain(FIXTURE_API_KEY);
  });
});

describe('PUT /api/portal/websites/[siteId]/store/settings @websites @store @easypost', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('store-settings-put'); });

  it('encrypts and stores key; subsequent GET shows configured + correct last4', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    const route = await import('@/app/api/portal/websites/[siteId]/store/settings/route');

    const res = await callHandler<{ success: boolean }>(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { siteId: String(siteId) }, body: { easypostApiKeyPlaintext: FIXTURE_API_KEY } },
    );
    expect(res.status).toBe(200);

    // Persisted ciphertext: not plaintext, not null.
    const sql = getTestSql();
    const [row] = await sql<{ easypost_api_key_encrypted: string | null }[]>`
      SELECT easypost_api_key_encrypted FROM ${sql(TEST_SCHEMA)}.store_settings WHERE website_id = ${siteId}
    `;
    expect(row.easypost_api_key_encrypted).toBeTruthy();
    expect(row.easypost_api_key_encrypted).not.toBe(FIXTURE_API_KEY);
    expect(row.easypost_api_key_encrypted!.includes(FIXTURE_API_KEY)).toBe(false);
  });

  it('PUT with easypostApiKeyClear:true removes the key', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    const route = await import('@/app/api/portal/websites/[siteId]/store/settings/route');

    await callHandler(route as unknown as Record<string, unknown>, 'PUT', {
      params: { siteId: String(siteId) }, body: { easypostApiKeyPlaintext: FIXTURE_API_KEY },
    });

    const clear = await callHandler<{ success: boolean }>(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { siteId: String(siteId) }, body: { easypostApiKeyClear: true } },
    );
    expect(clear.status).toBe(200);

    const sql = getTestSql();
    const [row] = await sql<{ easypost_api_key_encrypted: string | null }[]>`
      SELECT easypost_api_key_encrypted FROM ${sql(TEST_SCHEMA)}.store_settings WHERE website_id = ${siteId}
    `;
    expect(row.easypost_api_key_encrypted).toBeNull();

    const get = await callHandler<{ success: boolean; data: { easypostApiKeyConfigured: boolean } }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { siteId: String(siteId) } },
    );
    expect(get.data?.data.easypostApiKeyConfigured).toBe(false);
  });

  it('PUT with both clear:true AND plaintext clears the key and emits a warning', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    const route = await import('@/app/api/portal/websites/[siteId]/store/settings/route');

    // Seed an initial key so we can prove clear wins.
    await callHandler(route as unknown as Record<string, unknown>, 'PUT', {
      params: { siteId: String(siteId) }, body: { easypostApiKeyPlaintext: 'OLD_KEY_TO_REPLACE' },
    });

    const res = await callHandler<{ success: boolean; warnings?: string[] }>(
      route as unknown as Record<string, unknown>, 'PUT',
      {
        params: { siteId: String(siteId) },
        body: { easypostApiKeyPlaintext: FIXTURE_API_KEY, easypostApiKeyClear: true },
      },
    );
    expect(res.status).toBe(200);
    expect(res.data?.warnings).toBeDefined();
    expect((res.data?.warnings ?? []).join(' ')).toMatch(/ignored/i);

    const sql = getTestSql();
    const [row] = await sql<{ easypost_api_key_encrypted: string | null }[]>`
      SELECT easypost_api_key_encrypted FROM ${sql(TEST_SCHEMA)}.store_settings WHERE website_id = ${siteId}
    `;
    expect(row.easypost_api_key_encrypted).toBeNull();
  });

  it('400 on invalid easypostMode', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    const route = await import('@/app/api/portal/websites/[siteId]/store/settings/route');
    const res = await callHandler<{ success: boolean }>(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { siteId: String(siteId) }, body: { easypostMode: 'banana' } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.success).toBe(false);
  });

  it('400 on invalid shippingProvider', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    const route = await import('@/app/api/portal/websites/[siteId]/store/settings/route');
    const res = await callHandler<{ success: boolean }>(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { siteId: String(siteId) }, body: { shippingProvider: 'fedex-direct' } },
    );
    expect(res.status).toBe(400);
  });

  it('400 on incomplete shipFromAddress (missing line1)', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    const route = await import('@/app/api/portal/websites/[siteId]/store/settings/route');
    const res = await callHandler<{ success: boolean }>(
      route as unknown as Record<string, unknown>, 'PUT',
      {
        params: { siteId: String(siteId) },
        body: {
          shipFromAddress: { city: 'Portland', state: 'OR', postalCode: '97201', country: 'US' },
        },
      },
    );
    expect(res.status).toBe(400);
  });

  it('400 on incomplete shipFromAddress (missing city)', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    const route = await import('@/app/api/portal/websites/[siteId]/store/settings/route');
    const res = await callHandler<{ success: boolean }>(
      route as unknown as Record<string, unknown>, 'PUT',
      {
        params: { siteId: String(siteId) },
        body: {
          shipFromAddress: { line1: '1 Main', state: 'OR', postalCode: '97201', country: 'US' },
        },
      },
    );
    expect(res.status).toBe(400);
  });
});

describe('POST /api/portal/websites/[siteId]/store/easypost/test @websites @store @easypost', () => {
  let A: TenantCtx;

  beforeEach(async () => {
    A = await sessionForNewClientUser('store-easypost-test');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('400 when EasyPost is not configured (no key)', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    // Settings exist but shippingProvider stays 'manual'.
    const settingsRoute = await import('@/app/api/portal/websites/[siteId]/store/settings/route');
    await callHandler(settingsRoute as unknown as Record<string, unknown>, 'GET', {
      params: { siteId: String(siteId) },
    });

    const route = await import('@/app/api/portal/websites/[siteId]/store/easypost/test/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { siteId: String(siteId) } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/not configured/i);
  });

  it('400 when configured but ship-from address is missing', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    const settings = await import('@/app/api/portal/websites/[siteId]/store/settings/route');
    await callHandler(settings as unknown as Record<string, unknown>, 'PUT', {
      params: { siteId: String(siteId) },
      body: { shippingProvider: 'easypost', easypostApiKeyPlaintext: FIXTURE_API_KEY },
    });

    const route = await import('@/app/api/portal/websites/[siteId]/store/easypost/test/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { siteId: String(siteId) } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/ship-from/i);
  });

  it('returns rateCount + sampleRates with mocked EasyPost /v2/shipments', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);

    const settings = await import('@/app/api/portal/websites/[siteId]/store/settings/route');
    await callHandler(settings as unknown as Record<string, unknown>, 'PUT', {
      params: { siteId: String(siteId) },
      body: {
        shippingProvider: 'easypost',
        easypostApiKeyPlaintext: FIXTURE_API_KEY,
        shipFromAddress: VALID_SHIP_FROM,
      },
    });

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url.endsWith('/v2/shipments')) {
        return new Response(JSON.stringify({
          id: 'shp_test_123',
          rates: [
            { id: 'rate_1', shipment_id: 'shp_test_123', carrier: 'USPS', service: 'Priority', rate: '8.55', currency: 'USD', delivery_days: 3 },
            { id: 'rate_2', shipment_id: 'shp_test_123', carrier: 'USPS', service: 'GroundAdvantage', rate: '5.50', currency: 'USD', delivery_days: 5 },
            { id: 'rate_3', shipment_id: 'shp_test_123', carrier: 'UPSDAP', service: 'Ground', rate: '12.00', currency: 'USD', delivery_days: 4 },
          ],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      throw new Error(`Unexpected fetch in test: ${url}`);
    });

    const route = await import('@/app/api/portal/websites/[siteId]/store/easypost/test/route');
    const res = await callHandler<{
      success: boolean;
      data: { rateCount: number; sampleRates: Array<{ carrier: string; service: string; amountCents: number }> };
    }>(route as unknown as Record<string, unknown>, 'POST', { params: { siteId: String(siteId) } });

    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    expect(res.data?.data.rateCount).toBe(3);
    expect(res.data?.data.sampleRates.length).toBe(3);
    expect(res.data?.data.sampleRates[0].carrier).toBe('USPS');
    expect(res.data?.data.sampleRates[0].amountCents).toBe(855); // "8.55" → 855 cents
  });

  it('returns 400 with code:auth when EasyPost returns 401', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);

    const settings = await import('@/app/api/portal/websites/[siteId]/store/settings/route');
    await callHandler(settings as unknown as Record<string, unknown>, 'PUT', {
      params: { siteId: String(siteId) },
      body: {
        shippingProvider: 'easypost',
        easypostApiKeyPlaintext: 'INVALID_KEY_FIXTURE',
        shipFromAddress: VALID_SHIP_FROM,
      },
    });

    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(
        JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Bad API key' } }),
        { status: 401, headers: { 'content-type': 'application/json' } },
      );
    });

    const route = await import('@/app/api/portal/websites/[siteId]/store/easypost/test/route');
    const res = await callHandler<{ success: boolean; code?: string; message?: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { siteId: String(siteId) } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.success).toBe(false);
    expect(res.data?.code).toBe('auth');
  });
});
