/**
 * Brain topics — REST round-trip + tenancy + tree shape + import-from-tags.
 *
 * Contract:
 *   - 401 unauth, 404 cross-tenant
 *   - POST: name required (400 otherwise)
 *   - GET ?as=tree returns nested `{ ..., children: [...] }` shape
 *   - GET ?as=flat returns rows ordered by path
 *   - PATCH name does NOT change slug or path (stable URLs)
 *   - move re-parents and recomputes path subtree
 *   - move under self/descendant → 409
 *   - merge folds source into target, deletes source
 *   - delete refuses on has_children and has_entities (sans force)
 *   - attach/detach round-trip is idempotent
 *   - import-from-tags: dry-run + idempotent re-run
 *
 * Tagged @brain @topics for the brain-test job.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

async function seedTopic(ctx: TenantCtx, overrides: { name?: string; parentId?: number | null; slug?: string; path?: string; sortOrder?: number } = {}): Promise<{ id: number; slug: string; path: string }> {
  const sql = getTestSql();
  const name = overrides.name ?? `T-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
  const slug = overrides.slug ?? name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const path = overrides.path ?? `/${slug}`;
  const [row] = await sql<{ id: number; slug: string; path: string }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.brain_topics (client_id, parent_id, name, slug, path, sort_order)
    VALUES (
      ${ctx.client.id},
      ${overrides.parentId ?? null},
      ${name},
      ${slug},
      ${path},
      ${overrides.sortOrder ?? 0}
    )
    RETURNING id, slug, path
  `;
  return row;
}

async function seedNote(ctx: TenantCtx, overrides: { title?: string; tags?: string[] } = {}): Promise<{ id: number }> {
  const sql = getTestSql();
  // Use `sql.unsafe` so we can embed the tags JSON as a literal `::jsonb`
  // cast — the parameterized binding path goes through postgres-js's JSON
  // serialization which has rough edges in this code base (see knowledge.test
  // for the canonical pattern: '[]'::jsonb).
  const tagsJson = JSON.stringify(overrides.tags ?? []).replace(/'/g, "''");
  const title = (overrides.title ?? `note-${Date.now()}-${Math.floor(Math.random() * 9999)}`).replace(/'/g, "''");
  const rows = await sql.unsafe<{ id: number }[]>(`
    INSERT INTO "${TEST_SCHEMA}".brain_notes (client_id, title, body, tags)
    VALUES (${ctx.client.id}, '${title}', '', '${tagsJson}'::jsonb)
    RETURNING id
  `);
  return rows[0];
}

describe('Brain topics — POST /topics @brain @topics', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-topics-create'); });

  it('401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/brain/topics/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { name: 'Ops' } },
    );
    expect(res.status).toBe(401);
  });

  it('400 when name is missing', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/topics/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { description: 'no name' } },
    );
    expect(res.status).toBe(400);
  });

  it('creates a root topic with derived slug + path', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/topics/route');
    const res = await callHandler<{ success: boolean; data: { id: number; name: string; slug: string; path: string; parentId: number | null } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { name: 'Operations & Hiring' } },
    );
    expect(res.status).toBe(201);
    expect(res.data?.data.slug).toBe('operations-hiring');
    expect(res.data?.data.path).toBe('/operations-hiring');
    expect(res.data?.data.parentId).toBe(null);
  });

  it('builds /parent/child path when parentId is provided', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const parent = await seedTopic(A, { name: 'Operations', slug: 'operations', path: '/operations' });
    const route = await import('@/app/api/portal/brain/topics/route');
    const res = await callHandler<{ success: boolean; data: { id: number; path: string } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { name: 'Hiring', parentId: parent.id } },
    );
    expect(res.status).toBe(201);
    expect(res.data?.data.path).toBe('/operations/hiring');
  });

  it('suffixes slug on collision (per-client uniqueness)', async () => {
    mockedAuth.mockResolvedValue(A.session);
    await seedTopic(A, { name: 'Operations', slug: 'operations', path: '/operations' });
    const route = await import('@/app/api/portal/brain/topics/route');
    const res = await callHandler<{ success: boolean; data: { slug: string; path: string } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { name: 'Operations' } },
    );
    expect(res.status).toBe(201);
    expect(res.data?.data.slug).toBe('operations-2');
    expect(res.data?.data.path).toBe('/operations-2');
  });
});

describe('Brain topics — GET /topics @brain @topics', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-topics-list'); });

  it('returns a flat list ordered by path by default', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const ops = await seedTopic(A, { name: 'Operations', slug: 'operations', path: '/operations' });
    await seedTopic(A, { name: 'Hiring', slug: 'hiring', path: '/operations/hiring', parentId: ops.id });

    const route = await import('@/app/api/portal/brain/topics/route');
    const res = await callHandler<{ success: boolean; data: { items: Array<{ path: string }> } }>(
      route as unknown as Record<string, unknown>,
      'GET',
    );
    expect(res.status).toBe(200);
    const paths = res.data?.data.items.map((i) => i.path) ?? [];
    expect(paths).toEqual(['/operations', '/operations/hiring']);
  });

  it('returns a nested tree with childCount and entityCount when ?as=tree', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const ops = await seedTopic(A, { name: 'Operations', slug: 'operations', path: '/operations' });
    const hiring = await seedTopic(A, { name: 'Hiring', slug: 'hiring', path: '/operations/hiring', parentId: ops.id });
    // Attach a note to hiring so entityCount is non-zero.
    const note = await seedNote(A);
    const sql = getTestSql();
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.brain_entity_topics (client_id, topic_id, entity_type, entity_id)
      VALUES (${A.client.id}, ${hiring.id}, 'note', ${note.id})
    `;

    const route = await import('@/app/api/portal/brain/topics/route');
    const res = await callHandler<{ success: boolean; data: { tree: Array<{ id: number; name: string; childCount: number; entityCount: number; children: Array<{ id: number; entityCount: number }> }> } }>(
      route as unknown as Record<string, unknown>,
      'GET',
      { query: { as: 'tree' } },
    );
    expect(res.status).toBe(200);
    const tree = res.data?.data.tree ?? [];
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe(ops.id);
    expect(tree[0].childCount).toBe(1);
    expect(tree[0].entityCount).toBe(0);
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].id).toBe(hiring.id);
    expect(tree[0].children[0].entityCount).toBe(1);
  });

  it('tenancy: tenant B sees zero of tenant A\'s topics', async () => {
    const B = await sessionForNewClientUser('brain-topics-list-b');
    await seedTopic(A, { name: 'Secret', slug: 'secret', path: '/secret' });

    mockedAuth.mockResolvedValue(B.session);
    const route = await import('@/app/api/portal/brain/topics/route');
    const res = await callHandler<{ success: boolean; data: { items: unknown[] } }>(
      route as unknown as Record<string, unknown>,
      'GET',
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.items).toEqual([]);
  });
});

describe('Brain topics — PATCH / DELETE / move /merge @brain @topics', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-topics-mut'); });

  it('PATCH renames without changing slug or path (stable URLs)', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const t = await seedTopic(A, { name: 'Old', slug: 'old', path: '/old' });
    const route = await import('@/app/api/portal/brain/topics/[id]/route');
    const res = await callHandler<{ success: boolean; data: { name: string; slug: string; path: string } }>(
      route as unknown as Record<string, unknown>,
      'PATCH',
      { params: { id: String(t.id) }, body: { name: 'Brand New' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.name).toBe('Brand New');
    expect(res.data?.data.slug).toBe('old');
    expect(res.data?.data.path).toBe('/old');
  });

  it('PATCH cross-tenant returns 404', async () => {
    const B = await sessionForNewClientUser('brain-topics-mut-b');
    const tb = await seedTopic(B);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/topics/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'PATCH',
      { params: { id: String(tb.id) }, body: { name: 'hijack' } },
    );
    expect(res.status).toBe(404);
  });

  it('move re-parents and rewrites the descendant subtree paths', async () => {
    mockedAuth.mockResolvedValue(A.session);
    // Chain: /a -> /a/b -> /a/b/c. Move /a/b under newly-created /x: paths
    // become /x/b and /x/b/c. (Slug `b` stays `b`.)
    const a = await seedTopic(A, { name: 'a', slug: 'a', path: '/a' });
    const b = await seedTopic(A, { name: 'b', slug: 'b', path: '/a/b', parentId: a.id });
    const c = await seedTopic(A, { name: 'c', slug: 'c', path: '/a/b/c', parentId: b.id });
    const x = await seedTopic(A, { name: 'x', slug: 'x', path: '/x' });

    const route = await import('@/app/api/portal/brain/topics/[id]/move/route');
    const res = await callHandler<{ success: boolean; data: { path: string } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(b.id) }, body: { newParentId: x.id } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.path).toBe('/x/b');

    const sql = getTestSql();
    const [cRow] = await sql<{ path: string }[]>`
      SELECT path FROM ${sql(TEST_SCHEMA)}.brain_topics WHERE id = ${c.id}
    `;
    expect(cRow.path).toBe('/x/b/c');
  });

  it('move refuses to parent a topic under one of its own descendants (409)', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const a = await seedTopic(A, { name: 'a', slug: 'a', path: '/a' });
    const b = await seedTopic(A, { name: 'b', slug: 'b', path: '/a/b', parentId: a.id });
    const route = await import('@/app/api/portal/brain/topics/[id]/move/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(a.id) }, body: { newParentId: b.id } },
    );
    expect(res.status).toBe(409);
    expect(res.data?.message).toMatch(/descendant/i);
  });

  it('merge folds source into target — entity links re-attach, source is deleted', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const src = await seedTopic(A, { name: 'src', slug: 'src', path: '/src' });
    const tgt = await seedTopic(A, { name: 'tgt', slug: 'tgt', path: '/tgt' });
    const note = await seedNote(A);
    const sql = getTestSql();
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.brain_entity_topics (client_id, topic_id, entity_type, entity_id)
      VALUES (${A.client.id}, ${src.id}, 'note', ${note.id})
    `;

    const route = await import('@/app/api/portal/brain/topics/[id]/merge/route');
    const res = await callHandler<{ success: boolean; data: { reattached: number; deletedSourceId: number } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(src.id) }, body: { targetTopicId: tgt.id } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.reattached).toBe(1);

    const remaining = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.brain_topics WHERE id = ${src.id}
    `;
    expect(remaining).toHaveLength(0);

    const links = await sql<{ topic_id: number }[]>`
      SELECT topic_id FROM ${sql(TEST_SCHEMA)}.brain_entity_topics
       WHERE client_id = ${A.client.id} AND entity_type = 'note' AND entity_id = ${note.id}
    `;
    expect(links.map((l) => l.topic_id)).toEqual([tgt.id]);
  });

  it('DELETE refuses on has_children (409) regardless of force', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const parent = await seedTopic(A, { name: 'p', slug: 'p', path: '/p' });
    await seedTopic(A, { name: 'kid', slug: 'kid', path: '/p/kid', parentId: parent.id });
    const route = await import('@/app/api/portal/brain/topics/[id]/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { id: String(parent.id) }, query: { force: 'true' } },
    );
    expect(res.status).toBe(409);
    expect(res.data?.message).toMatch(/children/i);
  });

  it('DELETE refuses on has_entities without force (409)', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const t = await seedTopic(A);
    const note = await seedNote(A);
    const sql = getTestSql();
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.brain_entity_topics (client_id, topic_id, entity_type, entity_id)
      VALUES (${A.client.id}, ${t.id}, 'note', ${note.id})
    `;
    const route = await import('@/app/api/portal/brain/topics/[id]/route');
    const res = await callHandler<{ success: boolean; reason: string }>(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { id: String(t.id) } },
    );
    expect(res.status).toBe(409);
    expect(res.data?.reason).toBe('has_entities');
  });

  it('DELETE force=true detaches entity links and removes the topic', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const t = await seedTopic(A);
    const note = await seedNote(A);
    const sql = getTestSql();
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.brain_entity_topics (client_id, topic_id, entity_type, entity_id)
      VALUES (${A.client.id}, ${t.id}, 'note', ${note.id})
    `;
    const route = await import('@/app/api/portal/brain/topics/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { id: String(t.id) }, query: { force: 'true' } },
    );
    expect(res.status).toBe(200);
    const remaining = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.brain_topics WHERE id = ${t.id}
    `;
    expect(remaining).toHaveLength(0);
  });
});

describe('Brain topics — attach / detach @brain @topics', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-topics-attach'); });

  it('POST attach is idempotent — re-attaching reports alreadyAttached', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const t = await seedTopic(A);
    const note = await seedNote(A);

    const route = await import('@/app/api/portal/brain/topics/attach/route');
    const first = await callHandler<{ success: boolean; data: { attached: number; alreadyAttached: number } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { entityType: 'note', entityId: note.id, topicIds: [t.id] } },
    );
    expect(first.status).toBe(200);
    expect(first.data?.data.attached).toBe(1);

    const second = await callHandler<{ success: boolean; data: { attached: number; alreadyAttached: number } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { entityType: 'note', entityId: note.id, topicIds: [t.id] } },
    );
    expect(second.status).toBe(200);
    expect(second.data?.data.attached).toBe(0);
    expect(second.data?.data.alreadyAttached).toBe(1);
  });

  it('DELETE detach removes the row; subsequent re-attach succeeds', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const t = await seedTopic(A);
    const note = await seedNote(A);
    const route = await import('@/app/api/portal/brain/topics/attach/route');

    await callHandler(route as unknown as Record<string, unknown>, 'POST',
      { body: { entityType: 'note', entityId: note.id, topicIds: [t.id] } });

    const det = await callHandler<{ success: boolean; data: { detached: number } }>(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { body: { entityType: 'note', entityId: note.id, topicIds: [t.id] } },
    );
    expect(det.status).toBe(200);
    expect(det.data?.data.detached).toBe(1);

    const reattach = await callHandler<{ success: boolean; data: { attached: number } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { entityType: 'note', entityId: note.id, topicIds: [t.id] } },
    );
    expect(reattach.data?.data.attached).toBe(1);
  });

  it('POST attach 400 on bad payload (missing topicIds)', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/topics/attach/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { entityType: 'note', entityId: 1 } },
    );
    expect(res.status).toBe(400);
  });
});

describe('Brain topics — import-from-tags @brain @topics', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-topics-import'); });

  it('imports a hierarchical chain from a `/`-separated tag', async () => {
    mockedAuth.mockResolvedValue(A.session);
    await seedNote(A, { tags: ['kb/marketing/seo'] });
    await seedNote(A, { tags: ['kb/marketing/seo'] });
    await seedNote(A, { tags: ['kb/marketing'] });

    const route = await import('@/app/api/portal/brain/topics/import-from-tags/route');
    const res = await callHandler<{ success: boolean; data: { topicsCreated: number; notesAttached: number; perTopic: Array<{ path: string; noteCount: number }> } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: {} },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.topicsCreated).toBeGreaterThanOrEqual(3); // kb, marketing, seo
    expect(res.data?.data.notesAttached).toBe(3);

    const sql = getTestSql();
    const topics = await sql<{ path: string }[]>`
      SELECT path FROM ${sql(TEST_SCHEMA)}.brain_topics WHERE client_id = ${A.client.id} ORDER BY path
    `;
    const paths = topics.map((t) => t.path);
    expect(paths).toContain('/kb');
    expect(paths).toContain('/kb/marketing');
    expect(paths).toContain('/kb/marketing/seo');
  });

  it('idempotent — re-running creates no duplicate topics or join rows', async () => {
    mockedAuth.mockResolvedValue(A.session);
    await seedNote(A, { tags: ['kb/marketing'] });

    const route = await import('@/app/api/portal/brain/topics/import-from-tags/route');
    const first = await callHandler<{ success: boolean; data: { topicsCreated: number; notesAttached: number } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: {} },
    );
    expect(first.data?.data.topicsCreated).toBe(2); // kb + marketing
    expect(first.data?.data.notesAttached).toBe(1);

    const second = await callHandler<{ success: boolean; data: { topicsCreated: number; notesAttached: number } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: {} },
    );
    expect(second.data?.data.topicsCreated).toBe(0);
    expect(second.data?.data.notesAttached).toBe(0);

    const sql = getTestSql();
    const [{ count: tCount }] = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM ${sql(TEST_SCHEMA)}.brain_topics WHERE client_id = ${A.client.id}
    `;
    expect(tCount).toBe(2);
  });

  it('dryRun returns a report without writing topics or join rows', async () => {
    mockedAuth.mockResolvedValue(A.session);
    await seedNote(A, { tags: ['kb/ops'] });
    const route = await import('@/app/api/portal/brain/topics/import-from-tags/route');
    const res = await callHandler<{ success: boolean; data: { topicsCreated: number; dryRun: boolean } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { dryRun: true } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.dryRun).toBe(true);

    const sql = getTestSql();
    const [{ count }] = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM ${sql(TEST_SCHEMA)}.brain_topics WHERE client_id = ${A.client.id}
    `;
    expect(count).toBe(0);
  });
});
