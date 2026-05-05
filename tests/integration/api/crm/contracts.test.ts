/**
 * Integration tests for portal CRM contracts routes.
 *
 * DELETE now enforces auth + tenant scope and returns proper status codes
 * (401 unauthenticated, 404 missing-or-cross-tenant). Cross-tenant tests
 * assert on status AND on DB-row preservation.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import crypto from 'node:crypto';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

async function asTenant(ctx: TenantCtx | null) {
  mockedAuth.mockResolvedValue(ctx?.session ?? null);
}

async function seedContract(clientId: number, title = 'C') {
  const sql = getTestSql();
  const token = crypto.randomBytes(32).toString('hex');
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.crm_contracts (client_id, title, status, client_token)
    VALUES (${clientId}, ${title}, 'draft', ${token})
    RETURNING id
  `;
  return row.id;
}

describe('POST /api/portal/crm/contracts @crm @tenancy', () => {
  let A: TenantCtx;

  beforeEach(async () => {
    A = await sessionForNewClientUser('contracts-post');
  });

  it('happy path: creates contract under caller tenant (201)', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/contracts/route');
    const res = await callHandler<{ success: boolean; data: { id: number; clientId: number } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { title: 'MSA' } },
    );
    expect(res.status).toBe(201);
    expect(res.data?.data.clientId).toBe(A.client.id);
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/crm/contracts/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { title: 'X' } },
    );
    expect(res.status).toBe(401);
  });

  it('rejects empty title with 400', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/contracts/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { title: '   ' } },
    );
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/portal/crm/contracts/[id] @crm @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  let contractB: number;

  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('contracts-put-a'),
      sessionForNewClientUser('contracts-put-b'),
    ]);
    contractB = await seedContract(B.client.id, 'B-Contract');
  });

  it('happy path: edits own contract (200)', async () => {
    const id = await seedContract(A.client.id);
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/contracts/[id]/route');
    const res = await callHandler<{ success: boolean; data: { title: string } }>(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { id: String(id) }, body: { title: 'Updated' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.title).toBe('Updated');
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/crm/contracts/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { id: String(contractB) }, body: { title: 'X' } },
    );
    expect(res.status).toBe(401);
  });

  it('cross-tenant: A cannot edit B\'s contract (404, preserved)', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/contracts/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { id: String(contractB) }, body: { title: 'Hijack' } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const [row] = await sql<{ title: string }[]>`
      SELECT title FROM ${sql(TEST_SCHEMA)}.crm_contracts WHERE id = ${contractB}
    `;
    expect(row.title).toBe('B-Contract');
  });

  it('returns 404 for missing contract', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/contracts/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { id: '99999' }, body: { title: 'X' } },
    );
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/portal/crm/contracts/[id] @crm @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;

  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('contracts-del-a'),
      sessionForNewClientUser('contracts-del-b'),
    ]);
  });

  it('happy path: deletes own contract', async () => {
    const id = await seedContract(A.client.id);
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/contracts/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(id) } },
    );
    expect(res.status).toBe(200);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.crm_contracts WHERE id = ${id}
    `;
    expect(rows.length).toBe(0);
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/crm/contracts/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: '1' } },
    );
    expect(res.status).toBe(401);
  });

  it('cross-tenant: A cannot delete B\'s contract (404, preserved)', async () => {
    const id = await seedContract(B.client.id, 'Preserve-Me');
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/contracts/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(id) } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const rows = await sql<{ id: number; title: string }[]>`
      SELECT id, title FROM ${sql(TEST_SCHEMA)}.crm_contracts WHERE id = ${id}
    `;
    expect(rows.length).toBe(1);
    expect(rows[0].title).toBe('Preserve-Me');
  });

  it('returns 404 for missing contract', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/contracts/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: '99999' } },
    );
    expect(res.status).toBe(404);
  });
});
