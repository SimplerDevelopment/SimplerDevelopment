/**
 * Integration tests for portal /api/portal/approvals (the queue).
 *
 * Covers:
 *   - GET    /api/portal/approvals          — list with optional filters
 *   - GET    /api/portal/approvals?count    — pending count
 *   - GET    /api/portal/approvals/[id]     — single change detail
 *
 * Asserts: 401 unauth, scope-isolation (B's changes do not appear for A),
 * cross-tenant rejection on detail (404), filter behavior (status,
 * entityType), happy-path payload shape including meta.canManage based on
 * caller role.
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

interface PendingOpts {
  entityType?: string;
  entityId?: number | null;
  operation?: string;
  status?: 'pending' | 'applied' | 'rejected' | 'failed';
  summary?: string;
  payload?: Record<string, unknown>;
  userId?: number | null;
}
async function seedPending(clientId: number, opts: PendingOpts = {}): Promise<number> {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.mcp_pending_changes
      (client_id, user_id, entity_type, entity_id, operation, summary, payload, status)
    VALUES (
      ${clientId},
      ${opts.userId ?? null},
      ${opts.entityType ?? 'post'},
      ${opts.entityId ?? null},
      ${opts.operation ?? 'create'},
      ${opts.summary ?? `Test pending ${Date.now()}`},
      ${JSON.stringify(opts.payload ?? { title: 'X' })}::json,
      ${opts.status ?? 'pending'}
    )
    RETURNING id
  `;
  return row.id;
}

describe('GET /api/portal/approvals @approvals @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;

  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('appr-list-a'),
      sessionForNewClientUser('appr-list-b'),
    ]);
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/approvals/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'GET');
    expect(res.status).toBe(401);
  });

  it('lists only the caller\'s pending changes (scope-isolation)', async () => {
    const aId = await seedPending(A.client.id, { summary: 'A-only' });
    await seedPending(B.client.id, { summary: 'B-only' });

    await asTenant(A);
    const route = await import('@/app/api/portal/approvals/route');
    const res = await callHandler<{
      success: boolean;
      data: Array<{ id: number; summary: string | null }>;
      meta: { role: string; canManage: boolean };
    }>(route as unknown as Record<string, unknown>, 'GET');

    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    expect(Array.isArray(res.data?.data)).toBe(true);
    const ids = res.data!.data.map(r => r.id);
    expect(ids).toContain(aId);
    expect(res.data!.data.every(r => r.summary !== 'B-only')).toBe(true);
  });

  it('exposes meta.canManage=true for owner role', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/approvals/route');
    const res = await callHandler<{
      success: boolean;
      data: unknown[];
      meta: { role: string; canManage: boolean };
    }>(route as unknown as Record<string, unknown>, 'GET');

    expect(res.status).toBe(200);
    expect(res.data?.meta.role).toBe('owner');
    expect(res.data?.meta.canManage).toBe(true);
  });

  it('filters by status query param', async () => {
    await seedPending(A.client.id, { status: 'pending', summary: 'still-pending' });
    await seedPending(A.client.id, { status: 'applied', summary: 'already-applied' });

    await asTenant(A);
    const route = await import('@/app/api/portal/approvals/route');
    const res = await callHandler<{ data: Array<{ status: string; summary: string | null }> }>(
      route as unknown as Record<string, unknown>, 'GET',
      { query: { status: 'applied' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.every(r => r.status === 'applied')).toBe(true);
    expect(res.data?.data.some(r => r.summary === 'still-pending')).toBe(false);
  });

  it('filters by entityType query param', async () => {
    await seedPending(A.client.id, { entityType: 'post', summary: 'a-post' });
    await seedPending(A.client.id, { entityType: 'pitch_deck', summary: 'a-deck' });

    await asTenant(A);
    const route = await import('@/app/api/portal/approvals/route');
    const res = await callHandler<{ data: Array<{ entityType: string }> }>(
      route as unknown as Record<string, unknown>, 'GET',
      { query: { entityType: 'pitch_deck' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.length).toBeGreaterThan(0);
    expect(res.data?.data.every(r => r.entityType === 'pitch_deck')).toBe(true);
  });

  it('count=true returns integer count of pending only (scope-isolated)', async () => {
    await seedPending(A.client.id, { status: 'pending' });
    await seedPending(A.client.id, { status: 'pending' });
    await seedPending(A.client.id, { status: 'applied' }); // ignored
    await seedPending(B.client.id, { status: 'pending' }); // ignored — B's tenant

    await asTenant(A);
    const route = await import('@/app/api/portal/approvals/route');
    const res = await callHandler<{ data: { count: number } }>(
      route as unknown as Record<string, unknown>, 'GET',
      { query: { count: 'true' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.count).toBe(2);
  });
});

describe('GET /api/portal/approvals/[id] @approvals @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  let pendingB: number;

  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('appr-get-a'),
      sessionForNewClientUser('appr-get-b'),
    ]);
    pendingB = await seedPending(B.client.id);
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/approvals/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(pendingB) } },
    );
    expect(res.status).toBe(401);
  });

  it('cross-tenant: A cannot fetch B\'s pending change (404)', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/approvals/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(pendingB) } },
    );
    expect(res.status).toBe(404);
  });

  it('happy path: own pending change with payload', async () => {
    const id = await seedPending(A.client.id, {
      summary: 'Detail-View',
      payload: { title: 'Detail Title', body: 'hello' },
    });
    await asTenant(A);
    const route = await import('@/app/api/portal/approvals/[id]/route');
    const res = await callHandler<{
      success: boolean;
      data: { change: { id: number; payload: { title: string; body: string } }; keyName: string | null };
    }>(route as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(id) } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    expect(res.data?.data.change.id).toBe(id);
    expect(res.data?.data.change.payload.title).toBe('Detail Title');
  });

  it('returns 404 for unknown id', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/approvals/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: '999999' } },
    );
    expect(res.status).toBe(404);
  });
});
