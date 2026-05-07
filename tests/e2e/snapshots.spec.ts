/**
 * Site Snapshots — E2E
 *
 * Round-trip: create a site, add 2 posts, export → snapshot, import as a new
 * site, verify the new site has 2 posts. Also covers slug-conflict resolution
 * on in-place re-import.
 */
import { test, expect } from './setup/fixtures';
import { runCleanups, createTestWebsite, createTestPost } from './setup/helpers';

test.describe.configure({ mode: 'serial' });

test.describe('Site snapshots @snapshots @critical', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('export then import as a new site preserves posts', async ({ clientApi }) => {
    // 1. Create a fresh site with two posts.
    const { website: source } = await createTestWebsite(clientApi);
    const { post: p1, cleanup: pc1 } = await createTestPost(clientApi, source.id, {
      title: 'Snapshot Source A',
      slug: `snap-src-a-${Date.now()}`,
    });
    cleanups.push(pc1);
    const { post: p2, cleanup: pc2 } = await createTestPost(clientApi, source.id, {
      title: 'Snapshot Source B',
      slug: `snap-src-b-${Date.now()}`,
    });
    cleanups.push(pc2);

    // 2. Export.
    const exportRes = await clientApi.post(`/api/portal/sites/${source.id}/export`, {
      name: `e2e-snapshot-${Date.now()}`,
    });
    expect(exportRes.status).toBe(200);
    expect(exportRes.data.success).toBe(true);
    const snapshotId = exportRes.data.data.id as number;
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/snapshots/${snapshotId}`).catch(() => {});
    });

    // 3. List snapshots — confirm it appears.
    const listRes = await clientApi.get('/api/portal/snapshots');
    expect(listRes.status).toBe(200);
    expect(listRes.data.data.some((s: { id: number }) => s.id === snapshotId)).toBe(true);

    // 4. Get the full snapshot — confirm payload shape.
    const detailRes = await clientApi.get(`/api/portal/snapshots/${snapshotId}`);
    expect(detailRes.status).toBe(200);
    const payload = detailRes.data.data.payload;
    expect(payload.schemaVersion).toBe(1);
    expect(payload.posts).toHaveLength(2);
    const slugs = payload.posts.map((p: { slug: string }) => p.slug).sort();
    expect(slugs).toContain(p1.slug);
    expect(slugs).toContain(p2.slug);

    // 5. Import as a new site.
    const importRes = await clientApi.post(`/api/portal/snapshots/${snapshotId}/import`, {
      createNewSite: true,
      newSiteName: `Snapshot Imported ${Date.now()}`,
    });
    expect(importRes.status).toBe(200);
    expect(importRes.data.success).toBe(true);
    const newSiteId = importRes.data.data.siteId as number;
    expect(importRes.data.data.postsCreated).toBe(2);

    // 6. Verify the new site has 2 posts via the CMS API.
    const newPostsRes = await clientApi.get(`/api/portal/cms/websites/${newSiteId}/posts`);
    expect(newPostsRes.status).toBe(200);
    expect(newPostsRes.data.data.length).toBeGreaterThanOrEqual(2);
    const newSlugs = newPostsRes.data.data.map((p: { slug: string }) => p.slug);
    expect(newSlugs).toContain(p1.slug);
    expect(newSlugs).toContain(p2.slug);
  });

  test('re-importing into the same site suffixes conflicting slugs', async ({ clientApi }) => {
    const { website: site } = await createTestWebsite(clientApi);
    const { post } = await createTestPost(clientApi, site.id, {
      title: 'Original',
      slug: `orig-${Date.now()}`,
    });

    const exportRes = await clientApi.post(`/api/portal/sites/${site.id}/export`, {
      name: `e2e-snapshot-conflict-${Date.now()}`,
    });
    expect(exportRes.status).toBe(200);
    const snapshotId = exportRes.data.data.id as number;
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/snapshots/${snapshotId}`).catch(() => {});
    });

    // In-place import — every existing slug should become a conflict.
    const importRes = await clientApi.post(`/api/portal/snapshots/${snapshotId}/import`, {
      siteId: site.id,
    });
    expect(importRes.status).toBe(200);
    expect(importRes.data.data.conflicts.length).toBeGreaterThan(0);
    expect(
      importRes.data.data.conflicts.some((c: string) => c.includes(post.slug)),
    ).toBe(true);

    // The imported copy should be reachable under its suffixed slug.
    const postsRes = await clientApi.get(`/api/portal/cms/websites/${site.id}/posts`);
    const slugs = postsRes.data.data.map((p: { slug: string }) => p.slug);
    expect(slugs).toContain(post.slug);
    expect(slugs.some((s: string) => s.startsWith(`${post.slug}-imported-`))).toBe(true);
  });

  test('download endpoint returns the payload as JSON', async ({ clientApi }) => {
    const { website: site } = await createTestWebsite(clientApi);
    await createTestPost(clientApi, site.id, { title: 'DL Test', slug: `dl-${Date.now()}` });

    const exportRes = await clientApi.post(`/api/portal/sites/${site.id}/export`, {
      name: `e2e-snapshot-dl-${Date.now()}`,
    });
    const snapshotId = exportRes.data.data.id as number;
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/snapshots/${snapshotId}`).catch(() => {});
    });

    // The download endpoint returns the snapshot payload directly (not the
    // standard envelope). `clientApi.get` parses JSON regardless of headers.
    const dlRes = await clientApi.get(`/api/portal/snapshots/${snapshotId}/download`);
    expect(dlRes.status).toBe(200);
    expect(dlRes.data?.schemaVersion).toBe(1);
    expect(Array.isArray(dlRes.data?.posts)).toBe(true);
  });

  test('rejects unauthenticated access', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/snapshots');
    expect(res.status).toBe(401);
  });
});
