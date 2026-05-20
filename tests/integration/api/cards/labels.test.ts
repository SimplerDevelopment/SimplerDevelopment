/**
 * POST/DELETE /api/portal/cards/[id]/labels
 *
 * Contract:
 *   - 401 unauth
 *   - 404 cross-tenant card
 *   - 403 client user on agency project (canEdit=false)
 *   - 400 missing/invalid labelId on POST
 *   - 400 label belongs to a different project (cross-project label injection)
 *   - 200 + junction insert + idempotent on duplicate POST
 *   - 200 + junction delete + 400 missing labelId on DELETE
 *   - cross-tenant: A cannot attach B's label to A's card (rejected as cross-project)
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
import type { ProjectRole } from '@/lib/portal/project-permissions';

async function seedCardWithLabel(client: TenantCtx, opts?: { clientRole?: ProjectRole }) {
  const sql = getTestSql();
  const clientRole: ProjectRole = opts?.clientRole ?? 'owner';
  const [proj] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.projects (name, client_id, status, created_by)
    VALUES ('LabelTest project', ${client.client.id}, 'active', ${client.user.id})
    RETURNING id
  `;
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.project_members (project_id, user_id, role)
    VALUES (${proj.id}, ${client.user.id}, ${clientRole})
  `;
  const [col] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.kanban_columns (project_id, name, "order")
    VALUES (${proj.id}, 'Todo', 0) RETURNING id
  `;
  const [card] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.kanban_cards (column_id, project_id, title, "order")
    VALUES (${col.id}, ${proj.id}, 'C', 0) RETURNING id
  `;
  const [label] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.kanban_labels (project_id, name, color)
    VALUES (${proj.id}, 'urgent', '#f00') RETURNING id
  `;
  return { projectId: proj.id, cardId: card.id, labelId: label.id };
}

describe('POST /api/portal/cards/[id]/labels @cards @labels', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  let staff: TenantCtx;
  beforeEach(async () => {
    [{ A, B }, staff] = await Promise.all([
      twoTenants(),
      sessionForStaff('agency-labels'),
    ]);
  });

  it('401 unauthenticated', async () => {
    const { cardId, labelId } = await seedCardWithLabel(A);
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/cards/[id]/labels/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(cardId) }, body: { labelId } },
    );
    expect(res.status).toBe(401);
  });

  it('404 cross-tenant: A cannot attach to B\'s card', async () => {
    const { cardId, labelId } = await seedCardWithLabel(B);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/cards/[id]/labels/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(cardId) }, body: { labelId } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const rows = await sql<{ card_id: number }[]>`
      SELECT card_id FROM ${sql(TEST_SCHEMA)}.kanban_card_labels
      WHERE card_id = ${cardId} AND label_id = ${labelId}
    `;
    expect(rows.length).toBe(0);
  });

  it('403 client on agency project (canEdit=false)', async () => {
    const { cardId, labelId } = await seedCardWithLabel(A, { clientRole: 'viewer' });
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/cards/[id]/labels/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(cardId) }, body: { labelId } },
    );
    expect(res.status).toBe(403);
  });

  it('400 when labelId is missing or non-numeric', async () => {
    const { cardId } = await seedCardWithLabel(A);
    mockedAuth.mockResolvedValue(staff.session);
    const route = await import('@/app/api/portal/cards/[id]/labels/route');

    const r1 = await callHandler(route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(cardId) }, body: {} });
    expect(r1.status).toBe(400);

    const r2 = await callHandler(route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(cardId) }, body: { labelId: 'not-a-number' } });
    expect(r2.status).toBe(400);
  });

  it('400 when label belongs to a different project (cross-project)', async () => {
    const me = await seedCardWithLabel(A);
    const other = await seedCardWithLabel(A); // different project but same tenant
    mockedAuth.mockResolvedValue(staff.session);
    const route = await import('@/app/api/portal/cards/[id]/labels/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(me.cardId) }, body: { labelId: other.labelId } },
    );
    expect(res.status).toBe(400);
  });

  it('200 + junction insert; second POST is idempotent', async () => {
    const { cardId, labelId } = await seedCardWithLabel(A);
    mockedAuth.mockResolvedValue(staff.session);
    const route = await import('@/app/api/portal/cards/[id]/labels/route');

    const r1 = await callHandler<{ success: boolean }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(cardId) }, body: { labelId } },
    );
    expect(r1.status).toBe(200);
    expect(r1.data?.success).toBe(true);

    const r2 = await callHandler<{ success: boolean }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(cardId) }, body: { labelId } },
    );
    expect(r2.status).toBe(200);

    const sql = getTestSql();
    const rows = await sql<{ card_id: number }[]>`
      SELECT card_id FROM ${sql(TEST_SCHEMA)}.kanban_card_labels
      WHERE card_id = ${cardId} AND label_id = ${labelId}
    `;
    expect(rows.length).toBe(1);
  });
});

describe('DELETE /api/portal/cards/[id]/labels @cards @labels', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  let staff: TenantCtx;
  beforeEach(async () => {
    [{ A, B }, staff] = await Promise.all([
      twoTenants(),
      sessionForStaff('agency-label-del'),
    ]);
  });

  it('401 unauthenticated', async () => {
    const { cardId, labelId } = await seedCardWithLabel(A);
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/cards/[id]/labels/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { id: String(cardId) }, query: { labelId: String(labelId) } },
    );
    expect(res.status).toBe(401);
  });

  it('400 missing labelId query param', async () => {
    const { cardId } = await seedCardWithLabel(A);
    mockedAuth.mockResolvedValue(staff.session);
    const route = await import('@/app/api/portal/cards/[id]/labels/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { id: String(cardId) } },
    );
    expect(res.status).toBe(400);
  });

  it('404 cross-tenant: A cannot delete from B\'s card', async () => {
    const { cardId, labelId } = await seedCardWithLabel(B);
    // Pre-attach the label so the row exists to "leak"
    const sql = getTestSql();
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.kanban_card_labels (card_id, label_id)
      VALUES (${cardId}, ${labelId})
    `;
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/cards/[id]/labels/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { id: String(cardId) }, query: { labelId: String(labelId) } },
    );
    expect(res.status).toBe(404);

    const rows = await sql<{ card_id: number }[]>`
      SELECT card_id FROM ${sql(TEST_SCHEMA)}.kanban_card_labels
      WHERE card_id = ${cardId} AND label_id = ${labelId}
    `;
    expect(rows.length).toBe(1);
  });

  it('403 client on agency project (canEdit=false)', async () => {
    const { cardId, labelId } = await seedCardWithLabel(A, { clientRole: 'viewer' });
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/cards/[id]/labels/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { id: String(cardId) }, query: { labelId: String(labelId) } },
    );
    expect(res.status).toBe(403);
  });

  it('200 + junction row removed (idempotent on already-removed)', async () => {
    const { cardId, labelId } = await seedCardWithLabel(A);
    const sql = getTestSql();
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.kanban_card_labels (card_id, label_id)
      VALUES (${cardId}, ${labelId})
    `;
    mockedAuth.mockResolvedValue(staff.session);
    const route = await import('@/app/api/portal/cards/[id]/labels/route');

    const r1 = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(cardId) }, query: { labelId: String(labelId) } },
    );
    expect(r1.status).toBe(200);

    const rowsAfter = await sql<{ card_id: number }[]>`
      SELECT card_id FROM ${sql(TEST_SCHEMA)}.kanban_card_labels
      WHERE card_id = ${cardId} AND label_id = ${labelId}
    `;
    expect(rowsAfter.length).toBe(0);

    // Second DELETE — idempotent
    const r2 = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(cardId) }, query: { labelId: String(labelId) } },
    );
    expect(r2.status).toBe(200);
  });
});
