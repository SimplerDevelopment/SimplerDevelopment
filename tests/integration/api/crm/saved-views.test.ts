/**
 * Integration tests for portal CRM saved-views routes.
 *
 * Covers:
 *   - POST   /api/portal/crm/saved-views
 *   - PUT    /api/portal/crm/saved-views/[id]
 *   - DELETE /api/portal/crm/saved-views/[id]
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

async function asTenant(ctx: TenantCtx | null) {
  mockedAuth.mockResolvedValue(ctx?.session ?? null);
}

async function seedView(clientId: number, name = 'Vw') {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.crm_saved_views (client_id, entity_type, name, filters)
    VALUES (${clientId}, 'contact', ${name}, '{"status":"lead"}'::jsonb)
    RETURNING id
  `;
  return row.id;
}

describe('POST /api/portal/crm/saved-views @crm @tenancy', () => {
  let A: TenantCtx;

  beforeEach(async () => {
    A = await sessionForNewClientUser('sv-post');
  });

  it('happy path: creates view under caller tenant (201)', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/saved-views/route');
    const res = await callHandler<{ success: boolean; data: { id: number; clientId: number } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { name: 'My Leads', entityType: 'contact', filters: { status: 'lead' } } },
    );
    expect(res.status).toBe(201);
    expect(res.data?.data.clientId).toBe(A.client.id);
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/crm/saved-views/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { name: 'X', entityType: 'contact', filters: {} } },
    );
    expect(res.status).toBe(401);
  });

  it('rejects missing name (400)', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/saved-views/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { entityType: 'contact', filters: {} } },
    );
    expect(res.status).toBe(400);
  });

  it('rejects missing entityType (400)', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/saved-views/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { name: 'X', filters: {} } },
    );
    expect(res.status).toBe(400);
  });

  it('rejects missing filters (400)', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/saved-views/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { name: 'X', entityType: 'contact' } },
    );
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/portal/crm/saved-views/[id] @crm @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  let viewB: number;

  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('sv-put-a'),
      sessionForNewClientUser('sv-put-b'),
    ]);
    viewB = await seedView(B.client.id, 'B-View');
  });

  it('happy path: edits own view (200)', async () => {
    const id = await seedView(A.client.id);
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/saved-views/[id]/route');
    const res = await callHandler<{ success: boolean; data: { name: string } }>(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { id: String(id) }, body: { name: 'Renamed View' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.name).toBe('Renamed View');
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/crm/saved-views/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { id: String(viewB) }, body: { name: 'X' } },
    );
    expect(res.status).toBe(401);
  });

  it('cross-tenant: A cannot edit B\'s view (404, preserved)', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/saved-views/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { id: String(viewB) }, body: { name: 'Hijack' } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const [row] = await sql<{ name: string }[]>`
      SELECT name FROM ${sql(TEST_SCHEMA)}.crm_saved_views WHERE id = ${viewB}
    `;
    expect(row.name).toBe('B-View');
  });

  it('returns 400 for invalid id', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/saved-views/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { id: 'abc' }, body: { name: 'X' } },
    );
    expect(res.status).toBe(400);
  });

  it('rejects empty payload (400)', async () => {
    const id = await seedView(A.client.id);
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/saved-views/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { id: String(id) }, body: {} },
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 for missing view', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/saved-views/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { id: '99999' }, body: { name: 'X' } },
    );
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/portal/crm/saved-views/[id] @crm @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;

  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('sv-del-a'),
      sessionForNewClientUser('sv-del-b'),
    ]);
  });

  it('happy path: deletes own view (200)', async () => {
    const id = await seedView(A.client.id);
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/saved-views/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(id) } },
    );
    expect(res.status).toBe(200);
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/crm/saved-views/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: '1' } },
    );
    expect(res.status).toBe(401);
  });

  it('cross-tenant: A cannot delete B\'s view (404, preserved)', async () => {
    const id = await seedView(B.client.id);
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/saved-views/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(id) } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.crm_saved_views WHERE id = ${id}
    `;
    expect(rows.length).toBe(1);
  });

  it('returns 404 for missing view', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/saved-views/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: '99999' } },
    );
    expect(res.status).toBe(404);
  });
});
