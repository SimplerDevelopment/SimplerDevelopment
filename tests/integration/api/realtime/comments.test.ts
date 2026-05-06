/**
 * Document comments — collaborative comment threads on posts/decks/emails.
 *
 * Routes covered:
 *   - GET    /api/portal/realtime/comments
 *   - POST   /api/portal/realtime/comments
 *   - PATCH  /api/portal/realtime/comments/[id]
 *   - DELETE /api/portal/realtime/comments/[id]
 *
 * Tenancy contract: every read/write is scoped to the active portal client.
 * Cross-client access returns 404 — never leaks. Edit body / move anchor:
 * author-only (403 otherwise).
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, sessionFor, type TenantCtx, type TestSession } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

interface SeededComment {
  id: string;
  threadId: string;
  parentId: string | null;
}

async function seedComment(
  ctx: TenantCtx,
  authorId: number,
  entityType: 'post' | 'deck' | 'email',
  entityId: string,
  overrides: { body?: string; threadId?: string; parentId?: string | null; mentionedUserIds?: number[] } = {},
): Promise<SeededComment> {
  const sql = getTestSql();
  // gen_random_uuid() requires pgcrypto; if not available, use uuid_generate_v4
  // — but the live schema relies on uuid('id').defaultRandom() which uses
  // gen_random_uuid() internally. So we let the DB generate it on insert.
  if (overrides.threadId) {
    const [row] = await sql<{ id: string; thread_id: string; parent_id: string | null }[]>`
      INSERT INTO ${sql(TEST_SCHEMA)}.document_comments (
        client_id, entity_type, entity_id, thread_id, parent_id,
        author_id, body, mentioned_user_ids
      ) VALUES (
        ${ctx.client.id}, ${entityType}, ${entityId},
        ${overrides.threadId}, ${overrides.parentId ?? null},
        ${authorId}, ${overrides.body ?? 'reply body'},
        ${JSON.stringify(overrides.mentionedUserIds ?? [])}::json
      )
      RETURNING id, thread_id, parent_id
    `;
    return { id: row.id, threadId: row.thread_id, parentId: row.parent_id };
  }
  // Root insert: id and threadId must match.
  const [{ uuid: rootId }] = await sql<{ uuid: string }[]>`SELECT gen_random_uuid()::text AS uuid`;
  const [row] = await sql<{ id: string; thread_id: string; parent_id: string | null }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.document_comments (
      id, client_id, entity_type, entity_id, thread_id, parent_id,
      author_id, body, mentioned_user_ids
    ) VALUES (
      ${rootId}::uuid, ${ctx.client.id}, ${entityType}, ${entityId},
      ${rootId}::uuid, NULL,
      ${authorId}, ${overrides.body ?? 'root body'},
      ${JSON.stringify(overrides.mentionedUserIds ?? [])}::json
    )
    RETURNING id, thread_id, parent_id
  `;
  return { id: row.id, threadId: row.thread_id, parentId: row.parent_id };
}

async function readComment(id: string): Promise<{ id: string; body: string; mentioned_user_ids: unknown; resolved_at: Date | null; client_id: number; author_id: number } | undefined> {
  const sql = getTestSql();
  const [row] = await sql<{ id: string; body: string; mentioned_user_ids: unknown; resolved_at: Date | null; client_id: number; author_id: number }[]>`
    SELECT id, body, mentioned_user_ids, resolved_at, client_id, author_id
    FROM ${sql(TEST_SCHEMA)}.document_comments
    WHERE id = ${id}::uuid
  `;
  return row;
}

async function addTenantMember(ctx: TenantCtx, label = 'comment-member'): Promise<{ session: TestSession; userId: number }> {
  const sql = getTestSql();
  const email = `${label}-${Date.now()}-${Math.floor(Math.random() * 9999)}@test.local`;
  const [u] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.users (name, email, password, role, active)
    VALUES (${label}, ${email}, 'x', 'editor', true)
    RETURNING id
  `;
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.client_members (client_id, user_id, role)
    VALUES (${ctx.client.id}, ${u.id}, 'member')
  `;
  return {
    session: sessionFor({ id: u.id, role: 'editor', email, name: label }),
    userId: u.id,
  };
}

// ─── GET /comments ───────────────────────────────────────────────────────────

describe('GET /api/portal/realtime/comments @realtime @realtime-comments', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('rt-cmt-list-a'); });

  it('401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/realtime/comments/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'GET',
      { query: { entityType: 'post', entityId: '1' } },
    );
    expect(res.status).toBe(401);
  });

  it('400 when entityType is unknown', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/realtime/comments/route');
    const res = await callHandler<{ message: string }>(
      route as unknown as Record<string, unknown>,
      'GET',
      { query: { entityType: 'banana', entityId: '1' } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/entityType/i);
  });

  it('200 returns empty list when no comments', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/realtime/comments/route');
    const res = await callHandler<{ data: unknown[] }>(
      route as unknown as Record<string, unknown>,
      'GET',
      { query: { entityType: 'post', entityId: '1' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data).toEqual([]);
  });

  it('200 returns own comments', async () => {
    const root = await seedComment(A, A.user.id, 'post', '42', { body: 'hello' });
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/realtime/comments/route');
    const res = await callHandler<{ data: Array<{ id: string; body: string }> }>(
      route as unknown as Record<string, unknown>,
      'GET',
      { query: { entityType: 'post', entityId: '42' } },
    );
    expect(res.status).toBe(200);
    const ids = (res.data?.data ?? []).map(r => r.id);
    expect(ids).toContain(root.id);
  });

  it('cross-tenant: tenant A does NOT see tenant B\'s comments for the same entityId', async () => {
    const B = await sessionForNewClientUser('rt-cmt-list-b');
    const bComment = await seedComment(B, B.user.id, 'post', '999', { body: 'b-private' });
    const aComment = await seedComment(A, A.user.id, 'post', '999', { body: 'a-own' });

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/realtime/comments/route');
    const res = await callHandler<{ data: Array<{ id: string }> }>(
      route as unknown as Record<string, unknown>,
      'GET',
      { query: { entityType: 'post', entityId: '999' } },
    );
    expect(res.status).toBe(200);
    const ids = (res.data?.data ?? []).map(r => r.id);
    expect(ids).toContain(aComment.id);
    expect(ids).not.toContain(bComment.id);
  });
});

// ─── POST /comments ──────────────────────────────────────────────────────────

describe('POST /api/portal/realtime/comments @realtime @realtime-comments', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('rt-cmt-post-a'); });

  it('401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/realtime/comments/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { entityType: 'post', entityId: '1', body: 'hi' } },
    );
    expect(res.status).toBe(401);
  });

  it('400 missing body', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/realtime/comments/route');
    const res = await callHandler<{ message: string }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { entityType: 'post', entityId: '1' } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/body/i);
  });

  it('200 creates root comment (no parentId) — id == threadId', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/realtime/comments/route');
    const res = await callHandler<{ data: { id: string; threadId: string; parentId: string | null; body: string; authorId: number } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { entityType: 'post', entityId: '7', body: 'first comment' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.id).toBeTruthy();
    expect(res.data?.data.threadId).toBe(res.data?.data.id);
    expect(res.data?.data.parentId).toBeNull();
    expect(res.data?.data.body).toBe('first comment');
    expect(res.data?.data.authorId).toBe(A.user.id);
  });

  it('200 creates reply (parentId + threadId) — threadId matches root threadId', async () => {
    const root = await seedComment(A, A.user.id, 'post', '7', { body: 'root' });
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/realtime/comments/route');
    const res = await callHandler<{ data: { id: string; threadId: string; parentId: string | null; body: string } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      {
        body: {
          entityType: 'post',
          entityId: '7',
          body: 'a reply',
          threadId: root.threadId,
          parentId: root.id,
        },
      },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.threadId).toBe(root.threadId);
    expect(res.data?.data.parentId).toBe(root.id);
    expect(res.data?.data.id).not.toBe(root.id);
  });

  it('mentionedUserIds is persisted on the row', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/realtime/comments/route');
    const res = await callHandler<{ data: { id: string } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      {
        body: {
          entityType: 'post',
          entityId: '7',
          body: 'hey @1 @2',
          mentionedUserIds: [101, 202],
        },
      },
    );
    expect(res.status).toBe(200);

    const row = await readComment(res.data!.data.id);
    expect(row).toBeDefined();
    // mentioned_user_ids is `json` — postgres.js may return it as parsed array or text.
    const parsed = typeof row?.mentioned_user_ids === 'string'
      ? JSON.parse(row!.mentioned_user_ids as string) as number[]
      : row?.mentioned_user_ids as number[];
    expect(parsed).toEqual([101, 202]);
  });
});

// ─── PATCH /comments/[id] ────────────────────────────────────────────────────

describe('PATCH /api/portal/realtime/comments/[id] @realtime @realtime-comments', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('rt-cmt-patch-a'); });

  it('401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const root = await seedComment(A, A.user.id, 'post', '1', { body: 'orig' });
    const route = await import('@/app/api/portal/realtime/comments/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'PATCH',
      { params: { id: root.id }, body: { body: 'changed' } },
    );
    expect(res.status).toBe(401);
  });

  it('200 own comment update — body', async () => {
    const root = await seedComment(A, A.user.id, 'post', '1', { body: 'before' });
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/realtime/comments/[id]/route');
    const res = await callHandler<{ data: { body: string } }>(
      route as unknown as Record<string, unknown>,
      'PATCH',
      { params: { id: root.id }, body: { body: 'after' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.body).toBe('after');
  });

  it('200 own comment update — resolved flag sets resolvedAt on the thread root', async () => {
    const root = await seedComment(A, A.user.id, 'post', '1', { body: 'orig' });
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/realtime/comments/[id]/route');
    const res = await callHandler<{ data: { resolvedAt: string | null } }>(
      route as unknown as Record<string, unknown>,
      'PATCH',
      { params: { id: root.id }, body: { resolved: true } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.resolvedAt).toBeTruthy();

    const row = await readComment(root.id);
    expect(row?.resolved_at).not.toBeNull();
  });

  it('200 own comment update — anchor', async () => {
    const root = await seedComment(A, A.user.id, 'post', '1', { body: 'orig' });
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/realtime/comments/[id]/route');
    const res = await callHandler<{ data: { anchor: { blockId?: string } | null } }>(
      route as unknown as Record<string, unknown>,
      'PATCH',
      { params: { id: root.id }, body: { anchor: { blockId: 'block-42' } } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.anchor?.blockId).toBe('block-42');
  });

  // Author-only on body edits — same-tenant non-author gets 403.
  it('403 when a same-tenant non-author tries to edit body', async () => {
    const root = await seedComment(A, A.user.id, 'post', '1', { body: 'authored-by-A' });
    const other = await addTenantMember(A);
    mockedAuth.mockResolvedValue(other.session);

    const route = await import('@/app/api/portal/realtime/comments/[id]/route');
    const res = await callHandler<{ message: string }>(
      route as unknown as Record<string, unknown>,
      'PATCH',
      { params: { id: root.id }, body: { body: 'hijack' } },
    );
    expect(res.status).toBe(403);
    expect(res.data?.message).toMatch(/author/i);

    const row = await readComment(root.id);
    expect(row?.body).toBe('authored-by-A');
  });

  it('404 cross-tenant', async () => {
    const B = await sessionForNewClientUser('rt-cmt-patch-b');
    const foreign = await seedComment(B, B.user.id, 'post', '1', { body: 'foreign' });
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/realtime/comments/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'PATCH',
      { params: { id: foreign.id }, body: { body: 'leak' } },
    );
    expect(res.status).toBe(404);

    const row = await readComment(foreign.id);
    expect(row?.body).toBe('foreign');
  });
});

// ─── DELETE /comments/[id] ───────────────────────────────────────────────────

describe('DELETE /api/portal/realtime/comments/[id] @realtime @realtime-comments', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('rt-cmt-del-a'); });

  it('401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const root = await seedComment(A, A.user.id, 'post', '1', { body: 'doomed' });
    const route = await import('@/app/api/portal/realtime/comments/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { id: root.id } },
    );
    expect(res.status).toBe(401);
  });

  it('200 own delete — root delete cascades to whole thread', async () => {
    const root = await seedComment(A, A.user.id, 'post', '1', { body: 'root' });
    const reply = await seedComment(A, A.user.id, 'post', '1', {
      body: 'reply',
      threadId: root.threadId,
      parentId: root.id,
    });

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/realtime/comments/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { id: root.id } },
    );
    expect(res.status).toBe(200);

    expect(await readComment(root.id)).toBeUndefined();
    expect(await readComment(reply.id)).toBeUndefined();
  });

  it('403 when a same-tenant non-author tries to delete', async () => {
    const root = await seedComment(A, A.user.id, 'post', '1', { body: 'authored-by-A' });
    const other = await addTenantMember(A);
    mockedAuth.mockResolvedValue(other.session);

    const route = await import('@/app/api/portal/realtime/comments/[id]/route');
    const res = await callHandler<{ message: string }>(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { id: root.id } },
    );
    expect(res.status).toBe(403);
    expect(res.data?.message).toMatch(/author/i);

    expect(await readComment(root.id)).toBeDefined();
  });

  it('404 cross-tenant — foreign comment never deleted', async () => {
    const B = await sessionForNewClientUser('rt-cmt-del-b');
    const foreign = await seedComment(B, B.user.id, 'post', '1', { body: 'foreign' });
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/realtime/comments/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { id: foreign.id } },
    );
    expect(res.status).toBe(404);

    expect(await readComment(foreign.id)).toBeDefined();
  });
});
