/**
 * GET/POST /api/portal/cards/[id]/checklist
 *
 * NOTE: the recon listed PATCH and DELETE on this route, but the route file
 * exports only GET and POST. PATCH/DELETE for individual checklist items would
 * belong to a /[itemId]/route.ts which does not exist in the tree. We test
 * what's there.
 *
 * Contract:
 *   GET:
 *     - 401 unauth
 *     - 404 cross-tenant card
 *     - 200 + items array (existing items returned in order)
 *   POST:
 *     - 401 unauth
 *     - 404 cross-tenant card
 *     - 403 client on agency project (canEdit=false)
 *     - 400 missing or empty text
 *     - 201 + item inserted with order = max+1
 *     - text trimmed and capped at 500 chars
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

async function seedCard(client: TenantCtx, clientRole: ProjectRole = 'owner') {
  const sql = getTestSql();
  const [proj] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.projects (name, client_id, status, created_by)
    VALUES ('Checklist project', ${client.client.id}, 'active', ${client.user.id})
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
  return { projectId: proj.id, cardId: card.id };
}

describe('GET /api/portal/cards/[id]/checklist @cards @checklist', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  beforeEach(async () => { ({ A, B } = await twoTenants()); });

  it('401 unauthenticated', async () => {
    const { cardId } = await seedCard(A);
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/cards/[id]/checklist/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(cardId) } },
    );
    expect(res.status).toBe(401);
  });

  it('404 cross-tenant', async () => {
    const { cardId } = await seedCard(B);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/cards/[id]/checklist/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(cardId) } },
    );
    expect(res.status).toBe(404);
  });

  it('200 + items returned in order', async () => {
    const { cardId } = await seedCard(A);
    const sql = getTestSql();
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.kanban_card_checklist_items (card_id, text, "order")
      VALUES (${cardId}, 'second', 1), (${cardId}, 'first', 0)
    `;
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/cards/[id]/checklist/route');
    const res = await callHandler<{ success: boolean; data: Array<{ text: string; order: number }> }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(cardId) } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    expect(res.data?.data?.map(i => i.text)).toEqual(['first', 'second']);
  });
});

describe('POST /api/portal/cards/[id]/checklist @cards @checklist', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  let staff: TenantCtx;
  beforeEach(async () => {
    [{ A, B }, staff] = await Promise.all([
      twoTenants(),
      sessionForStaff('agency-checklist'),
    ]);
  });

  it('401 unauthenticated', async () => {
    const { cardId } = await seedCard(A);
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/cards/[id]/checklist/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(cardId) }, body: { text: 'do thing' } },
    );
    expect(res.status).toBe(401);
  });

  it('404 cross-tenant', async () => {
    const { cardId } = await seedCard(B);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/cards/[id]/checklist/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(cardId) }, body: { text: 'leak' } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.kanban_card_checklist_items WHERE card_id = ${cardId}
    `;
    expect(rows.length).toBe(0);
  });

  it('403 client on agency project', async () => {
    const { cardId } = await seedCard(A, 'viewer');
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/cards/[id]/checklist/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(cardId) }, body: { text: 'agency-block' } },
    );
    expect(res.status).toBe(403);
  });

  it('400 when text missing or empty', async () => {
    const { cardId } = await seedCard(A);
    mockedAuth.mockResolvedValue(staff.session);
    const route = await import('@/app/api/portal/cards/[id]/checklist/route');

    const r1 = await callHandler(route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(cardId) }, body: {} });
    expect(r1.status).toBe(400);

    const r2 = await callHandler(route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(cardId) }, body: { text: '   ' } });
    expect(r2.status).toBe(400);
  });

  it('201 + first item gets order=0; subsequent items increment', async () => {
    const { cardId } = await seedCard(A);
    mockedAuth.mockResolvedValue(staff.session);
    const route = await import('@/app/api/portal/cards/[id]/checklist/route');

    const r1 = await callHandler<{ success: boolean; data: { id: number; order: number; text: string } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(cardId) }, body: { text: 'first' } },
    );
    expect(r1.status).toBe(201);
    expect(r1.data?.data?.order).toBe(0);

    const r2 = await callHandler<{ data: { order: number } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(cardId) }, body: { text: 'second' } },
    );
    expect(r2.status).toBe(201);
    expect(r2.data?.data?.order).toBe(1);

    const sql = getTestSql();
    const rows = await sql<{ text: string; order: number }[]>`
      SELECT text, "order" FROM ${sql(TEST_SCHEMA)}.kanban_card_checklist_items
      WHERE card_id = ${cardId} ORDER BY "order"
    `;
    expect(rows.map(r => r.text)).toEqual(['first', 'second']);
  });

  it('text is trimmed and capped to 500 chars', async () => {
    const { cardId } = await seedCard(A);
    mockedAuth.mockResolvedValue(staff.session);
    const route = await import('@/app/api/portal/cards/[id]/checklist/route');

    const huge = '  ' + 'x'.repeat(700) + '  ';
    const res = await callHandler<{ data: { text: string } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(cardId) }, body: { text: huge } },
    );
    expect(res.status).toBe(201);
    // Trimmed first, then sliced to 500
    expect(res.data?.data?.text.length).toBe(500);
    expect(res.data?.data?.text.startsWith('x')).toBe(true);
  });
});
