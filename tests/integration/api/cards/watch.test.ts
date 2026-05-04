/**
 * POST/DELETE /api/portal/cards/[id]/watch
 *
 * Contract:
 *   - 401 unauth
 *   - 404 cross-tenant card
 *   - 200 + watcher inserted on POST (idempotent)
 *   - 200 + watcher removed on DELETE (idempotent)
 *
 * Note: this route was renamed in the recon as "watchers" but lives at /watch.
 * Endpoint reads (not edits) the project, so canEdit gating doesn't apply.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../helpers/call-handler';
import { twoTenants, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

async function seedCard(client: TenantCtx) {
  const sql = getTestSql();
  const [proj] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.projects (name, client_id, status, is_private, created_by)
    VALUES ('Watch project', ${client.client.id}, 'active', true, ${client.user.id})
    RETURNING id
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

describe('POST /api/portal/cards/[id]/watch @cards @watch', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  beforeEach(async () => { ({ A, B } = await twoTenants()); });

  it('401 unauthenticated', async () => {
    const { cardId } = await seedCard(A);
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/cards/[id]/watch/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(cardId) } },
    );
    expect(res.status).toBe(401);
  });

  it('404 cross-tenant', async () => {
    const { cardId } = await seedCard(B);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/cards/[id]/watch/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(cardId) } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const rows = await sql<{ user_id: number }[]>`
      SELECT user_id FROM ${sql(TEST_SCHEMA)}.kanban_card_watchers
      WHERE card_id = ${cardId} AND user_id = ${A.user.id}
    `;
    expect(rows.length).toBe(0);
  });

  it('404 for non-existent card', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/cards/[id]/watch/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: '999999999' } },
    );
    expect(res.status).toBe(404);
  });

  it('200 + watcher row inserted; second POST is idempotent', async () => {
    const { cardId } = await seedCard(A);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/cards/[id]/watch/route');

    const r1 = await callHandler<{ success: boolean; watching: boolean }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(cardId) } },
    );
    expect(r1.status).toBe(200);
    expect(r1.data?.success).toBe(true);
    expect(r1.data?.watching).toBe(true);

    const r2 = await callHandler<{ watching: boolean }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(cardId) } },
    );
    expect(r2.status).toBe(200);

    const sql = getTestSql();
    const rows = await sql<{ user_id: number }[]>`
      SELECT user_id FROM ${sql(TEST_SCHEMA)}.kanban_card_watchers WHERE card_id = ${cardId}
    `;
    expect(rows.length).toBe(1);
    expect(rows[0].user_id).toBe(A.user.id);
  });
});

describe('DELETE /api/portal/cards/[id]/watch @cards @watch', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  beforeEach(async () => { ({ A, B } = await twoTenants()); });

  it('401 unauthenticated', async () => {
    const { cardId } = await seedCard(A);
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/cards/[id]/watch/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(cardId) } },
    );
    expect(res.status).toBe(401);
  });

  it('404 cross-tenant: A cannot remove watch on B\'s card', async () => {
    const { cardId } = await seedCard(B);
    // Seed a watcher on B's card, set as B.user
    const sql = getTestSql();
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.kanban_card_watchers (card_id, user_id)
      VALUES (${cardId}, ${B.user.id})
    `;
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/cards/[id]/watch/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(cardId) } },
    );
    expect(res.status).toBe(404);

    const rows = await sql<{ user_id: number }[]>`
      SELECT user_id FROM ${sql(TEST_SCHEMA)}.kanban_card_watchers WHERE card_id = ${cardId}
    `;
    expect(rows.length).toBe(1);
  });

  it('200 + watcher row removed; idempotent when already removed', async () => {
    const { cardId } = await seedCard(A);
    const sql = getTestSql();
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.kanban_card_watchers (card_id, user_id)
      VALUES (${cardId}, ${A.user.id})
    `;
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/cards/[id]/watch/route');

    const r1 = await callHandler<{ watching: boolean }>(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(cardId) } },
    );
    expect(r1.status).toBe(200);
    expect(r1.data?.watching).toBe(false);

    const after = await sql<{ user_id: number }[]>`
      SELECT user_id FROM ${sql(TEST_SCHEMA)}.kanban_card_watchers WHERE card_id = ${cardId}
    `;
    expect(after.length).toBe(0);

    // idempotent
    const r2 = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(cardId) } },
    );
    expect(r2.status).toBe(200);
  });
});
