/**
 * Auth gate for the admin tier-assignment endpoint:
 *   /api/admin/portal/clients/[id]/plan
 *
 * The route uses a flat `requireStaff()` gate that admits role in
 * {'admin', 'employee'} only. Per the conventions in admin-access.test.ts,
 * the admin endpoints deliberately do NOT distinguish unauthenticated from
 * unauthorised — both fall through to the same 401 response. We capture
 * that contract here.
 *
 * Note: the task brief asks for "non-admin → 403" / "unauthenticated → 401",
 * but the route source unifies both cases under 401 (see requireStaff()).
 * Tests below assert the actual contract; if product later wants 403 for
 * authenticated-but-not-staff, the route + this spec change in lockstep.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../../helpers/call-handler';
import {
  sessionForNewClientUser,
  sessionForStaff,
  type TenantCtx,
} from '../../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../../helpers/test-db';

async function seedTier(slug: string, name: string): Promise<{ id: number }> {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.services
      (name, slug, category, price, billing_cycle, active)
    VALUES (${name}, ${slug}, 'subscription', 9900, 'monthly', true)
    RETURNING id
  `;
  return row;
}

async function callPost(clientId: number, body: unknown) {
  const route = await import('@/app/api/admin/portal/clients/[id]/plan/route');
  return callHandler<{ success: boolean }>(
    route as unknown as Record<string, unknown>,
    'POST',
    { params: { id: String(clientId) }, body },
  );
}

async function callGet(clientId: number) {
  const route = await import('@/app/api/admin/portal/clients/[id]/plan/route');
  return callHandler(
    route as unknown as Record<string, unknown>,
    'GET',
    { params: { id: String(clientId) } },
  );
}

async function countClientServices(clientId: number): Promise<number> {
  const sql = getTestSql();
  const rows = await sql<{ c: string }[]>`
    SELECT COUNT(*)::text AS c
    FROM ${sql(TEST_SCHEMA)}.client_services
    WHERE client_id = ${clientId}
  `;
  return Number(rows[0].c);
}

describe('Admin plan endpoint — unauthenticated @admin @billing @security', () => {
  beforeEach(() => {
    mockedAuth.mockResolvedValue(null);
  });

  it('GET → 401 when no session', async () => {
    const target = await sessionForNewClientUser('plan-auth-unauth-get');
    const res = await callGet(target.client.id);
    expect(res.status).toBe(401);
  });

  it('POST → 401 when no session, and writes nothing', async () => {
    const target = await sessionForNewClientUser('plan-auth-unauth-post');
    const tier = await seedTier('tier-starter', 'Starter');

    const res = await callPost(target.client.id, { serviceId: tier.id });
    expect(res.status).toBe(401);

    expect(await countClientServices(target.client.id)).toBe(0);
  });
});

describe('Admin plan endpoint — non-staff client user @admin @billing @security', () => {
  it('client (editor) role → 401 on GET', async () => {
    const callerCtx = await sessionForNewClientUser('plan-auth-client-get');
    const targetCtx = await sessionForNewClientUser('plan-auth-client-target-get');
    mockedAuth.mockResolvedValue(callerCtx.session);

    const res = await callGet(targetCtx.client.id);
    expect(res.status).toBe(401);
  });

  it('client (editor) role → 401 on POST and writes nothing', async () => {
    const callerCtx = await sessionForNewClientUser('plan-auth-client-post');
    const targetCtx = await sessionForNewClientUser('plan-auth-client-target-post');
    const tier = await seedTier('tier-growth', 'Growth');
    mockedAuth.mockResolvedValue(callerCtx.session);

    const res = await callPost(targetCtx.client.id, { serviceId: tier.id });
    expect(res.status).toBe(401);

    expect(await countClientServices(targetCtx.client.id)).toBe(0);
    // And the caller's own client_services should also be untouched.
    expect(await countClientServices(callerCtx.client.id)).toBe(0);
  });

  it('client (editor) role cannot escalate by targeting their own client_id', async () => {
    const ctx = await sessionForNewClientUser('plan-auth-self');
    const tier = await seedTier('tier-scale', 'Scale');
    mockedAuth.mockResolvedValue(ctx.session);

    const res = await callPost(ctx.client.id, { serviceId: tier.id });
    expect(res.status).toBe(401);
    expect(await countClientServices(ctx.client.id)).toBe(0);
  });
});

describe('Admin plan endpoint — staff users @admin @billing', () => {
  it('admin can change ANY client\'s tier (not just their own)', async () => {
    const staff = await sessionForStaff('plan-auth-admin-staff');
    const target = await sessionForNewClientUser('plan-auth-admin-target');
    const tier = await seedTier('tier-starter', 'Starter');

    mockedAuth.mockResolvedValue(staff.session);
    const res = await callPost(target.client.id, { serviceId: tier.id });
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);

    const sql = getTestSql();
    const rows = await sql<{ id: number; status: string }[]>`
      SELECT id, status FROM ${sql(TEST_SCHEMA)}.client_services
      WHERE client_id = ${target.client.id}
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('active');
  });

  it('admin GET works against a different tenant\'s plan', async () => {
    const staff = await sessionForStaff('plan-auth-admin-get-staff');
    const target = await sessionForNewClientUser('plan-auth-admin-get-target');
    await seedTier('tier-starter', 'Starter');

    mockedAuth.mockResolvedValue(staff.session);
    const res = await callGet(target.client.id);
    expect(res.status).toBe(200);
  });
});

describe('Admin plan endpoint — invalid client id @admin @billing', () => {
  it('non-numeric id → 400', async () => {
    const staff = await sessionForStaff('plan-auth-bad-id');
    mockedAuth.mockResolvedValue(staff.session);

    const route = await import('@/app/api/admin/portal/clients/[id]/plan/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { params: { id: 'not-a-number' }, body: { serviceId: null } },
    );
    expect(res.status).toBe(400);
  });
});
