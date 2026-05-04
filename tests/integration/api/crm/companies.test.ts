/**
 * Integration tests for portal CRM companies routes.
 *
 * Covers:
 *   - POST /api/portal/crm/companies            — create
 *   - PUT  /api/portal/crm/companies/[id]       — update
 *   - DELETE /api/portal/crm/companies/[id]     — delete
 *
 * For each mutation the tests assert: happy path, 401 unauthenticated,
 * cross-tenant rejection (the load-bearing tenancy contract), 400 bad input,
 * and 404 on missing target. PATCH is not exposed by this route family — the
 * canonical update verb here is PUT.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

// Geocode is called inside the route on POST/PUT when an address is set;
// stub it out so tests are deterministic and offline.
vi.mock('@/lib/geocode', () => ({ geocodeAddress: vi.fn().mockResolvedValue(null) }));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

async function asTenant(ctx: TenantCtx | null) {
  mockedAuth.mockResolvedValue(ctx?.session ?? null);
}

async function seedCompany(clientId: number, name = 'Seed Co') {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.crm_companies (client_id, name)
    VALUES (${clientId}, ${name})
    RETURNING id
  `;
  return row.id;
}

describe('POST /api/portal/crm/companies @crm @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;

  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('comp-a'),
      sessionForNewClientUser('comp-b'),
    ]);
  });

  it('creates a company under the caller\'s tenant (201)', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/companies/route');
    const res = await callHandler<{ success: boolean; data: { id: number; clientId: number; name: string } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { name: 'Acme Inc.' } },
    );
    expect(res.status).toBe(201);
    expect(res.data?.success).toBe(true);
    expect(res.data?.data.clientId).toBe(A.client.id);
    expect(res.data?.data.name).toBe('Acme Inc.');

    const sql = getTestSql();
    const [row] = await sql<{ client_id: number }[]>`
      SELECT client_id FROM ${sql(TEST_SCHEMA)}.crm_companies WHERE id = ${res.data!.data.id}
    `;
    expect(row.client_id).toBe(A.client.id);
    // Must NOT have leaked into B's tenant.
    expect(row.client_id).not.toBe(B.client.id);
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/crm/companies/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { name: 'X' } },
    );
    expect(res.status).toBe(401);
  });

  it('rejects missing name with 400', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/companies/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { name: '' } },
    );
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/portal/crm/companies/[id] @crm @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  let companyB: number;

  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('comp-put-a'),
      sessionForNewClientUser('comp-put-b'),
    ]);
    companyB = await seedCompany(B.client.id, 'B-Owned Co');
  });

  it('happy path: tenant edits own company (200)', async () => {
    const myId = await seedCompany(A.client.id);
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/companies/[id]/route');
    const res = await callHandler<{ success: boolean; data: { name: string } }>(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { id: String(myId) }, body: { name: 'Renamed' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    expect(res.data?.data.name).toBe('Renamed');
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/crm/companies/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { id: String(companyB) }, body: { name: 'X' } },
    );
    expect(res.status).toBe(401);
  });

  it('cross-tenant: A cannot mutate B\'s company (404 + DB untouched)', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/companies/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { id: String(companyB) }, body: { name: 'Hijacked' } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const [row] = await sql<{ name: string }[]>`
      SELECT name FROM ${sql(TEST_SCHEMA)}.crm_companies WHERE id = ${companyB}
    `;
    expect(row.name).toBe('B-Owned Co');
  });

  it('returns 400 for non-numeric id', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/companies/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { id: 'not-a-number' }, body: { name: 'X' } },
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when target does not exist for caller', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/companies/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { id: '999999' }, body: { name: 'X' } },
    );
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/portal/crm/companies/[id] @crm @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;

  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('comp-del-a'),
      sessionForNewClientUser('comp-del-b'),
    ]);
  });

  it('happy path: deletes own company (200)', async () => {
    const id = await seedCompany(A.client.id);
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/companies/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(id) } },
    );
    expect(res.status).toBe(200);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.crm_companies WHERE id = ${id}
    `;
    expect(rows.length).toBe(0);
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/crm/companies/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: '1' } },
    );
    expect(res.status).toBe(401);
  });

  it('cross-tenant: A cannot delete B\'s company (404, row preserved)', async () => {
    const id = await seedCompany(B.client.id);
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/companies/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(id) } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.crm_companies WHERE id = ${id}
    `;
    expect(rows.length).toBe(1);
  });

  it('returns 404 when target id is unknown', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/companies/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: '888888' } },
    );
    expect(res.status).toBe(404);
  });
});
