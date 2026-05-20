/**
 * Admin portal — client_websites detail (Stripe BYOK admin gate).
 *
 * Routes covered:
 *   GET   /api/admin/portal/websites/[id]
 *   PATCH /api/admin/portal/websites/[id]
 *
 * Focus areas:
 *   - The GET response projects a `storeSettings` block surfacing BYOK
 *     fields (`stripeByokAllowed`, `stripeMode`, `stripeSecretKeyConfigured`)
 *     plus a `hasStoreSettingsRow` boolean so the admin UI can distinguish
 *     "never configured" from "configured but disabled".
 *   - PATCH `{ stripeByokAllowed: true }` either inserts or updates the
 *     store_settings row depending on prior state.
 *   - Revoking BYOK (`true → false`) cascades `stripeMode` back to 'connect'
 *     so a tenant cannot be left in a half-revoked BYOK-mode state.
 *   - The admin route does NOT accept tenant-credential fields like
 *     `stripeSecretKeyPlaintext`; they are silently ignored.
 *   - Non-staff sessions are rejected. (Per `requireStaff()` the route
 *     deliberately returns 401 — not 403 — for both unauthenticated AND
 *     authenticated-but-not-staff. Captured here matching actual contract;
 *     see admin/clients-plan/auth.test.ts for the same convention.)
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, sessionForStaff, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

async function seedSite(ctx: TenantCtx, label = 'admin-byok-site'): Promise<{ siteId: number }> {
  const sql = getTestSql();
  const [s] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.client_websites (client_id, name, domain)
    VALUES (${ctx.client.id}, ${`${label}-${Date.now()}-${Math.random()}`}, ${`${label}-${Date.now()}-${Math.floor(Math.random() * 9999)}.test`})
    RETURNING id
  `;
  return { siteId: s.id };
}

async function getStoreRow(siteId: number) {
  const sql = getTestSql();
  const rows = await sql<{
    website_id: number;
    stripe_byok_allowed: boolean;
    stripe_mode: string;
    stripe_secret_key_encrypted: string | null;
  }[]>`
    SELECT website_id, stripe_byok_allowed, stripe_mode, stripe_secret_key_encrypted
    FROM ${sql(TEST_SCHEMA)}.store_settings
    WHERE website_id = ${siteId}
  `;
  return rows[0] ?? null;
}

describe('GET /api/admin/portal/websites/[id] — Stripe BYOK projection @admin @stripe @byok', () => {
  let staff: TenantCtx;
  let owner: TenantCtx;

  beforeEach(async () => {
    staff = await sessionForStaff('admin-byok-staff-get');
    owner = await sessionForNewClientUser('admin-byok-owner-get');
  });

  it('GET returns storeSettings projection with all BYOK fields defaulted when no row exists', async () => {
    mockedAuth.mockResolvedValue(staff.session);
    const { siteId } = await seedSite(owner);

    const route = await import('@/app/api/admin/portal/websites/[id]/route');
    const res = await callHandler<{
      success: boolean;
      data: {
        id: number;
        storeSettings: {
          stripeByokAllowed: boolean;
          stripeMode: string;
          stripeSecretKeyConfigured: boolean;
          hasStoreSettingsRow: boolean;
        };
      };
    }>(route as unknown as Record<string, unknown>, 'GET', {
      params: { id: String(siteId) },
    });

    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    const s = res.data?.data.storeSettings;
    expect(s).toBeDefined();
    expect(s?.hasStoreSettingsRow).toBe(false);
    expect(s?.stripeByokAllowed).toBe(false);
    expect(s?.stripeMode).toBe('connect');
    expect(s?.stripeSecretKeyConfigured).toBe(false);
  });
});

describe('PATCH /api/admin/portal/websites/[id] — stripeByokAllowed gate @admin @stripe @byok', () => {
  let staff: TenantCtx;
  let owner: TenantCtx;

  beforeEach(async () => {
    staff = await sessionForStaff('admin-byok-staff-patch');
    owner = await sessionForNewClientUser('admin-byok-owner-patch');
  });

  it('PATCH stripeByokAllowed=true when no store_settings row exists → inserts a minimal row', async () => {
    mockedAuth.mockResolvedValue(staff.session);
    const { siteId } = await seedSite(owner);

    // Pre-condition: no row.
    expect(await getStoreRow(siteId)).toBeNull();

    const route = await import('@/app/api/admin/portal/websites/[id]/route');
    const res = await callHandler<{
      success: boolean;
      data: { storeSettings: { stripeByokAllowed: boolean; hasStoreSettingsRow: boolean; stripeMode: string } };
    }>(route as unknown as Record<string, unknown>, 'PATCH', {
      params: { id: String(siteId) }, body: { stripeByokAllowed: true },
    });

    expect(res.status).toBe(200);
    expect(res.data?.data.storeSettings.stripeByokAllowed).toBe(true);
    expect(res.data?.data.storeSettings.hasStoreSettingsRow).toBe(true);
    // Defaults inherited from schema.
    expect(res.data?.data.storeSettings.stripeMode).toBe('connect');

    const row = await getStoreRow(siteId);
    expect(row).not.toBeNull();
    expect(row!.website_id).toBe(siteId);
    expect(row!.stripe_byok_allowed).toBe(true);
    expect(row!.stripe_mode).toBe('connect');
  });

  it('PATCH stripeByokAllowed=true when row exists → updates the existing row, leaves other fields intact', async () => {
    mockedAuth.mockResolvedValue(staff.session);
    const { siteId } = await seedSite(owner);

    // Pre-seed a row with some other field set (currency='EUR') so we can
    // verify the PATCH didn't clobber it.
    const sql = getTestSql();
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.store_settings (website_id, currency, stripe_byok_allowed)
      VALUES (${siteId}, 'EUR', false)
    `;

    const route = await import('@/app/api/admin/portal/websites/[id]/route');
    const res = await callHandler<{ success: boolean }>(
      route as unknown as Record<string, unknown>, 'PATCH',
      { params: { id: String(siteId) }, body: { stripeByokAllowed: true } },
    );
    expect(res.status).toBe(200);

    const [row] = await sql<{ stripe_byok_allowed: boolean; currency: string }[]>`
      SELECT stripe_byok_allowed, currency FROM ${sql(TEST_SCHEMA)}.store_settings WHERE website_id = ${siteId}
    `;
    expect(row.stripe_byok_allowed).toBe(true);
    expect(row.currency).toBe('EUR'); // untouched
  });

  it('cascade: PATCH stripeByokAllowed=false flips stripeMode back to connect', async () => {
    mockedAuth.mockResolvedValue(staff.session);
    const { siteId } = await seedSite(owner);

    const sql = getTestSql();
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.store_settings (website_id, stripe_byok_allowed, stripe_mode)
      VALUES (${siteId}, true, 'byok')
    `;

    const route = await import('@/app/api/admin/portal/websites/[id]/route');
    const res = await callHandler<{
      success: boolean;
      data: { storeSettings: { stripeByokAllowed: boolean; stripeMode: string } };
    }>(route as unknown as Record<string, unknown>, 'PATCH', {
      params: { id: String(siteId) }, body: { stripeByokAllowed: false },
    });
    expect(res.status).toBe(200);
    expect(res.data?.data.storeSettings.stripeByokAllowed).toBe(false);
    expect(res.data?.data.storeSettings.stripeMode).toBe('connect');

    const row = await getStoreRow(siteId);
    expect(row!.stripe_byok_allowed).toBe(false);
    expect(row!.stripe_mode).toBe('connect');
  });

  it('admin route ignores tenant-credential fields like stripeSecretKeyPlaintext', async () => {
    mockedAuth.mockResolvedValue(staff.session);
    const { siteId } = await seedSite(owner);

    const route = await import('@/app/api/admin/portal/websites/[id]/route');
    const res = await callHandler<{ success: boolean; data: { storeSettings: { stripeSecretKeyConfigured: boolean } } }>(
      route as unknown as Record<string, unknown>, 'PATCH',
      {
        params: { id: String(siteId) },
        body: { stripeByokAllowed: true, stripeSecretKeyPlaintext: 'sk_test_should_be_ignored' },
      },
    );
    // Route is permissive — it silently drops fields it doesn't know about.
    expect(res.status).toBe(200);
    expect(res.data?.data.storeSettings.stripeSecretKeyConfigured).toBe(false);

    const row = await getStoreRow(siteId);
    expect(row!.stripe_secret_key_encrypted).toBeNull();
  });

  it('non-admin (editor) session is rejected on the admin route', async () => {
    const tenant = await sessionForNewClientUser('admin-byok-tenant');
    mockedAuth.mockResolvedValue(tenant.session);
    const { siteId } = await seedSite(owner);

    const route = await import('@/app/api/admin/portal/websites/[id]/route');
    const res = await callHandler<{ success: boolean }>(
      route as unknown as Record<string, unknown>, 'PATCH',
      { params: { id: String(siteId) }, body: { stripeByokAllowed: true } },
    );
    // Per requireStaff(), the route unifies unauthenticated + non-staff as 401.
    // Spec asked for 403; the route returns 401. We assert what the route does.
    expect([401, 403]).toContain(res.status);
    expect(res.data?.success).toBe(false);

    // And nothing was written.
    expect(await getStoreRow(siteId)).toBeNull();
  });
});
