/**
 * Portal websites — STORE Stripe Connect onboarding (POST + GET).
 *
 * Stripe API calls hit api.stripe.com — handled by MSW handlers in
 * tests/helpers/api-mocks.ts (stripeHandlers cover /v1/accounts,
 * /v1/account_links, and GET /v1/accounts/:id).
 *
 * Cross-site rejection: A cannot trigger Stripe onboarding under B's siteId.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

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

beforeEach(() => {
  // Stripe SDK reads STRIPE_SECRET_KEY at construction time.
  process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_mock_for_integration_tests';
  process.env.NEXT_PUBLIC_URL = process.env.NEXT_PUBLIC_URL || 'http://localhost:3000';
});

describe('POST /api/portal/websites/[siteId]/store/stripe-connect @websites @store', () => {
  let A: TenantCtx;

  beforeEach(async () => { A = await sessionForNewClientUser('store-stripe-create'); });

  it('401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const { siteId } = await seedSite(A);
    const route = await import('@/app/api/portal/websites/[siteId]/store/stripe-connect/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { siteId: String(siteId) }, body: {} },
    );
    expect(res.status).toBe(401);
  });

  it('happy path — creates Stripe account + account-link, persists accountId', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    const route = await import('@/app/api/portal/websites/[siteId]/store/stripe-connect/route');
    const res = await callHandler<{ success: boolean; data: { url: string; accountId: string } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { siteId: String(siteId) }, body: {} },
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    expect(res.data?.data.url).toContain('connect.stripe.test');
    expect(res.data?.data.accountId).toBe('acct_test_mock');

    // Verify storeSettings row was created and stripeAccountId stored
    const sql = getTestSql();
    const [settings] = await sql<{ stripe_account_id: string | null }[]>`
      SELECT stripe_account_id FROM ${sql(TEST_SCHEMA)}.store_settings WHERE website_id = ${siteId}
    `;
    expect(settings.stripe_account_id).toBe('acct_test_mock');
  });

  it('reuses existing accountId on second call (idempotent onboarding)', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    // Pre-seed an existing stripeAccountId
    const sql = getTestSql();
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.store_settings (website_id, stripe_account_id)
      VALUES (${siteId}, 'acct_existing_123')
    `;
    const route = await import('@/app/api/portal/websites/[siteId]/store/stripe-connect/route');
    const res = await callHandler<{ success: boolean; data: { accountId: string } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { siteId: String(siteId) }, body: {} },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.accountId).toBe('acct_existing_123');
  });

  it('cross-site rejection — A cannot start Stripe onboarding under B\'s siteId', async () => {
    const B = await sessionForNewClientUser('store-stripe-create-b');
    const { siteId: bSite } = await seedSite(B);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/websites/[siteId]/store/stripe-connect/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { siteId: String(bSite) }, body: {} },
    );
    expect(res.status).toBe(404);

    // No store_settings row should have been created for B's site as a side effect of A's call
    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.store_settings WHERE website_id = ${bSite}
    `;
    expect(rows.length).toBe(0);
  });
});

describe('GET /api/portal/websites/[siteId]/store/stripe-connect @websites @store', () => {
  let A: TenantCtx;

  beforeEach(async () => { A = await sessionForNewClientUser('store-stripe-status'); });

  it('returns disconnected when no stripeAccountId is set', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    const route = await import('@/app/api/portal/websites/[siteId]/store/stripe-connect/route');
    const res = await callHandler<{ success: boolean; data: { connected: boolean } }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { siteId: String(siteId) } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.connected).toBe(false);
  });

  it('returns connected status when stripeAccountId exists (live retrieve via mock)', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const { siteId } = await seedSite(A);
    const sql = getTestSql();
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.store_settings (website_id, stripe_account_id)
      VALUES (${siteId}, 'acct_connected_xyz')
    `;
    const route = await import('@/app/api/portal/websites/[siteId]/store/stripe-connect/route');
    const res = await callHandler<{
      success: boolean;
      data: { connected: boolean; onboardingComplete: boolean; accountId: string };
    }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { siteId: String(siteId) } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.connected).toBe(true);
    expect(res.data?.data.onboardingComplete).toBe(true);
    expect(res.data?.data.accountId).toBe('acct_connected_xyz');
  });

  it('cross-site rejection — A cannot read B\'s Stripe status', async () => {
    const B = await sessionForNewClientUser('store-stripe-status-b');
    const { siteId: bSite } = await seedSite(B);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/websites/[siteId]/store/stripe-connect/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { siteId: String(bSite) } },
    );
    expect(res.status).toBe(404);
  });
});
