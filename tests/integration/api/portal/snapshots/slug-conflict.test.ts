/**
 * Site snapshots — slug-conflict resolution on in-place import.
 *
 * Contract: when a snapshot is imported into an existing site that already
 * has a post with the same slug, the importer must NOT clobber the existing
 * post. Instead the imported post lands at `<slug>-imported-1` and the
 * conflict is reported in `data.conflicts: string[]`.
 *
 * Sister specs:
 *   - tests/unit/snapshots-export-import.test.ts pure-helper version
 *   - tests/e2e/snapshots.spec.ts UI version
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

async function seedSite(ctx: TenantCtx, label: string): Promise<{ siteId: number }> {
  const sql = getTestSql();
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 9999)}`;
  const [s] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.client_websites (client_id, name, domain)
    VALUES (${ctx.client.id}, ${`${label}-${stamp}`}, ${`${label}-${stamp}.test`})
    RETURNING id
  `;
  return { siteId: s.id };
}

async function seedPost(
  siteId: number,
  slug: string,
  overrides: { title?: string; content?: unknown } = {},
): Promise<{ id: number }> {
  const sql = getTestSql();
  const content =
    typeof overrides.content === 'string'
      ? overrides.content
      : JSON.stringify(overrides.content ?? { blocks: [], version: '1.0' });
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.posts (
      website_id, title, slug, post_type, content, published
    ) VALUES (
      ${siteId}, ${overrides.title ?? `Title-${slug}`}, ${slug},
      ${'page'}, ${content}, ${true}
    ) RETURNING id
  `;
  return row;
}

async function exportSiteToSnapshot(siteId: number): Promise<number> {
  const route = await import('@/app/api/portal/sites/[siteId]/export/route');
  const res = await callHandler<{ success: boolean; data: { id: number } }>(
    route as unknown as Record<string, unknown>,
    'POST',
    { params: { siteId: String(siteId) }, body: { name: `slug-conflict-${Date.now()}` } },
  );
  expect(res.status).toBe(200);
  return res.data!.data.id;
}

describe('Site snapshots — slug conflicts on in-place import @snapshots', () => {
  let A: TenantCtx;
  beforeEach(async () => {
    A = await sessionForNewClientUser('snap-slug-conflict');
    mockedAuth.mockResolvedValue(A.session);
  });

  it('preserves the existing post and suffixes the imported one as -imported-1', async () => {
    // Site A: source — has post slug='hello' with body "from-source".
    const { siteId: sourceSite } = await seedSite(A, 'src');
    await seedPost(sourceSite, 'hello', {
      title: 'Hello from source',
      content: { blocks: [{ type: 'paragraph', text: 'from-source' }], version: '1.0' },
    });

    const snapshotId = await exportSiteToSnapshot(sourceSite);

    // Site B: target — already has a post slug='hello' with body "from-target".
    const { siteId: targetSite } = await seedSite(A, 'tgt');
    const existingTargetPost = await seedPost(targetSite, 'hello', {
      title: 'Hello from target',
      content: { blocks: [{ type: 'paragraph', text: 'from-target' }], version: '1.0' },
    });

    // Import without createNewSite — into the existing target.
    const importRoute = await import('@/app/api/portal/snapshots/[id]/import/route');
    const importRes = await callHandler<{
      success: boolean;
      data: { siteId: number; postsCreated: number; conflicts: string[] };
    }>(importRoute as unknown as Record<string, unknown>, 'POST', {
      params: { id: String(snapshotId) },
      body: { siteId: targetSite },
    });
    expect(importRes.status).toBe(200);
    expect(importRes.data?.success).toBe(true);
    expect(importRes.data?.data.siteId).toBe(targetSite);
    expect(importRes.data?.data.postsCreated).toBe(1);
    expect(importRes.data?.data.conflicts).toHaveLength(1);
    expect(importRes.data?.data.conflicts[0]).toContain('hello');
    expect(importRes.data?.data.conflicts[0]).toContain('hello-imported-1');

    // The existing post is untouched: same id, same content body.
    const sql = getTestSql();
    const [preserved] = await sql<{ id: number; title: string; content: string }[]>`
      SELECT id, title, content FROM ${sql(TEST_SCHEMA)}.posts
      WHERE website_id = ${targetSite} AND slug = 'hello'
    `;
    expect(preserved.id).toBe(existingTargetPost.id);
    expect(preserved.title).toBe('Hello from target');
    expect(preserved.content).toContain('from-target');

    // The imported post landed at the suffixed slug, with the source body.
    const [imported] = await sql<{ id: number; title: string; content: string }[]>`
      SELECT id, title, content FROM ${sql(TEST_SCHEMA)}.posts
      WHERE website_id = ${targetSite} AND slug = 'hello-imported-1'
    `;
    expect(imported).toBeDefined();
    expect(imported.id).not.toBe(existingTargetPost.id);
    expect(imported.title).toBe('Hello from source');
    expect(imported.content).toContain('from-source');

    // No third row materialised on the target (we used to leak duplicate
    // inserts when the slug uniquification path was buggy; lock that down).
    const allOnTarget = await sql<{ slug: string }[]>`
      SELECT slug FROM ${sql(TEST_SCHEMA)}.posts WHERE website_id = ${targetSite}
    `;
    expect(allOnTarget.map((r) => r.slug).sort()).toEqual(['hello', 'hello-imported-1']);
  });

  it('walks suffixes when -imported-1 is also taken', async () => {
    const { siteId: sourceSite } = await seedSite(A, 'multi-src');
    await seedPost(sourceSite, 'about');
    const snapshotId = await exportSiteToSnapshot(sourceSite);

    const { siteId: targetSite } = await seedSite(A, 'multi-tgt');
    await seedPost(targetSite, 'about');
    await seedPost(targetSite, 'about-imported-1');

    const importRoute = await import('@/app/api/portal/snapshots/[id]/import/route');
    const importRes = await callHandler<{
      success: boolean;
      data: { conflicts: string[] };
    }>(importRoute as unknown as Record<string, unknown>, 'POST', {
      params: { id: String(snapshotId) },
      body: { siteId: targetSite },
    });
    expect(importRes.status).toBe(200);
    expect(importRes.data?.data.conflicts[0]).toContain('about-imported-2');
  });
});
