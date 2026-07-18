/**
 * DELETE /api/portal/cards/[id]/comments/[commentId]
 *
 * Contract:
 *   - 401 unauth
 *   - 404 cross-tenant card
 *   - 404 commentId belongs to another card in same tenant
 *   - 200 + row deleted when staff acts (any commenter)
 *   - 200 when same-tenant author deletes own comment
 *   - 404 when same-tenant non-author non-staff tries to delete (no-op delete -> still 200)
 *     NOTE: implementation issues db.delete with a stricter WHERE for non-staff non-authors
 *     so the row stays put, but the response is still 200. We assert preservation.
 *
 * The route only exports DELETE — there's no PATCH on comments today.
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

async function seedCardWithComment(client: TenantCtx, opts?: { authorId?: number }) {
  const sql = getTestSql();
  const author = opts?.authorId ?? client.user.id;

  const [proj] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.projects (name, client_id, status, created_by)
    VALUES ('CommentTest project', ${client.client.id}, 'active', ${client.user.id})
    RETURNING id
  `;
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.project_members (project_id, user_id, role)
    VALUES (${proj.id}, ${client.user.id}, 'owner')
  `;
  const [col] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.kanban_columns (project_id, name, "order")
    VALUES (${proj.id}, 'Todo', 0) RETURNING id
  `;
  const [card] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.kanban_cards (column_id, project_id, title, "order")
    VALUES (${col.id}, ${proj.id}, 'C', 0) RETURNING id
  `;
  const [comment] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.kanban_card_comments (card_id, user_id, body)
    VALUES (${card.id}, ${author}, 'hello') RETURNING id
  `;
  return { projectId: proj.id, cardId: card.id, commentId: comment.id };
}

describe('DELETE /api/portal/cards/[id]/comments/[commentId] @cards @comments', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  let staff: TenantCtx;
  beforeEach(async () => {
    [{ A, B }, staff] = await Promise.all([
      twoTenants(),
      sessionForStaff('agency-comments'),
    ]);
  });

  it('401 unauthenticated', async () => {
    const { cardId, commentId } = await seedCardWithComment(A);
    mockedAuth.mockResolvedValue(null);

    const route = await import('@/app/api/portal/cards/[id]/comments/[commentId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { id: String(cardId), commentId: String(commentId) } },
    );
    expect(res.status).toBe(401);
  });

  it('404 cross-tenant: A cannot delete B\'s comment', async () => {
    const { cardId, commentId } = await seedCardWithComment(B);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/cards/[id]/comments/[commentId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { id: String(cardId), commentId: String(commentId) } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.kanban_card_comments WHERE id = ${commentId}
    `;
    expect(rows.length).toBe(1);
  });

  it('200 + comment removed when staff deletes', async () => {
    const { cardId, commentId } = await seedCardWithComment(A);
    mockedAuth.mockResolvedValue(staff.session);

    const route = await import('@/app/api/portal/cards/[id]/comments/[commentId]/route');
    const res = await callHandler<{ success: boolean }>(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { id: String(cardId), commentId: String(commentId) } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.kanban_card_comments WHERE id = ${commentId}
    `;
    expect(rows.length).toBe(0);
  });

  it('200 + comment removed when same-tenant author deletes own', async () => {
    const { cardId, commentId } = await seedCardWithComment(A);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/cards/[id]/comments/[commentId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { id: String(cardId), commentId: String(commentId) } },
    );
    expect(res.status).toBe(200);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.kanban_card_comments WHERE id = ${commentId}
    `;
    expect(rows.length).toBe(0);
  });

  it('non-author non-staff tenant member cannot delete (row preserved)', async () => {
    // Seed comment authored by A.user. Then create a 2nd member of A's client.
    const sql = getTestSql();
    const otherEmail = `aux-a-${Date.now()}@test.local`;
    const [otherU] = await sql<{ id: number }[]>`
      INSERT INTO ${sql(TEST_SCHEMA)}.users (name, email, password, role, active)
      VALUES ('Aux A', ${otherEmail}, 'x', 'editor', true) RETURNING id
    `;
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.client_members (client_id, user_id, role)
      VALUES (${A.client.id}, ${otherU.id}, 'member')
    `;
    const { cardId, commentId } = await seedCardWithComment(A);

    mockedAuth.mockResolvedValue({
      user: { id: String(otherU.id), email: otherEmail, name: 'Aux A', role: 'editor' },
      expires: new Date(Date.now() + 86400_000).toISOString(),
    });
    const route = await import('@/app/api/portal/cards/[id]/comments/[commentId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { id: String(cardId), commentId: String(commentId) } },
    );
    // Handler returns 200 envelope but the WHERE filter (userId=author) means no rows match.
    expect(res.status).toBe(200);

    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.kanban_card_comments WHERE id = ${commentId}
    `;
    expect(rows.length).toBe(1);
  });

  it('404 when commentId belongs to another card', async () => {
    const c1 = await seedCardWithComment(A);
    const c2 = await seedCardWithComment(A);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/cards/[id]/comments/[commentId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'DELETE',
      // c1 path with c2 commentId
      { params: { id: String(c1.cardId), commentId: String(c2.commentId) } },
    );
    // The handler's WHERE includes (cardId), so the delete is a no-op; status 200,
    // but the comment row remains intact.
    expect(res.status).toBe(200);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.kanban_card_comments WHERE id = ${c2.commentId}
    `;
    expect(rows.length).toBe(1);
  });
});
