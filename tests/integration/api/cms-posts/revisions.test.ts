/**
 * CMS post revisions — list, revert, version diff @cms @posts @revisions
 *
 * Covers GET (history list) + POST (revert to revision) on
 *   /api/portal/cms/websites/[siteId]/posts/[postId]/revisions
 *
 * Contract:
 *   - 401 when unauthenticated
 *   - 404 when siteId is in a different tenant
 *   - 404 when postId is in a different site (cross-tenant)
 *   - GET returns ordered list of {id,title,trigger,createdAt}
 *   - POST without revisionId → 400
 *   - POST revert restores prior content+title, snapshots current as a new revision
 *   - Reverting allows the version-diff caller to compare old vs new content
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/revalidate-client-site', () => ({
  revalidateClientSite: vi.fn().mockResolvedValue(undefined),
  clientSiteUrl: () => null,
}));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

async function seedSite(ctx: TenantCtx, label = 'site'): Promise<{ siteId: number }> {
  const sql = getTestSql();
  const [s] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.client_websites (client_id, name, domain)
    VALUES (${ctx.client.id}, ${`${label}-${Date.now()}`}, ${`${label}-${Date.now()}.test`})
    RETURNING id
  `;
  return { siteId: s.id };
}

async function seedPost(
  siteId: number,
  overrides: { slug?: string; title?: string; content?: string } = {},
): Promise<{ id: number; slug: string }> {
  const sql = getTestSql();
  const slug = overrides.slug ?? `post-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
  const content = overrides.content ?? JSON.stringify({ blocks: [], version: '1.0' });
  const [row] = await sql<{ id: number; slug: string }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.posts (
      website_id, title, slug, post_type, content, published
    ) VALUES (
      ${siteId}, ${overrides.title ?? 'Original Title'}, ${slug}, 'blog',
      ${content}, false
    ) RETURNING id, slug
  `;
  return row;
}

async function seedRevision(
  postId: number,
  overrides: { title?: string; content?: string; trigger?: string } = {},
): Promise<{ id: number }> {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.post_revisions (post_id, content, title, trigger, created_by)
    VALUES (
      ${postId},
      ${overrides.content ?? JSON.stringify({ blocks: [{ type: 'text', value: 'old' }] })},
      ${overrides.title ?? 'Old Title'},
      ${overrides.trigger ?? 'manual'},
      NULL
    ) RETURNING id
  `;
  return row;
}

describe('GET /api/portal/cms/websites/[siteId]/posts/[postId]/revisions @cms @posts @revisions', () => {
  let A: TenantCtx;
  let siteId: number;
  let postId: number;

  beforeEach(async () => {
    A = await sessionForNewClientUser('cms-rev-list');
    ({ siteId } = await seedSite(A));
    const p = await seedPost(siteId);
    postId = p.id;
  });

  it('401 unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/cms/websites/[siteId]/posts/[postId]/revisions/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { siteId: String(siteId), postId: String(postId) } },
    );
    expect(res.status).toBe(401);
  });

  it('404 when post belongs to a different tenant (cross-tenant)', async () => {
    const B = await sessionForNewClientUser('cms-rev-cross');
    const { siteId: siteB } = await seedSite(B);
    const foreign = await seedPost(siteB);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/cms/websites/[siteId]/posts/[postId]/revisions/route');
    // Caller's siteId is their own, but postId is from another tenant — must 404
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { siteId: String(siteId), postId: String(foreign.id) } },
    );
    expect(res.status).toBe(404);
  });

  it('returns the revision history ordered desc by createdAt', async () => {
    mockedAuth.mockResolvedValue(A.session);
    await seedRevision(postId, { title: 'V1', trigger: 'autosave' });
    await new Promise(r => setTimeout(r, 5));   // ensure distinct timestamps
    await seedRevision(postId, { title: 'V2', trigger: 'manual' });
    await new Promise(r => setTimeout(r, 5));
    await seedRevision(postId, { title: 'V3', trigger: 'publish' });

    const route = await import('@/app/api/portal/cms/websites/[siteId]/posts/[postId]/revisions/route');
    const res = await callHandler<{ success: boolean; data: Array<{ title: string; trigger: string }> }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { siteId: String(siteId), postId: String(postId) } },
    );

    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    const titles = res.data!.data.map(d => d.title);
    expect(titles).toEqual(['V3', 'V2', 'V1']);
  });

  it('GET supports version-diff workflow (full content readable per row)', async () => {
    mockedAuth.mockResolvedValue(A.session);
    await seedRevision(postId, {
      title: 'Draft',
      content: JSON.stringify({ blocks: [{ type: 'text', value: 'first' }] }),
      trigger: 'autosave',
    });
    await seedRevision(postId, {
      title: 'Refined',
      content: JSON.stringify({ blocks: [{ type: 'text', value: 'second' }] }),
      trigger: 'manual',
    });

    // List route returns metadata (no content); version-diff is built by the
    // client side reading the post + a single revision row. Verify the rows
    // exist with distinct content blobs so a diff is actually computable.
    const route = await import('@/app/api/portal/cms/websites/[siteId]/posts/[postId]/revisions/route');
    const res = await callHandler<{ success: boolean; data: Array<{ id: number; title: string }> }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { siteId: String(siteId), postId: String(postId) } },
    );
    expect(res.status).toBe(200);
    expect(res.data!.data.length).toBe(2);

    const sql = getTestSql();
    const rows = await sql<{ id: number; content: string }[]>`
      SELECT id, content FROM ${sql(TEST_SCHEMA)}.post_revisions
      WHERE post_id = ${postId} ORDER BY id ASC
    `;
    const parsed = rows.map(r => JSON.parse(r.content));
    expect(parsed[0].blocks[0].value).toBe('first');
    expect(parsed[1].blocks[0].value).toBe('second');
    expect(parsed[0]).not.toEqual(parsed[1]);
  });
});

describe('POST /api/portal/cms/websites/[siteId]/posts/[postId]/revisions — revert @cms @posts @revisions', () => {
  let A: TenantCtx;
  let siteId: number;
  let postId: number;
  let revisionId: number;

  beforeEach(async () => {
    A = await sessionForNewClientUser('cms-rev-revert');
    ({ siteId } = await seedSite(A));
    const p = await seedPost(siteId, {
      title: 'Current Title',
      content: JSON.stringify({ blocks: [{ type: 'text', value: 'current' }] }),
    });
    postId = p.id;
    const r = await seedRevision(postId, {
      title: 'Old Title',
      content: JSON.stringify({ blocks: [{ type: 'text', value: 'old' }] }),
      trigger: 'manual',
    });
    revisionId = r.id;
    mockedAuth.mockResolvedValue(A.session);
  });

  it('400 when revisionId is missing', async () => {
    const route = await import('@/app/api/portal/cms/websites/[siteId]/posts/[postId]/revisions/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { siteId: String(siteId), postId: String(postId) }, body: {} },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/revisionId/i);
  });

  it('404 when revisionId does not belong to the post', async () => {
    const other = await seedPost(siteId, { slug: 'other-post' });
    const otherRev = await seedRevision(other.id);
    const route = await import('@/app/api/portal/cms/websites/[siteId]/posts/[postId]/revisions/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      {
        params: { siteId: String(siteId), postId: String(postId) },
        body: { revisionId: otherRev.id },
      },
    );
    expect(res.status).toBe(404);
  });

  it('reverts post content+title and snapshots the current state as a new revision', async () => {
    const route = await import('@/app/api/portal/cms/websites/[siteId]/posts/[postId]/revisions/route');
    const res = await callHandler<{ success: boolean; data: { title: string; content: string } }>(
      route as unknown as Record<string, unknown>, 'POST',
      {
        params: { siteId: String(siteId), postId: String(postId) },
        body: { revisionId },
      },
    );
    expect(res.status).toBe(200);
    expect(res.data!.data.title).toBe('Old Title');
    expect(JSON.parse(res.data!.data.content).blocks[0].value).toBe('old');

    // The pre-revert state should now exist as a fresh revision row.
    const sql = getTestSql();
    const rows = await sql<{ title: string; content: string; trigger: string; id: number }[]>`
      SELECT title, content, trigger, id FROM ${sql(TEST_SCHEMA)}.post_revisions
      WHERE post_id = ${postId} ORDER BY id ASC
    `;
    expect(rows.length).toBe(2);
    const snapshot = rows.find(r => r.title === 'Current Title');
    expect(snapshot).toBeTruthy();
    expect(JSON.parse(snapshot!.content).blocks[0].value).toBe('current');
  });

  it('404 when reverting against a post in a different tenant', async () => {
    const B = await sessionForNewClientUser('cms-revert-cross');
    const { siteId: siteB } = await seedSite(B);
    const foreign = await seedPost(siteB);
    const foreignRev = await seedRevision(foreign.id);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/cms/websites/[siteId]/posts/[postId]/revisions/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      {
        params: { siteId: String(siteId), postId: String(foreign.id) },
        body: { revisionId: foreignRev.id },
      },
    );
    expect(res.status).toBe(404);

    // Foreign post must remain untouched
    const sql = getTestSql();
    const [row] = await sql<{ title: string }[]>`
      SELECT title FROM ${sql(TEST_SCHEMA)}.posts WHERE id = ${foreign.id}
    `;
    expect(row.title).toBe('Original Title');
  });
});
