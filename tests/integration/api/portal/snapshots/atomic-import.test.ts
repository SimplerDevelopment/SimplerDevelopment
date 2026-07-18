/**
 * Site snapshots — atomic import (transactional rollback on partial failure).
 *
 * Contract: importSnapshot wraps every site/postType/post/nav insert in a
 * single `db.transaction`. If any insert throws — say a post payload that
 * violates a column-length constraint — every preceding insert in the same
 * import must be rolled back. The HTTP route returns 400 with the error.
 *
 * Strategy: upload a payload via POST /api/portal/snapshots whose shape is
 * valid (passes schemaVersion=1 + name/payload guards) but whose second post
 * has a title exceeding `posts.title` (varchar(255)). The DB raises
 * `value too long for type character varying(255)` on the second insert; the
 * first insert + the brand-new client_websites row + the post_type insert
 * must NOT remain in the database.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers()),
  cookies: vi.fn(async () => ({
    get: () => undefined,
    set: () => undefined,
    has: () => false,
  })),
}));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../../helpers/test-db';
import type { SnapshotPayload } from '@/lib/snapshots/types';

/** Build a payload that's structurally valid (schemaVersion=1, posts array,
 *  navigation array) but whose second post has a 600-char title — which the
 *  DB layer rejects at insert time because `posts.title` is varchar(255). */
function poisonPayload(): SnapshotPayload {
  const overlongTitle = 'X'.repeat(600);
  return {
    schemaVersion: 1,
    site: {
      name: 'Atomic Site',
      settings: { description: 'rolled-back site', active: true },
      customCode: { customCss: null, customJs: null },
    },
    posts: [
      {
        slug: 'fine',
        type: 'page',
        title: 'Fine Post',
        status: 'published',
        content: { blocks: [], version: '1.0' },
      },
      {
        slug: 'poison',
        type: 'page',
        title: overlongTitle,
        status: 'draft',
        content: { blocks: [], version: '1.0' },
      },
    ],
    navigation: [{ key: 'main', items: [] }],
    blockTemplates: [],
    postTypes: [],
  };
}

async function uploadSnapshot(payload: SnapshotPayload): Promise<number> {
  const route = await import('@/app/api/portal/snapshots/route');
  const res = await callHandler<{ success: boolean; data: { id: number } }>(
    route as unknown as Record<string, unknown>,
    'POST',
    {
      body: {
        name: `atomic-${Date.now()}`,
        description: 'poison payload for rollback test',
        payload,
      },
    },
  );
  expect(res.status).toBe(200);
  return res.data!.data.id;
}

describe('Site snapshots — atomic import @snapshots', () => {
  let A: TenantCtx;
  beforeEach(async () => {
    A = await sessionForNewClientUser('snap-atomic');
    mockedAuth.mockResolvedValue(A.session);
  });

  it('rolls back the entire import when a single post insert violates a column constraint (createNewSite)', async () => {
    const sql = getTestSql();

    // Pre-condition: tenant A starts with zero sites and zero posts.
    const sitesBefore = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.client_websites WHERE client_id = ${A.client.id}
    `;
    expect(sitesBefore).toHaveLength(0);

    const snapshotId = await uploadSnapshot(poisonPayload());

    // Trigger the import. The route catches the thrown error and returns 400.
    const importRoute = await import('@/app/api/portal/snapshots/[id]/import/route');
    const importRes = await callHandler<{ success: boolean; message?: string }>(
      importRoute as unknown as Record<string, unknown>,
      'POST',
      {
        params: { id: String(snapshotId) },
        body: { createNewSite: true, newSiteName: 'Atomic Rollback Test' },
      },
    );
    expect(importRes.status).toBe(400);
    expect(importRes.data?.success).toBe(false);

    // ── Atomicity assertions ──────────────────────────────────────────
    // 1. No new site was created on this client (the createNewSite branch
    //    inserts into client_websites first; that insert must roll back).
    const sitesAfter = await sql<{ id: number; name: string }[]>`
      SELECT id, name FROM ${sql(TEST_SCHEMA)}.client_websites WHERE client_id = ${A.client.id}
    `;
    expect(sitesAfter).toHaveLength(0);

    // 2. No posts landed anywhere — neither under the rolled-back site nor
    //    leaked under any other website on this tenant.
    const orphanPosts = await sql<{ id: number; slug: string }[]>`
      SELECT p.id, p.slug
      FROM ${sql(TEST_SCHEMA)}.posts p
      LEFT JOIN ${sql(TEST_SCHEMA)}.client_websites w ON w.id = p.website_id
      WHERE w.client_id = ${A.client.id} OR p.slug IN ('fine', 'poison')
    `;
    expect(orphanPosts).toHaveLength(0);
  });

  it('rolls back into an existing site without leaking the partially-imported post', async () => {
    const sql = getTestSql();

    // Pre-existing site with one post — a baseline we will compare against.
    const [site] = await sql<{ id: number }[]>`
      INSERT INTO ${sql(TEST_SCHEMA)}.client_websites (client_id, name, domain)
      VALUES (${A.client.id}, ${`atomic-tgt-${Date.now()}`}, ${`atomic-tgt.test`})
      RETURNING id
    `;
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.posts (website_id, title, slug, post_type, content, published)
      VALUES (${site.id}, 'Pre-existing', 'preexisting', 'page', '{"blocks":[],"version":"1.0"}', true)
    `;

    const snapshotId = await uploadSnapshot(poisonPayload());

    const importRoute = await import('@/app/api/portal/snapshots/[id]/import/route');
    const importRes = await callHandler<{ success: boolean; message?: string }>(
      importRoute as unknown as Record<string, unknown>,
      'POST',
      {
        params: { id: String(snapshotId) },
        body: { siteId: site.id },
      },
    );
    expect(importRes.status).toBe(400);
    expect(importRes.data?.success).toBe(false);

    // The existing site still has only its one pre-existing post — the
    // 'fine' post from the snapshot's first entry must NOT be present.
    const after = await sql<{ slug: string }[]>`
      SELECT slug FROM ${sql(TEST_SCHEMA)}.posts WHERE website_id = ${site.id} ORDER BY slug
    `;
    expect(after.map((r) => r.slug)).toEqual(['preexisting']);
  });
});
