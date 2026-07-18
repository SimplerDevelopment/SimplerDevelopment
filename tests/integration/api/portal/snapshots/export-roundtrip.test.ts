/**
 * Site snapshots — export → download → import → re-export round-trip.
 *
 * Exercises the full HTTP surface in a single scenario:
 *   1. Seed a site with two posts (different post types), one nav tree, custom code.
 *   2. POST /api/portal/sites/[siteId]/export — persist a snapshot row.
 *   3. GET  /api/portal/snapshots/[id]/download — assert it matches the schema.
 *   4. POST /api/portal/snapshots/[id]/import (createNewSite=true) — apply.
 *   5. POST /api/portal/sites/[newSiteId]/export — re-export the cloned site.
 *   6. Compare canonical-form payloads — they must be deep-equal modulo IDs/timestamps/
 *      site-level fields the importer intentionally normalises (publicAccess flips off).
 *
 * The unit test (tests/unit/snapshots-export-import.test.ts) covers pure helpers
 * with synthetic payloads; this spec proves the wire-protocol round-trip behaves
 * correctly against a real DB.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
// `getPortalClient` reads the active-client cookie; outside a real request
// next/headers throws. Stub so the resolver path is deterministic.
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
import type { SnapshotPayload, SnapshotPost } from '@/lib/snapshots/types';

async function seedSite(
  ctx: TenantCtx,
  overrides: { name?: string; customCss?: string; customJs?: string } = {},
): Promise<{ siteId: number }> {
  const sql = getTestSql();
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 9999)}`;
  const [s] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.client_websites (
      client_id, name, domain, description, custom_css, custom_js, public_access
    ) VALUES (
      ${ctx.client.id},
      ${overrides.name ?? `snapshot-src-${stamp}`},
      ${`snapshot-src-${stamp}.test`},
      ${'Source site for export round-trip'},
      ${overrides.customCss ?? '/* sitewide */ body { color: rebeccapurple; }'},
      ${overrides.customJs ?? '// sitewide js\nwindow.__sd = true;'},
      ${true}
    ) RETURNING id
  `;
  return { siteId: s.id };
}

async function seedPost(
  siteId: number,
  overrides: {
    slug: string;
    title?: string;
    postType?: string;
    content?: unknown;
    published?: boolean;
  },
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
      ${siteId},
      ${overrides.title ?? `Title-${overrides.slug}`},
      ${overrides.slug},
      ${overrides.postType ?? 'page'},
      ${content},
      ${overrides.published ?? true}
    ) RETURNING id
  `;
  return row;
}

async function seedNav(
  siteId: number,
  label: string,
  href: string,
  sortOrder = 0,
): Promise<{ id: number }> {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.site_navigation (
      website_id, label, href, sort_order
    ) VALUES (${siteId}, ${label}, ${href}, ${sortOrder}) RETURNING id
  `;
  return row;
}

/** Strip non-portable fields (volatile timestamps, IDs that the import
 *  rehydrates) so we can deep-equal two snapshots taken from "the same"
 *  logical site at different times. */
function canonicalize(p: SnapshotPayload) {
  const sortPosts = (xs: SnapshotPost[]) => [...xs].sort((a, b) => a.slug.localeCompare(b.slug));
  return {
    schemaVersion: p.schemaVersion,
    posts: sortPosts(p.posts).map((post) => ({
      slug: post.slug,
      type: post.type,
      title: post.title,
      status: post.status,
      content: post.content,
      // Drop SEO/meta nulls — both sides agree on shape so direct compare works,
      // but nullable defaults can differ. Keep the truthy bits.
      meta: {
        excerpt: post.meta?.excerpt ?? null,
        coverImage: post.meta?.coverImage ?? null,
        seoTitle: post.meta?.seoTitle ?? null,
        seoDescription: post.meta?.seoDescription ?? null,
        ogImage: post.meta?.ogImage ?? null,
        noIndex: post.meta?.noIndex ?? false,
        canonicalUrl: post.meta?.canonicalUrl ?? null,
        customCss: post.meta?.customCss ?? null,
        customJs: post.meta?.customJs ?? null,
      },
    })),
    navigation: p.navigation,
    customCode: p.site.customCode ?? null,
  };
}

describe('Site snapshots — export/import round-trip @snapshots', () => {
  let A: TenantCtx;
  beforeEach(async () => {
    A = await sessionForNewClientUser('snap-roundtrip');
    mockedAuth.mockResolvedValue(A.session);
  });

  it('exports → downloads → imports as new site → re-exports to a deep-equal canonical payload', async () => {
    // 1. Seed site + posts + nav + custom code.
    const { siteId } = await seedSite(A);
    await seedPost(siteId, {
      slug: 'home',
      title: 'Home',
      postType: 'page',
      content: { blocks: [{ type: 'heading', text: 'Welcome' }], version: '1.0' },
    });
    await seedPost(siteId, {
      slug: 'first-blog',
      title: 'First Post',
      postType: 'blog',
      content: { blocks: [{ type: 'paragraph', text: 'hello' }], version: '1.0' },
    });

    // Two-level nav: Home, then Services with a child.
    await seedNav(siteId, 'Home', '/', 0);
    const services = await seedNav(siteId, 'Services', '/services', 1);
    const sql = getTestSql();
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.site_navigation (website_id, label, href, parent_id, sort_order)
      VALUES (${siteId}, 'Web', '/services/web', ${services.id}, 0)
    `;

    // 2. POST export.
    const exportRoute = await import('@/app/api/portal/sites/[siteId]/export/route');
    const exportRes = await callHandler<{
      success: boolean;
      data: { id: number; sourceSiteId: number; name: string };
    }>(exportRoute as unknown as Record<string, unknown>, 'POST', {
      params: { siteId: String(siteId) },
      body: { name: `roundtrip-snap-${Date.now()}` },
    });
    expect(exportRes.status).toBe(200);
    expect(exportRes.data?.success).toBe(true);
    expect(exportRes.data?.data.sourceSiteId).toBe(siteId);
    const snapshotId = exportRes.data!.data.id;

    // 2b. version=1 on the persisted row.
    const [snapRow] = await sql<{ version: number; client_id: number }[]>`
      SELECT version, client_id FROM ${sql(TEST_SCHEMA)}.site_snapshots WHERE id = ${snapshotId}
    `;
    expect(snapRow.version).toBe(1);
    expect(snapRow.client_id).toBe(A.client.id);

    // 3. GET download — must be valid JSON, schemaVersion=1, posts/nav present.
    const downloadRoute = await import('@/app/api/portal/snapshots/[id]/download/route');
    const downloadRes = await callHandler(
      downloadRoute as unknown as Record<string, unknown>,
      'GET',
      { params: { id: String(snapshotId) } },
    );
    expect(downloadRes.status).toBe(200);
    expect(downloadRes.headers.get('content-disposition')).toMatch(/attachment;\s*filename=/);
    expect(downloadRes.headers.get('content-type')).toMatch(/application\/json/);

    // The download route returns raw JSON text (not the success envelope).
    // callHandler only auto-parses application/json bodies — it already did.
    const downloadedPayload = downloadRes.data as unknown as SnapshotPayload;
    expect(downloadedPayload.schemaVersion).toBe(1);
    expect(downloadedPayload.posts).toHaveLength(2);
    expect(downloadedPayload.posts.map((p) => p.slug).sort()).toEqual(['first-blog', 'home']);
    // Nav has the 'main' menu with two top-level items.
    expect(downloadedPayload.navigation[0].key).toBe('main');
    expect(downloadedPayload.navigation[0].items).toHaveLength(2);
    // Custom code preserved.
    expect(downloadedPayload.site.customCode?.customCss).toMatch(/rebeccapurple/);
    expect(downloadedPayload.site.customCode?.customJs).toMatch(/window\.__sd/);

    // 4. POST import as a new site.
    const importRoute = await import('@/app/api/portal/snapshots/[id]/import/route');
    const importRes = await callHandler<{
      success: boolean;
      data: { siteId: number; postsCreated: number; conflicts: string[] };
    }>(importRoute as unknown as Record<string, unknown>, 'POST', {
      params: { id: String(snapshotId) },
      body: { createNewSite: true, newSiteName: 'Imported Round-trip' },
    });
    expect(importRes.status).toBe(200);
    expect(importRes.data?.success).toBe(true);
    expect(importRes.data?.data.postsCreated).toBe(2);
    expect(importRes.data?.data.conflicts).toEqual([]);
    const newSiteId = importRes.data!.data.siteId;
    expect(newSiteId).not.toBe(siteId);

    // 4b. Two new posts exist on the new site, with the same slugs but new IDs.
    const newPostRows = await sql<{ id: number; slug: string; post_type: string }[]>`
      SELECT id, slug, post_type FROM ${sql(TEST_SCHEMA)}.posts
      WHERE website_id = ${newSiteId} ORDER BY slug ASC
    `;
    expect(newPostRows.map((r) => r.slug)).toEqual(['first-blog', 'home']);
    const oldPostRows = await sql<{ id: number; slug: string }[]>`
      SELECT id, slug FROM ${sql(TEST_SCHEMA)}.posts WHERE website_id = ${siteId}
    `;
    const oldIds = new Set(oldPostRows.map((r) => r.id));
    for (const r of newPostRows) {
      expect(oldIds.has(r.id)).toBe(false);
    }
    // Post types preserved.
    expect(newPostRows.find((r) => r.slug === 'home')?.post_type).toBe('page');
    expect(newPostRows.find((r) => r.slug === 'first-blog')?.post_type).toBe('blog');

    // 5. Re-export the new site and assert canonical equality with the original.
    const reExport = await callHandler<{ success: boolean; data: { id: number } }>(
      exportRoute as unknown as Record<string, unknown>,
      'POST',
      {
        params: { siteId: String(newSiteId) },
        body: { name: `roundtrip-reexport-${Date.now()}` },
      },
    );
    expect(reExport.status).toBe(200);
    const [reExportRow] = await sql<{ payload: SnapshotPayload }[]>`
      SELECT payload FROM ${sql(TEST_SCHEMA)}.site_snapshots WHERE id = ${reExport.data!.data.id}
    `;

    expect(canonicalize(reExportRow.payload)).toEqual(canonicalize(downloadedPayload));
  });
});
