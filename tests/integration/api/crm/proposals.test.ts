/**
 * Integration tests for portal CRM proposals routes.
 *
 * Covers:
 *   - POST  /api/portal/crm/proposals          — create
 *   - PUT   /api/portal/crm/proposals/[id]     — update
 *   - DELETE /api/portal/crm/proposals/[id]    — delete
 *
 * The public (token-based) proposal viewer is already covered by
 * tests/integration/api/crm-proposals.test.ts — this file is the portal-side
 * complement.
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

async function seedProposal(clientId: number, title = 'P') {
  const sql = getTestSql();
  const token = crypto.randomBytes(32).toString('hex');
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.crm_proposals (client_id, title, status, client_token)
    VALUES (${clientId}, ${title}, 'draft', ${token})
    RETURNING id
  `;
  return row.id;
}

describe('POST /api/portal/crm/proposals @crm @tenancy', () => {
  let A: TenantCtx;

  beforeEach(async () => {
    A = await sessionForNewClientUser('prop-post');
  });

  it('happy path: creates proposal under caller tenant (201)', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/proposals/route');
    const res = await callHandler<{ success: boolean; data: { id: number; clientId: number; status: string } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { title: 'My Proposal' } },
    );
    expect(res.status).toBe(201);
    expect(res.data?.data.clientId).toBe(A.client.id);
    expect(res.data?.data.status).toBe('draft');
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/crm/proposals/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { title: 'X' } },
    );
    expect(res.status).toBe(401);
  });

  it('rejects empty title with 400', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/proposals/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { title: '   ' } },
    );
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/portal/crm/proposals/[id] @crm @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  let propB: number;

  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('prop-put-a'),
      sessionForNewClientUser('prop-put-b'),
    ]);
    propB = await seedProposal(B.client.id, 'B-Owned');
  });

  it('happy path: edits own proposal (200)', async () => {
    const id = await seedProposal(A.client.id);
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/proposals/[id]/route');
    const res = await callHandler<{ success: boolean; data: { title: string } }>(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { id: String(id) }, body: { title: 'Updated Title' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.title).toBe('Updated Title');
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/crm/proposals/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { id: String(propB) }, body: { title: 'X' } },
    );
    expect(res.status).toBe(401);
  });

  it('cross-tenant: A cannot edit B\'s proposal (404, preserved)', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/proposals/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { id: String(propB) }, body: { title: 'Hijack' } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const [row] = await sql<{ title: string }[]>`
      SELECT title FROM ${sql(TEST_SCHEMA)}.crm_proposals WHERE id = ${propB}
    `;
    expect(row.title).toBe('B-Owned');
  });

  it('returns 400 for non-numeric id', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/proposals/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { id: 'abc' }, body: { title: 'X' } },
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when proposal missing', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/proposals/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { id: '99999' }, body: { title: 'X' } },
    );
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/portal/crm/proposals/[id] @crm @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;

  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('prop-del-a'),
      sessionForNewClientUser('prop-del-b'),
    ]);
  });

  it('happy path: deletes own proposal (200)', async () => {
    const id = await seedProposal(A.client.id);
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/proposals/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(id) } },
    );
    expect(res.status).toBe(200);
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/crm/proposals/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: '1' } },
    );
    expect(res.status).toBe(401);
  });

  it('cross-tenant: A cannot delete B\'s proposal (404, preserved)', async () => {
    const id = await seedProposal(B.client.id, 'B-Preserve');
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/proposals/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(id) } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.crm_proposals WHERE id = ${id}
    `;
    expect(rows.length).toBe(1);
  });

  it('returns 404 when proposal missing', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/crm/proposals/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: '888888' } },
    );
    expect(res.status).toBe(404);
  });
});
