/**
 * Integration tests for portal /api/portal/approvals/bulk-approve and
 * /api/portal/approvals/bulk-reject.
 *
 * Coverage:
 *   - 401 unauthenticated for both verbs.
 *   - 403 for non-owner/non-admin members.
 *   - 400 on empty `ids` array, non-array `ids`, and oversize batches (>25).
 *   - Cross-tenant: A's bulk-approve on B's pending IDs leaves B's rows
 *     untouched and reports them as `skipped` (route never finds them under
 *     A's clientId).
 *   - Bulk-approve happy path: all pending → applied, results array shaped.
 *   - Bulk-reject happy path: all pending → rejected; non-pending entries
 *     are reported as `skipped`.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/mcp/approvals', () => ({
  applyPendingChange: vi.fn().mockResolvedValue({ id: 999, applied: true }),
}));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

async function asTenant(ctx: TenantCtx | null) {
  mockedAuth.mockResolvedValue(ctx?.session ?? null);
}

async function seedPending(
  clientId: number,
  status: 'pending' | 'applied' | 'rejected' = 'pending',
): Promise<number> {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.mcp_pending_changes
      (client_id, entity_type, operation, summary, payload, status)
    VALUES (
      ${clientId}, 'post', 'create', 'bulk',
      ${JSON.stringify({ title: 'X' })}::json, ${status}
    )
    RETURNING id
  `;
  return row.id;
}

async function asMemberOnly(ctx: TenantCtx) {
  const sql = getTestSql();
  const ownerEmail = `bulk-owner-${Date.now()}-${Math.floor(Math.random() * 1e9)}@test.local`;
  const [owner] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.users (name, email, password, role, active)
    VALUES ('owner', ${ownerEmail}, 'x', 'admin', true)
    RETURNING id
  `;
  await sql`UPDATE ${sql(TEST_SCHEMA)}.clients SET user_id = ${owner.id} WHERE id = ${ctx.client.id}`;
  await sql`
    UPDATE ${sql(TEST_SCHEMA)}.client_members
    SET role = 'member'
    WHERE client_id = ${ctx.client.id} AND user_id = ${ctx.user.id}
  `;
}

describe('POST /api/portal/approvals/bulk-approve @approvals @tenancy @bulk', () => {
  let A: TenantCtx;
  let B: TenantCtx;

  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('appr-bulk-a-a'),
      sessionForNewClientUser('appr-bulk-a-b'),
    ]);
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/approvals/bulk-approve/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { ids: [1] } },
    );
    expect(res.status).toBe(401);
  });

  it('rejects non-owner/admin (403)', async () => {
    await asMemberOnly(A);
    await asTenant(A);
    const route = await import('@/app/api/portal/approvals/bulk-approve/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { ids: [1] } },
    );
    expect(res.status).toBe(403);
  });

  it('400 on empty ids', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/approvals/bulk-approve/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { ids: [] } },
    );
    expect(res.status).toBe(400);
  });

  it('400 on non-array ids', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/approvals/bulk-approve/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { ids: 'not-an-array' } },
    );
    expect(res.status).toBe(400);
  });

  it('400 when batch exceeds 25', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/approvals/bulk-approve/route');
    const fakeIds = Array.from({ length: 26 }, (_, i) => i + 1);
    const res = await callHandler<{ message: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { ids: fakeIds } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/25/);
  });

  it('cross-tenant: A\'s bulk-approve on B\'s ids reports skipped, B unchanged', async () => {
    const idB1 = await seedPending(B.client.id);
    const idB2 = await seedPending(B.client.id);
    await asTenant(A);
    const route = await import('@/app/api/portal/approvals/bulk-approve/route');
    const res = await callHandler<{
      success: boolean;
      data: { total: number; applied: number; skipped: number; results: Array<{ id: number; status: string; error?: string }> };
    }>(route as unknown as Record<string, unknown>, 'POST',
      { body: { ids: [idB1, idB2] } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.total).toBe(2);
    expect(res.data?.data.applied).toBe(0);
    expect(res.data?.data.skipped).toBe(2);
    expect(res.data?.data.results.every(r => r.status === 'skipped')).toBe(true);

    const sql = getTestSql();
    const rows = await sql<{ status: string }[]>`
      SELECT status FROM ${sql(TEST_SCHEMA)}.mcp_pending_changes
      WHERE id IN (${idB1}, ${idB2}) ORDER BY id
    `;
    expect(rows.every(r => r.status === 'pending')).toBe(true);
  });

  it('happy path: applies all, returns per-item results', async () => {
    const ids = await Promise.all([
      seedPending(A.client.id),
      seedPending(A.client.id),
      seedPending(A.client.id),
    ]);
    await asTenant(A);
    const route = await import('@/app/api/portal/approvals/bulk-approve/route');
    const res = await callHandler<{
      success: boolean;
      data: { total: number; applied: number; failed: number; skipped: number; results: Array<{ status: string }> };
    }>(route as unknown as Record<string, unknown>, 'POST',
      { body: { ids, note: 'batch ok' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.total).toBe(3);
    expect(res.data?.data.applied).toBe(3);
    expect(res.data?.data.failed).toBe(0);
    expect(res.data?.data.results.every(r => r.status === 'applied')).toBe(true);

    const sql = getTestSql();
    const rows = await sql<{ status: string; review_note: string | null }[]>`
      SELECT status, review_note FROM ${sql(TEST_SCHEMA)}.mcp_pending_changes
      WHERE id = ANY(${ids})
    `;
    expect(rows.every(r => r.status === 'applied' && r.review_note === 'batch ok')).toBe(true);
  });

  it('skips already-applied items with status=skipped', async () => {
    const pending = await seedPending(A.client.id);
    const alreadyApplied = await seedPending(A.client.id, 'applied');
    await asTenant(A);
    const route = await import('@/app/api/portal/approvals/bulk-approve/route');
    const res = await callHandler<{
      data: { applied: number; skipped: number; results: Array<{ id: number; status: string }> };
    }>(route as unknown as Record<string, unknown>, 'POST',
      { body: { ids: [pending, alreadyApplied] } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.applied).toBe(1);
    expect(res.data?.data.skipped).toBe(1);
    const skippedResult = res.data?.data.results.find(r => r.id === alreadyApplied);
    expect(skippedResult?.status).toBe('skipped');
  });
});

describe('POST /api/portal/approvals/bulk-reject @approvals @tenancy @bulk', () => {
  let A: TenantCtx;
  let B: TenantCtx;

  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('appr-bulk-r-a'),
      sessionForNewClientUser('appr-bulk-r-b'),
    ]);
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/approvals/bulk-reject/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { ids: [1] } },
    );
    expect(res.status).toBe(401);
  });

  it('rejects non-owner/admin (403)', async () => {
    await asMemberOnly(A);
    await asTenant(A);
    const route = await import('@/app/api/portal/approvals/bulk-reject/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { ids: [1] } },
    );
    expect(res.status).toBe(403);
  });

  it('400 on empty ids', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/approvals/bulk-reject/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { ids: [] } },
    );
    expect(res.status).toBe(400);
  });

  it('400 when batch exceeds 25', async () => {
    await asTenant(A);
    const route = await import('@/app/api/portal/approvals/bulk-reject/route');
    const fakeIds = Array.from({ length: 26 }, (_, i) => i + 1);
    const res = await callHandler<{ message: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { ids: fakeIds } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/25/);
  });

  it('cross-tenant: A\'s bulk-reject on B\'s ids reports skipped, B unchanged', async () => {
    const idB = await seedPending(B.client.id);
    await asTenant(A);
    const route = await import('@/app/api/portal/approvals/bulk-reject/route');
    const res = await callHandler<{
      data: { rejected: number; skipped: number; results: Array<{ id: number; status: string }> };
    }>(route as unknown as Record<string, unknown>, 'POST',
      { body: { ids: [idB] } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.rejected).toBe(0);
    expect(res.data?.data.skipped).toBe(1);

    const sql = getTestSql();
    const [row] = await sql<{ status: string }[]>`
      SELECT status FROM ${sql(TEST_SCHEMA)}.mcp_pending_changes WHERE id = ${idB}
    `;
    expect(row.status).toBe('pending');
  });

  it('happy path: rejects all pending, returns per-item results', async () => {
    const ids = await Promise.all([
      seedPending(A.client.id),
      seedPending(A.client.id),
    ]);
    await asTenant(A);
    const route = await import('@/app/api/portal/approvals/bulk-reject/route');
    const res = await callHandler<{
      data: { total: number; rejected: number; skipped: number; results: Array<{ status: string }> };
    }>(route as unknown as Record<string, unknown>, 'POST',
      { body: { ids, note: 'all wrong' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.total).toBe(2);
    expect(res.data?.data.rejected).toBe(2);
    expect(res.data?.data.skipped).toBe(0);
    expect(res.data?.data.results.every(r => r.status === 'rejected')).toBe(true);

    const sql = getTestSql();
    const rows = await sql<{ status: string; review_note: string | null }[]>`
      SELECT status, review_note FROM ${sql(TEST_SCHEMA)}.mcp_pending_changes
      WHERE id = ANY(${ids})
    `;
    expect(rows.every(r => r.status === 'rejected' && r.review_note === 'all wrong')).toBe(true);
  });

  it('skips already-rejected items', async () => {
    const pending = await seedPending(A.client.id);
    const alreadyRejected = await seedPending(A.client.id, 'rejected');
    await asTenant(A);
    const route = await import('@/app/api/portal/approvals/bulk-reject/route');
    const res = await callHandler<{
      data: { rejected: number; skipped: number; results: Array<{ id: number; status: string }> };
    }>(route as unknown as Record<string, unknown>, 'POST',
      { body: { ids: [pending, alreadyRejected] } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.rejected).toBe(1);
    expect(res.data?.data.skipped).toBe(1);
    const skipped = res.data?.data.results.find(r => r.id === alreadyRejected);
    expect(skipped?.status).toBe('skipped');
  });
});
