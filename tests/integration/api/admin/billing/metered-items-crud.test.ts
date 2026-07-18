/**
 * Integration tests for the admin metered-billing CRUD surface.
 *
 *   GET    /api/admin/portal/clients/:id/billing/metered-items
 *   POST   /api/admin/portal/clients/:id/billing/metered-items
 *   PATCH  /api/admin/portal/clients/:id/billing/metered-items/:itemId
 *   DELETE /api/admin/portal/clients/:id/billing/metered-items/:itemId
 *
 * Auth surface: only role ∈ {admin, employee} can hit these. Client users +
 * unauthenticated callers receive 401.
 *
 * Cross-tenant guard: PATCH/DELETE check that the metered item actually
 * belongs to the path-scoped client; mismatched calls return 404 and leave
 * the row untouched. GET is scoped strictly by the path :id, so seeding a
 * row for client B and reading the URL with client A's id MUST NOT surface it.
 *
 * Stripe is mocked at module level — we only exercise the "escape hatch"
 * Path 2 in POST (bring-your-own subscriptionItemId), so no Stripe call is
 * expected. The Path 1 (Stripe-side create) flow is left to the e2e tier.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

// Belt-and-suspenders: mock the stripe module so any accidental network call
// in this spec is loud rather than silent. The CRUD path tested here never
// reaches stripe (Path 2 of POST = local-only persist), but a regression that
// flips it to Path 1 should fail visibly here.
const reportUsageMock = vi.fn();
const createMeteredItemForSubscriptionMock = vi.fn();
vi.mock('@/lib/stripe', () => ({
  reportUsage: (...args: unknown[]) => reportUsageMock(...args),
  createMeteredItemForSubscription: (...args: unknown[]) =>
    createMeteredItemForSubscriptionMock(...args),
}));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../../helpers/call-handler';
import {
  sessionForNewClientUser,
  sessionForStaff,
  type TenantCtx,
} from '../../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../../helpers/test-db';

interface MeteredItemRow {
  id: number;
  client_id: number;
  stripe_subscription_id: string;
  stripe_subscription_item_id: string;
  resource: string;
  unit_price_cents: number;
  included_quantity: string; // numeric → string from postgres
  status: string;
}

async function seedMeteredItem(
  clientId: number,
  overrides: Partial<{
    resource: string;
    unitPriceCents: number;
    includedQuantity: number;
    status: string;
    stripeSubscriptionId: string;
    stripeSubscriptionItemId: string;
  }> = {},
): Promise<number> {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.metered_subscription_items (
      client_id, stripe_subscription_id, stripe_subscription_item_id,
      resource, unit_price_cents, included_quantity, status
    ) VALUES (
      ${clientId},
      ${overrides.stripeSubscriptionId ?? `sub_${Math.random().toString(36).slice(2, 10)}`},
      ${overrides.stripeSubscriptionItemId ?? `si_${Math.random().toString(36).slice(2, 10)}`},
      ${overrides.resource ?? 'hosting_bandwidth_gb'},
      ${overrides.unitPriceCents ?? 5},
      ${(overrides.includedQuantity ?? 0).toString()},
      ${overrides.status ?? 'active'}
    )
    RETURNING id
  `;
  return row.id;
}

beforeEach(() => {
  reportUsageMock.mockReset();
  createMeteredItemForSubscriptionMock.mockReset();
});

// ───────────────────────────── GET (list) ────────────────────────────────────

describe('GET /api/admin/portal/clients/:id/billing/metered-items @admin @billing @metered', () => {
  let staff: TenantCtx;
  let client: TenantCtx;

  beforeEach(async () => {
    [staff, client] = await Promise.all([
      sessionForStaff('mi-list-staff'),
      sessionForNewClientUser('mi-list-client'),
    ]);
  });

  it('returns the configured metered items for the client (200)', async () => {
    const id1 = await seedMeteredItem(client.client.id, { resource: 'hosting_bandwidth_gb' });
    const id2 = await seedMeteredItem(client.client.id, { resource: 'email_send' });

    mockedAuth.mockResolvedValue(staff.session);
    const route = await import('@/app/api/admin/portal/clients/[id]/billing/metered-items/route');
    const res = await callHandler<{
      success: boolean;
      data: Array<{ id: number; resource: string; clientId: number }>;
    }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(client.client.id) } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    const ids = res.data!.data.map(r => r.id).sort();
    expect(ids).toEqual([id1, id2].sort());
    expect(res.data!.data.every(r => r.clientId === client.client.id)).toBe(true);
  });

  it('returns an empty array when the client has no metered items', async () => {
    mockedAuth.mockResolvedValue(staff.session);
    const route = await import('@/app/api/admin/portal/clients/[id]/billing/metered-items/route');
    const res = await callHandler<{ success: boolean; data: unknown[] }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(client.client.id) } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data).toEqual([]);
  });

  it('rejects unauthenticated (401)', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/admin/portal/clients/[id]/billing/metered-items/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(client.client.id) } },
    );
    expect(res.status).toBe(401);
  });

  it('rejects a non-staff (client-role) caller with 401', async () => {
    mockedAuth.mockResolvedValue(client.session);
    const route = await import('@/app/api/admin/portal/clients/[id]/billing/metered-items/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(client.client.id) } },
    );
    expect(res.status).toBe(401);
  });

  it('rejects an invalid client id (400)', async () => {
    mockedAuth.mockResolvedValue(staff.session);
    const route = await import('@/app/api/admin/portal/clients/[id]/billing/metered-items/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: 'not-a-number' } },
    );
    expect(res.status).toBe(400);
  });
});

// ───────────────────────────── POST (create) ─────────────────────────────────

describe('POST /api/admin/portal/clients/:id/billing/metered-items @admin @billing @metered', () => {
  let staff: TenantCtx;
  let client: TenantCtx;

  beforeEach(async () => {
    [staff, client] = await Promise.all([
      sessionForStaff('mi-create-staff'),
      sessionForNewClientUser('mi-create-client'),
    ]);
  });

  it('persists a row when caller supplies stripeSubscriptionItemId directly (Path 2)', async () => {
    mockedAuth.mockResolvedValue(staff.session);
    const route = await import('@/app/api/admin/portal/clients/[id]/billing/metered-items/route');
    const res = await callHandler<{ success: boolean; data: { id: number } }>(
      route as unknown as Record<string, unknown>, 'POST',
      {
        params: { id: String(client.client.id) },
        body: {
          resource: 'hosting_bandwidth_gb',
          unitPriceCents: 5,
          includedQuantity: 50,
          stripeSubscriptionId: 'sub_test_path2',
          stripeSubscriptionItemId: 'si_test_path2',
        },
      },
    );
    expect(res.status).toBe(201);
    expect(res.data?.success).toBe(true);
    expect(typeof res.data?.data.id).toBe('number');
    // No Stripe call expected on Path 2.
    expect(createMeteredItemForSubscriptionMock).not.toHaveBeenCalled();

    // Row really exists in DB.
    const sql = getTestSql();
    const rows = await sql<MeteredItemRow[]>`
      SELECT id, client_id, stripe_subscription_id, stripe_subscription_item_id,
             resource, unit_price_cents, included_quantity, status
      FROM ${sql(TEST_SCHEMA)}.metered_subscription_items
      WHERE id = ${res.data!.data.id}
    `;
    expect(rows.length).toBe(1);
    expect(rows[0].client_id).toBe(client.client.id);
    expect(rows[0].stripe_subscription_item_id).toBe('si_test_path2');
    expect(rows[0].resource).toBe('hosting_bandwidth_gb');
    expect(rows[0].unit_price_cents).toBe(5);
    expect(parseFloat(rows[0].included_quantity)).toBe(50);
    expect(rows[0].status).toBe('active');
  });

  it('rejects body missing resource (400)', async () => {
    mockedAuth.mockResolvedValue(staff.session);
    const route = await import('@/app/api/admin/portal/clients/[id]/billing/metered-items/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      {
        params: { id: String(client.client.id) },
        body: { unitPriceCents: 5, stripeSubscriptionId: 's', stripeSubscriptionItemId: 'si' },
      },
    );
    expect(res.status).toBe(400);
  });

  it('rejects body missing unitPriceCents (400)', async () => {
    mockedAuth.mockResolvedValue(staff.session);
    const route = await import('@/app/api/admin/portal/clients/[id]/billing/metered-items/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      {
        params: { id: String(client.client.id) },
        body: { resource: 'email_send', stripeSubscriptionId: 's', stripeSubscriptionItemId: 'si' },
      },
    );
    expect(res.status).toBe(400);
  });

  it('rejects when neither (priceId+subId) nor (subItemId+subId) supplied (400)', async () => {
    mockedAuth.mockResolvedValue(staff.session);
    const route = await import('@/app/api/admin/portal/clients/[id]/billing/metered-items/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      {
        params: { id: String(client.client.id) },
        body: { resource: 'email_send', unitPriceCents: 1 },
      },
    );
    expect(res.status).toBe(400);
  });

  it('rejects unauthenticated (401)', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/admin/portal/clients/[id]/billing/metered-items/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      {
        params: { id: String(client.client.id) },
        body: { resource: 'email_send', unitPriceCents: 1, stripeSubscriptionId: 's', stripeSubscriptionItemId: 'si' },
      },
    );
    expect(res.status).toBe(401);
  });

  it('rejects a non-staff (client-role) caller with 401', async () => {
    mockedAuth.mockResolvedValue(client.session);
    const route = await import('@/app/api/admin/portal/clients/[id]/billing/metered-items/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      {
        params: { id: String(client.client.id) },
        body: { resource: 'email_send', unitPriceCents: 1, stripeSubscriptionId: 's', stripeSubscriptionItemId: 'si' },
      },
    );
    expect(res.status).toBe(401);
  });
});

// ───────────────────────────── PATCH (status / fields) ───────────────────────

describe('PATCH /api/admin/portal/clients/:id/billing/metered-items/:itemId @admin @billing @metered', () => {
  let staff: TenantCtx;
  let A: TenantCtx;
  let B: TenantCtx;

  beforeEach(async () => {
    [staff, A, B] = await Promise.all([
      sessionForStaff('mi-patch-staff'),
      sessionForNewClientUser('mi-patch-a'),
      sessionForNewClientUser('mi-patch-b'),
    ]);
  });

  it('happy path: pause then resume', async () => {
    const itemId = await seedMeteredItem(A.client.id, { status: 'active' });
    mockedAuth.mockResolvedValue(staff.session);
    const route = await import('@/app/api/admin/portal/clients/[id]/billing/metered-items/[itemId]/route');

    // Pause
    const r1 = await callHandler<{ success: boolean; data: { status: string } }>(
      route as unknown as Record<string, unknown>, 'PATCH',
      {
        params: { id: String(A.client.id), itemId: String(itemId) },
        body: { status: 'paused' },
      },
    );
    expect(r1.status).toBe(200);
    expect(r1.data?.data.status).toBe('paused');

    // Resume
    const r2 = await callHandler<{ success: boolean; data: { status: string } }>(
      route as unknown as Record<string, unknown>, 'PATCH',
      {
        params: { id: String(A.client.id), itemId: String(itemId) },
        body: { status: 'active' },
      },
    );
    expect(r2.status).toBe(200);
    expect(r2.data?.data.status).toBe('active');

    // Verify in DB.
    const sql = getTestSql();
    const [row] = await sql<{ status: string }[]>`
      SELECT status FROM ${sql(TEST_SCHEMA)}.metered_subscription_items WHERE id = ${itemId}
    `;
    expect(row.status).toBe('active');
  });

  it('rejects invalid status values (400)', async () => {
    const itemId = await seedMeteredItem(A.client.id);
    mockedAuth.mockResolvedValue(staff.session);
    const route = await import('@/app/api/admin/portal/clients/[id]/billing/metered-items/[itemId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PATCH',
      {
        params: { id: String(A.client.id), itemId: String(itemId) },
        body: { status: 'wat' },
      },
    );
    expect(res.status).toBe(400);
  });

  it('updates unitPriceCents + includedQuantity', async () => {
    const itemId = await seedMeteredItem(A.client.id, { unitPriceCents: 5, includedQuantity: 50 });
    mockedAuth.mockResolvedValue(staff.session);
    const route = await import('@/app/api/admin/portal/clients/[id]/billing/metered-items/[itemId]/route');
    const res = await callHandler<{
      success: boolean;
      data: { unitPriceCents: number; includedQuantity: string };
    }>(
      route as unknown as Record<string, unknown>, 'PATCH',
      {
        params: { id: String(A.client.id), itemId: String(itemId) },
        body: { unitPriceCents: 7, includedQuantity: 100 },
      },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.unitPriceCents).toBe(7);
    expect(parseFloat(res.data!.data.includedQuantity)).toBe(100);
  });

  it('cross-tenant: A path id with B\'s itemId returns 404 (row preserved)', async () => {
    const itemId = await seedMeteredItem(B.client.id, { status: 'active' });
    mockedAuth.mockResolvedValue(staff.session);
    const route = await import('@/app/api/admin/portal/clients/[id]/billing/metered-items/[itemId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PATCH',
      {
        params: { id: String(A.client.id), itemId: String(itemId) },
        body: { status: 'paused' },
      },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const [row] = await sql<{ status: string }[]>`
      SELECT status FROM ${sql(TEST_SCHEMA)}.metered_subscription_items WHERE id = ${itemId}
    `;
    expect(row.status).toBe('active');
  });

  it('rejects unauthenticated (401)', async () => {
    const itemId = await seedMeteredItem(A.client.id);
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/admin/portal/clients/[id]/billing/metered-items/[itemId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PATCH',
      {
        params: { id: String(A.client.id), itemId: String(itemId) },
        body: { status: 'paused' },
      },
    );
    expect(res.status).toBe(401);
  });

  it('rejects a non-staff caller (401)', async () => {
    const itemId = await seedMeteredItem(A.client.id);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/admin/portal/clients/[id]/billing/metered-items/[itemId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PATCH',
      {
        params: { id: String(A.client.id), itemId: String(itemId) },
        body: { status: 'paused' },
      },
    );
    expect(res.status).toBe(401);
  });
});

// ───────────────────────────── DELETE ────────────────────────────────────────

describe('DELETE /api/admin/portal/clients/:id/billing/metered-items/:itemId @admin @billing @metered', () => {
  let staff: TenantCtx;
  let A: TenantCtx;
  let B: TenantCtx;

  beforeEach(async () => {
    [staff, A, B] = await Promise.all([
      sessionForStaff('mi-del-staff'),
      sessionForNewClientUser('mi-del-a'),
      sessionForNewClientUser('mi-del-b'),
    ]);
  });

  it('happy path: removes the local mapping (200)', async () => {
    const itemId = await seedMeteredItem(A.client.id);
    mockedAuth.mockResolvedValue(staff.session);
    const route = await import('@/app/api/admin/portal/clients/[id]/billing/metered-items/[itemId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(A.client.id), itemId: String(itemId) } },
    );
    expect(res.status).toBe(200);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.metered_subscription_items WHERE id = ${itemId}
    `;
    expect(rows.length).toBe(0);
  });

  it('cross-tenant: A path id with B\'s itemId returns 404 (row preserved)', async () => {
    const itemId = await seedMeteredItem(B.client.id);
    mockedAuth.mockResolvedValue(staff.session);
    const route = await import('@/app/api/admin/portal/clients/[id]/billing/metered-items/[itemId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(A.client.id), itemId: String(itemId) } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.metered_subscription_items WHERE id = ${itemId}
    `;
    expect(rows.length).toBe(1);
  });

  it('rejects unauthenticated (401)', async () => {
    const itemId = await seedMeteredItem(A.client.id);
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/admin/portal/clients/[id]/billing/metered-items/[itemId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(A.client.id), itemId: String(itemId) } },
    );
    expect(res.status).toBe(401);
  });

  it('rejects a non-staff caller (401)', async () => {
    const itemId = await seedMeteredItem(A.client.id);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/admin/portal/clients/[id]/billing/metered-items/[itemId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(A.client.id), itemId: String(itemId) } },
    );
    expect(res.status).toBe(401);
  });
});
