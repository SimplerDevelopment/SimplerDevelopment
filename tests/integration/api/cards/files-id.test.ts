/**
 * PATCH/DELETE /api/portal/cards/[id]/files/[fileId]
 *
 * Contract:
 *   PATCH:
 *     - 401 unauth
 *     - 404 cross-tenant card / cross-card fileId mismatch
 *     - 200 + commentId is updated when authorized
 *   DELETE:
 *     - 401 unauth
 *     - 404 cross-tenant
 *     - 404 when non-staff calls but is not the file uploader
 *     - 200 + S3 delete invoked + DB row gone when authorized
 *
 * Cross-tenant guarantee: tenant A operating on tenant B's cardId/fileId
 * must yield 404 with no DB or S3 mutation.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/s3/delete', () => ({
  deleteFromS3: vi.fn(async () => undefined),
}));

import { auth } from '@/lib/auth';
import { deleteFromS3 } from '@/lib/s3/delete';
const mockedAuth = auth as unknown as Mock;
const mockedDelete = deleteFromS3 as unknown as Mock;

import { callHandler } from '../../../helpers/call-handler';
import {
  sessionForStaff,
  twoTenants,
  type TenantCtx,
} from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

async function seedCardWithFile(opts: { client: TenantCtx; isPrivate?: boolean; uploaderId?: number }) {
  const sql = getTestSql();
  const isPrivate = opts.isPrivate ?? true;
  const uploader = opts.uploaderId ?? opts.client.user.id;

  const [proj] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.projects (name, client_id, status, is_private, created_by)
    VALUES ('FileTest project', ${opts.client.client.id}, 'active', ${isPrivate}, ${opts.client.user.id})
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
  const [file] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.kanban_card_files
      (card_id, project_id, user_id, original_name, stored_filename, mime_type, file_size, url)
    VALUES (${card.id}, ${proj.id}, ${uploader}, 'x.png', 'stored-x.png', 'image/png', 8, 'http://x/y')
    RETURNING id
  `;
  return { projectId: proj.id, cardId: card.id, fileId: file.id };
}

describe('PATCH /api/portal/cards/[id]/files/[fileId] @cards @files', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  beforeEach(async () => {
    mockedDelete.mockClear();
    ({ A, B } = await twoTenants());
  });

  it('401 when unauthenticated', async () => {
    const { cardId, fileId } = await seedCardWithFile({ client: A });
    mockedAuth.mockResolvedValue(null);

    const route = await import('@/app/api/portal/cards/[id]/files/[fileId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'PATCH',
      { params: { id: String(cardId), fileId: String(fileId) }, body: { commentId: 1 } },
    );
    expect(res.status).toBe(401);
  });

  it('404 cross-tenant: A cannot patch B\'s file', async () => {
    const { cardId, fileId } = await seedCardWithFile({ client: B });
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/cards/[id]/files/[fileId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'PATCH',
      { params: { id: String(cardId), fileId: String(fileId) }, body: { commentId: 7 } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const [row] = await sql<{ comment_id: number | null }[]>`
      SELECT comment_id FROM ${sql(TEST_SCHEMA)}.kanban_card_files WHERE id = ${fileId}
    `;
    expect(row.comment_id).toBe(null);
  });

  it('404 when fileId belongs to a different card in the same tenant', async () => {
    const card1 = await seedCardWithFile({ client: A });
    const card2 = await seedCardWithFile({ client: A });
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/cards/[id]/files/[fileId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'PATCH',
      // Mismatched: card1 path with file2 id
      { params: { id: String(card1.cardId), fileId: String(card2.fileId) }, body: { commentId: 7 } },
    );
    expect(res.status).toBe(404);
  });

  it('200 + commentId persisted when same-tenant private project', async () => {
    const { cardId, fileId } = await seedCardWithFile({ client: A });
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/cards/[id]/files/[fileId]/route');
    const res = await callHandler<{ success: boolean }>(
      route as unknown as Record<string, unknown>,
      'PATCH',
      { params: { id: String(cardId), fileId: String(fileId) }, body: { commentId: 42 } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);

    const sql = getTestSql();
    const [row] = await sql<{ comment_id: number | null }[]>`
      SELECT comment_id FROM ${sql(TEST_SCHEMA)}.kanban_card_files WHERE id = ${fileId}
    `;
    expect(row.comment_id).toBe(42);
  });
});

describe('DELETE /api/portal/cards/[id]/files/[fileId] @cards @files', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  let staff: TenantCtx;
  beforeEach(async () => {
    mockedDelete.mockClear();
    [{ A, B }, staff] = await Promise.all([
      twoTenants(),
      sessionForStaff('agency-files'),
    ]);
  });

  it('401 when unauthenticated', async () => {
    const { cardId, fileId } = await seedCardWithFile({ client: A });
    mockedAuth.mockResolvedValue(null);

    const route = await import('@/app/api/portal/cards/[id]/files/[fileId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { id: String(cardId), fileId: String(fileId) } },
    );
    expect(res.status).toBe(401);
    expect(mockedDelete).not.toHaveBeenCalled();
  });

  it('404 cross-tenant: A cannot delete B\'s file', async () => {
    const { cardId, fileId } = await seedCardWithFile({ client: B });
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/cards/[id]/files/[fileId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { id: String(cardId), fileId: String(fileId) } },
    );
    expect(res.status).toBe(404);
    expect(mockedDelete).not.toHaveBeenCalled();

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.kanban_card_files WHERE id = ${fileId}
    `;
    expect(rows.length).toBe(1);
  });

  it('404 when non-staff caller is not the uploader', async () => {
    const sql = getTestSql();
    // Add a second member to A's client so we can act as a non-uploader same-tenant user
    const otherEmail = `other-${Date.now()}@test.local`;
    const [otherU] = await sql<{ id: number }[]>`
      INSERT INTO ${sql(TEST_SCHEMA)}.users (name, email, password, role, active)
      VALUES ('Other A', ${otherEmail}, 'x', 'editor', true) RETURNING id
    `;
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.client_members (client_id, user_id, role)
      VALUES (${A.client.id}, ${otherU.id}, 'member')
    `;

    // Uploader is original A.user — current caller is otherU
    const { cardId, fileId } = await seedCardWithFile({ client: A });
    mockedAuth.mockResolvedValue({
      user: { id: String(otherU.id), email: otherEmail, name: 'Other A', role: 'editor' },
      expires: new Date(Date.now() + 86400_000).toISOString(),
    });

    const route = await import('@/app/api/portal/cards/[id]/files/[fileId]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { id: String(cardId), fileId: String(fileId) } },
    );
    expect(res.status).toBe(404);
    expect(mockedDelete).not.toHaveBeenCalled();
  });

  it('200 + S3 delete invoked + DB row gone for staff (any role)', async () => {
    const { cardId, fileId } = await seedCardWithFile({ client: A });
    mockedAuth.mockResolvedValue(staff.session);

    const route = await import('@/app/api/portal/cards/[id]/files/[fileId]/route');
    const res = await callHandler<{ success: boolean }>(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { id: String(cardId), fileId: String(fileId) } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    expect(mockedDelete).toHaveBeenCalledTimes(1);
    expect(mockedDelete).toHaveBeenCalledWith('stored-x.png');

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.kanban_card_files WHERE id = ${fileId}
    `;
    expect(rows.length).toBe(0);
  });

  it('200 when non-staff uploader deletes their own file', async () => {
    const { cardId, fileId } = await seedCardWithFile({ client: A });
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/cards/[id]/files/[fileId]/route');
    const res = await callHandler<{ success: boolean }>(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { id: String(cardId), fileId: String(fileId) } },
    );
    expect(res.status).toBe(200);
    expect(mockedDelete).toHaveBeenCalledTimes(1);
  });
});
