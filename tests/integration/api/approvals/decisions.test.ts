/**
 * Integration tests for portal /api/portal/approvals/[id]/approve and
 * /api/portal/approvals/[id]/reject.
 *
 * Coverage:
 *   - 401 unauthenticated for both verbs.
 *   - 403 for non-owner / non-admin members (e.g. plain 'member' role).
 *   - 404 cross-tenant: A cannot decide on B's pending change.
 *   - 400 when status is no longer 'pending' (already applied/rejected).
 *   - Approve happy-path: row transitions to 'applied' (we mock the
 *     `applyPendingChange` dispatcher so the test doesn't need to know
 *     about post/site/email tables that change shape over time).
 *   - Reject happy-path: row transitions to 'rejected', no apply happens.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

// The approve route calls `applyPendingChange` to actually re-execute the
// staged mutation. That dispatcher is exhaustively tested via e2e — here we
// just need a stub that doesn't blow up when given a fake row.
vi.mock('@/lib/mcp/approvals', () => ({
  applyPendingChange: vi.fn().mockResolvedValue({ id: 12345, applied: true }),
}));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

async function asTenant(ctx: TenantCtx | null) {
  mockedAuth.mockResolvedValue(ctx?.session ?? null);
}

interface PendingOpts {
  status?: 'pending' | 'applied' | 'rejected' | 'failed';
  entityType?: string;
}
async function seedPending(clientId: number, opts: PendingOpts = {}): Promise<number> {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.mcp_pending_changes
      (client_id, entity_type, operation, summary, payload, status)
    VALUES (
      ${clientId},
      ${opts.entityType ?? 'post'},
      'create',
      'pending change',
      ${JSON.stringify({ title: 'X' })}::json,
      ${opts.status ?? 'pending'}
    )
    RETURNING id
  `;
  return row.id;
}

/**
 * Promote an existing tenant user to plain 'member' role on their client.
 * This exercises the canManage=false branch in approve/reject.
 *
 * Strategy: drop the auto-created 'owner' clientMembers row, demote the
 * client's userId to a different unrelated user, and re-add the original
 * user as 'member'. That way `getPortalRole` resolves 'member' (not
 * 'owner').
 */
async function asMemberOnly(ctx: TenantCtx) {
  const sql = getTestSql();
  // Make a placeholder owner so the clients row still resolves.
  const ownerEmail = `owner-${Date.now()}-${Math.floor(Math.random() * 1e9)}@test.local`;
  const [owner] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.users (name, email, password, role, active)
    VALUES ('owner', ${ownerEmail}, 'x', 'admin', true)
    RETURNING id
  `;
  await sql`UPDATE ${sql(TEST_SCHEMA)}.clients SET user_id = ${owner.id} WHERE id = ${ctx.client.id}`;
  // Re-point the membership row to 'member'.
  await sql`
    UPDATE ${sql(TEST_SCHEMA)}.client_members
    SET role = 'member'
    WHERE client_id = ${ctx.client.id} AND user_id = ${ctx.user.id}
  `;
}

describe('POST /api/portal/approvals/[id]/approve @approvals @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;

  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('appr-approve-a'),
      sessionForNewClientUser('appr-approve-b'),
    ]);
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/approvals/[id]/approve/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: '1' }, body: {} },
    );
    expect(res.status).toBe(401);
  });

  it('rejects non-owner/admin role (403)', async () => {
    await asMemberOnly(A);
    const id = await seedPending(A.client.id);
    await asTenant(A);
    const route = await import('@/app/api/portal/approvals/[id]/approve/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(id) }, body: {} },
    );
    expect(res.status).toBe(403);
  });

  it('cross-tenant: A cannot approve B\'s pending change (404, status preserved)', async () => {
    const idB = await seedPending(B.client.id);
    await asTenant(A);
    const route = await import('@/app/api/portal/approvals/[id]/approve/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(idB) }, body: {} },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const [row] = await sql<{ status: string }[]>`
      SELECT status FROM ${sql(TEST_SCHEMA)}.mcp_pending_changes WHERE id = ${idB}
    `;
    expect(row.status).toBe('pending');
  });

  it('400 when target is no longer pending', async () => {
    const id = await seedPending(A.client.id, { status: 'applied' });
    await asTenant(A);
    const route = await import('@/app/api/portal/approvals/[id]/approve/route');
    const res = await callHandler<{ message: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(id) }, body: {} },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/applied/i);
  });

  it('happy path: marks change as applied and writes review fields', async () => {
    const id = await seedPending(A.client.id);
    await asTenant(A);
    const route = await import('@/app/api/portal/approvals/[id]/approve/route');
    const res = await callHandler<{
      success: boolean;
      data: { change: { id: number; status: string; reviewNote: string | null } };
    }>(route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(id) }, body: { note: 'lgtm' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    expect(res.data?.data.change.status).toBe('applied');
    expect(res.data?.data.change.reviewNote).toBe('lgtm');

    const sql = getTestSql();
    const [row] = await sql<{ status: string; reviewer_id: number | null; applied_at: Date | null }[]>`
      SELECT status, reviewer_id, applied_at
      FROM ${sql(TEST_SCHEMA)}.mcp_pending_changes WHERE id = ${id}
    `;
    expect(row.status).toBe('applied');
    expect(row.reviewer_id).toBe(A.user.id);
    expect(row.applied_at).not.toBeNull();
  });
});

describe('POST /api/portal/approvals/[id]/reject @approvals @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;

  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('appr-reject-a'),
      sessionForNewClientUser('appr-reject-b'),
    ]);
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/approvals/[id]/reject/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: '1' }, body: {} },
    );
    expect(res.status).toBe(401);
  });

  it('rejects non-owner/admin role (403)', async () => {
    await asMemberOnly(A);
    const id = await seedPending(A.client.id);
    await asTenant(A);
    const route = await import('@/app/api/portal/approvals/[id]/reject/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(id) }, body: {} },
    );
    expect(res.status).toBe(403);
  });

  it('cross-tenant: A cannot reject B\'s pending change (404, status preserved)', async () => {
    const idB = await seedPending(B.client.id);
    await asTenant(A);
    const route = await import('@/app/api/portal/approvals/[id]/reject/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(idB) }, body: {} },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const [row] = await sql<{ status: string }[]>`
      SELECT status FROM ${sql(TEST_SCHEMA)}.mcp_pending_changes WHERE id = ${idB}
    `;
    expect(row.status).toBe('pending');
  });

  it('400 when target is no longer pending', async () => {
    const id = await seedPending(A.client.id, { status: 'rejected' });
    await asTenant(A);
    const route = await import('@/app/api/portal/approvals/[id]/reject/route');
    const res = await callHandler<{ message: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(id) }, body: {} },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/rejected/i);
  });

  it('happy path: marks change as rejected with review note', async () => {
    const id = await seedPending(A.client.id);
    await asTenant(A);
    const route = await import('@/app/api/portal/approvals/[id]/reject/route');
    const res = await callHandler<{
      success: boolean;
      data: { id: number; status: string; reviewNote: string | null };
    }>(route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(id) }, body: { note: 'not needed' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    expect(res.data?.data.status).toBe('rejected');
    expect(res.data?.data.reviewNote).toBe('not needed');

    const sql = getTestSql();
    const [row] = await sql<{ status: string; reviewer_id: number | null; applied_at: Date | null }[]>`
      SELECT status, reviewer_id, applied_at
      FROM ${sql(TEST_SCHEMA)}.mcp_pending_changes WHERE id = ${id}
    `;
    expect(row.status).toBe('rejected');
    expect(row.reviewer_id).toBe(A.user.id);
    expect(row.applied_at).toBeNull();
  });
});
