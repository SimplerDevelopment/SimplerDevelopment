/**
 * POST/DELETE /api/portal/cards/[id]/dependencies
 *
 * Contract:
 *   POST:
 *     - 401 unauth
 *     - 404 cross-tenant card
 *     - 403 client on agency project (canEdit=false)
 *     - 400 self-blocker / non-numeric blockerCardId
 *     - 400 blocker in different project (cross-project injection)
 *     - 400 reciprocal cycle (B->A then A->B)
 *     - 200 + junction row inserted; idempotent
 *   DELETE:
 *     - 401 unauth
 *     - 400 missing blockerCardId
 *     - 200 + row removed
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../helpers/call-handler';
import {
  sessionForStaff,
  twoTenants,
  type TenantCtx,
} from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

async function seedTwoCards(client: TenantCtx, opts?: { isPrivate?: boolean }) {
  const sql = getTestSql();
  const isPrivate = opts?.isPrivate ?? true;
  const [proj] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.projects (name, client_id, status, is_private, created_by)
    VALUES ('Dep project', ${client.client.id}, 'active', ${isPrivate}, ${client.user.id})
    RETURNING id
  `;
  const [col] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.kanban_columns (project_id, name, "order")
    VALUES (${proj.id}, 'Todo', 0) RETURNING id
  `;
  const [c1] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.kanban_cards (column_id, project_id, title, "order")
    VALUES (${col.id}, ${proj.id}, 'C1', 0) RETURNING id
  `;
  const [c2] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.kanban_cards (column_id, project_id, title, "order")
    VALUES (${col.id}, ${proj.id}, 'C2', 1) RETURNING id
  `;
  return { projectId: proj.id, c1: c1.id, c2: c2.id };
}

describe('POST /api/portal/cards/[id]/dependencies @cards @dependencies', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  let staff: TenantCtx;
  beforeEach(async () => {
    [{ A, B }, staff] = await Promise.all([
      twoTenants(),
      sessionForStaff('agency-deps'),
    ]);
  });

  it('401 unauthenticated', async () => {
    const { c1, c2 } = await seedTwoCards(A);
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/cards/[id]/dependencies/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(c1) }, body: { blockerCardId: c2 } },
    );
    expect(res.status).toBe(401);
  });

  it('404 cross-tenant on the blocked card', async () => {
    const { c1, c2 } = await seedTwoCards(B);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/cards/[id]/dependencies/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(c1) }, body: { blockerCardId: c2 } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const rows = await sql<{ blocked_card_id: number }[]>`
      SELECT blocked_card_id FROM ${sql(TEST_SCHEMA)}.kanban_card_dependencies
      WHERE blocked_card_id = ${c1} AND blocker_card_id = ${c2}
    `;
    expect(rows.length).toBe(0);
  });

  it('403 client on agency project', async () => {
    const { c1, c2 } = await seedTwoCards(A, { isPrivate: false });
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/cards/[id]/dependencies/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(c1) }, body: { blockerCardId: c2 } },
    );
    expect(res.status).toBe(403);
  });

  it('400 when blockerCardId == cardId (self-blocker)', async () => {
    const { c1 } = await seedTwoCards(A);
    mockedAuth.mockResolvedValue(staff.session);
    const route = await import('@/app/api/portal/cards/[id]/dependencies/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(c1) }, body: { blockerCardId: c1 } },
    );
    expect(res.status).toBe(400);
  });

  it('400 when blockerCardId is non-numeric', async () => {
    const { c1 } = await seedTwoCards(A);
    mockedAuth.mockResolvedValue(staff.session);
    const route = await import('@/app/api/portal/cards/[id]/dependencies/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(c1) }, body: { blockerCardId: 'abc' } },
    );
    expect(res.status).toBe(400);
  });

  it('400 when blocker is in a different project', async () => {
    const aFx = await seedTwoCards(A);
    const otherFx = await seedTwoCards(A); // same tenant, different project
    mockedAuth.mockResolvedValue(staff.session);
    const route = await import('@/app/api/portal/cards/[id]/dependencies/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(aFx.c1) }, body: { blockerCardId: otherFx.c1 } },
    );
    expect(res.status).toBe(400);
  });

  it('400 on reciprocal cycle (B->A already exists, A->B is rejected)', async () => {
    const { c1, c2 } = await seedTwoCards(A);
    const sql = getTestSql();
    // c2 already blocks c1
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.kanban_card_dependencies (blocked_card_id, blocker_card_id)
      VALUES (${c1}, ${c2})
    `;
    mockedAuth.mockResolvedValue(staff.session);
    const route = await import('@/app/api/portal/cards/[id]/dependencies/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      // c1 trying to block c2 — would be reciprocal
      { params: { id: String(c2) }, body: { blockerCardId: c1 } },
    );
    expect(res.status).toBe(400);
  });

  it('200 + junction inserted; idempotent on duplicate', async () => {
    const { c1, c2 } = await seedTwoCards(A);
    mockedAuth.mockResolvedValue(staff.session);
    const route = await import('@/app/api/portal/cards/[id]/dependencies/route');

    const r1 = await callHandler<{ success: boolean }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(c1) }, body: { blockerCardId: c2 } },
    );
    expect(r1.status).toBe(200);

    const r2 = await callHandler<{ success: boolean }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(c1) }, body: { blockerCardId: c2 } },
    );
    expect(r2.status).toBe(200);

    const sql = getTestSql();
    const rows = await sql<{ blocked_card_id: number }[]>`
      SELECT blocked_card_id FROM ${sql(TEST_SCHEMA)}.kanban_card_dependencies
      WHERE blocked_card_id = ${c1} AND blocker_card_id = ${c2}
    `;
    expect(rows.length).toBe(1);
  });
});

describe('DELETE /api/portal/cards/[id]/dependencies @cards @dependencies', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  let staff: TenantCtx;
  beforeEach(async () => {
    [{ A, B }, staff] = await Promise.all([
      twoTenants(),
      sessionForStaff('agency-deps-del'),
    ]);
  });

  it('401 unauthenticated', async () => {
    const { c1, c2 } = await seedTwoCards(A);
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/cards/[id]/dependencies/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(c1) }, query: { blockerCardId: String(c2) } },
    );
    expect(res.status).toBe(401);
  });

  it('400 missing blockerCardId', async () => {
    const { c1 } = await seedTwoCards(A);
    mockedAuth.mockResolvedValue(staff.session);
    const route = await import('@/app/api/portal/cards/[id]/dependencies/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(c1) } },
    );
    expect(res.status).toBe(400);
  });

  it('404 cross-tenant: A cannot delete B\'s dep edge', async () => {
    const { c1, c2 } = await seedTwoCards(B);
    const sql = getTestSql();
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.kanban_card_dependencies (blocked_card_id, blocker_card_id)
      VALUES (${c1}, ${c2})
    `;
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/cards/[id]/dependencies/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(c1) }, query: { blockerCardId: String(c2) } },
    );
    expect(res.status).toBe(404);

    const rows = await sql<{ blocked_card_id: number }[]>`
      SELECT blocked_card_id FROM ${sql(TEST_SCHEMA)}.kanban_card_dependencies
      WHERE blocked_card_id = ${c1} AND blocker_card_id = ${c2}
    `;
    expect(rows.length).toBe(1);
  });

  it('200 + edge removed', async () => {
    const { c1, c2 } = await seedTwoCards(A);
    const sql = getTestSql();
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.kanban_card_dependencies (blocked_card_id, blocker_card_id)
      VALUES (${c1}, ${c2})
    `;
    mockedAuth.mockResolvedValue(staff.session);
    const route = await import('@/app/api/portal/cards/[id]/dependencies/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(c1) }, query: { blockerCardId: String(c2) } },
    );
    expect(res.status).toBe(200);

    const rows = await sql<{ blocked_card_id: number }[]>`
      SELECT blocked_card_id FROM ${sql(TEST_SCHEMA)}.kanban_card_dependencies
      WHERE blocked_card_id = ${c1} AND blocker_card_id = ${c2}
    `;
    expect(rows.length).toBe(0);
  });
});
