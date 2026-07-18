/**
 * Portal CMS Posts API E2E Tests
 *
 * Tests for enhanced posts with category/tag associations.
 */
import { test, expect } from './setup/fixtures';
import { runCleanups, createTestWebsite, createTestCategory, createTestTag, createTestPost } from './setup/helpers';

// Serial: tests share a website created in the first test
test.describe.configure({ mode: 'serial' });

test.describe('Portal CMS Posts with Categories & Tags @cms @posts @critical', () => {
  let cleanups: Array<() => Promise<void>> = [];
  let siteId: number;

  test('setup: create test website', async ({ clientApi }) => {
    const { website } = await createTestWebsite(clientApi);
    siteId = website.id;
  });

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('POST creates a post with categoryIds and tagIds', async ({ clientApi }) => {
    const { category, cleanup: catCleanup } = await createTestCategory(clientApi, siteId);
    cleanups.push(catCleanup);
    const { tag, cleanup: tagCleanup } = await createTestTag(clientApi, siteId);
    cleanups.push(tagCleanup);

    const slug = `post-with-tax-${Date.now()}`;
    const res = await clientApi.post(`/api/portal/cms/websites/${siteId}/posts`, {
      title: 'Post With Taxonomies',
      slug,
      content: JSON.stringify({ blocks: [], version: '1.0' }),
      postType: 'blog',
      published: false,
      categoryIds: [category.id],
      tagIds: [tag.id],
    });

    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    const postId = res.data.data.id;

    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/cms/websites/${siteId}/posts/${postId}`).catch(() => {});
    });

    // Verify associations are returned on GET
    const getRes = await clientApi.get(`/api/portal/cms/websites/${siteId}/posts/${postId}`);
    expect(getRes.status).toBe(200);
    expect(getRes.data.data.categoryIds).toContain(category.id);
    expect(getRes.data.data.tagIds).toContain(tag.id);
  });

  test('POST creates a post without categories/tags (empty arrays)', async ({ clientApi }) => {
    const { post, cleanup } = await createTestPost(clientApi, siteId);
    cleanups.push(cleanup);

    const getRes = await clientApi.get(`/api/portal/cms/websites/${siteId}/posts/${post.id}`);
    expect(getRes.status).toBe(200);
    expect(getRes.data.data.categoryIds).toEqual([]);
    expect(getRes.data.data.tagIds).toEqual([]);
  });

  test('PUT syncs categoryIds and tagIds on update', async ({ clientApi }) => {
    // Create two categories and two tags
    const { category: cat1, cleanup: c1 } = await createTestCategory(clientApi, siteId, { name: 'Cat A', slug: `cat-a-${Date.now()}` });
    cleanups.push(c1);
    const { category: cat2, cleanup: c2 } = await createTestCategory(clientApi, siteId, { name: 'Cat B', slug: `cat-b-${Date.now()}` });
    cleanups.push(c2);
    const { tag: tag1, cleanup: t1 } = await createTestTag(clientApi, siteId, { name: 'Tag X', slug: `tag-x-${Date.now()}` });
    cleanups.push(t1);
    const { tag: tag2, cleanup: t2 } = await createTestTag(clientApi, siteId, { name: 'Tag Y', slug: `tag-y-${Date.now()}` });
    cleanups.push(t2);

    // Create post with cat1 and tag1
    const { post, cleanup: postCleanup } = await createTestPost(clientApi, siteId, {
      categoryIds: [cat1.id],
      tagIds: [tag1.id],
    });
    cleanups.push(postCleanup);

    // Update to cat2 and tag2
    const updateRes = await clientApi.put(`/api/portal/cms/websites/${siteId}/posts/${post.id}`, {
      categoryIds: [cat2.id],
      tagIds: [tag2.id],
    });
    expect(updateRes.status).toBe(200);

    // Verify old associations replaced with new
    const getRes = await clientApi.get(`/api/portal/cms/websites/${siteId}/posts/${post.id}`);
    expect(getRes.data.data.categoryIds).toEqual([cat2.id]);
    expect(getRes.data.data.tagIds).toEqual([tag2.id]);
  });

  test('PUT can clear all categories and tags', async ({ clientApi }) => {
    const { category, cleanup: catCleanup } = await createTestCategory(clientApi, siteId);
    cleanups.push(catCleanup);

    const { post, cleanup: postCleanup } = await createTestPost(clientApi, siteId, {
      categoryIds: [category.id],
    });
    cleanups.push(postCleanup);

    // Clear
    await clientApi.put(`/api/portal/cms/websites/${siteId}/posts/${post.id}`, {
      categoryIds: [],
      tagIds: [],
    });

    const getRes = await clientApi.get(`/api/portal/cms/websites/${siteId}/posts/${post.id}`);
    expect(getRes.data.data.categoryIds).toEqual([]);
    expect(getRes.data.data.tagIds).toEqual([]);
  });

  test('POST rejects duplicate slug within website', async ({ clientApi }) => {
    const slug = `dup-post-${Date.now()}`;
    const { cleanup } = await createTestPost(clientApi, siteId, { slug });
    cleanups.push(cleanup);

    const res = await clientApi.post(`/api/portal/cms/websites/${siteId}/posts`, {
      title: 'Duplicate',
      slug,
      content: JSON.stringify({ blocks: [], version: '1.0' }),
    });
    expect(res.status).toBe(400);
    expect(res.data.message).toContain('slug already exists');
  });

  test('DELETE removes a post', async ({ clientApi }) => {
    const { post } = await createTestPost(clientApi, siteId);

    const res = await clientApi.delete(`/api/portal/cms/websites/${siteId}/posts/${post.id}`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
  });

  test('rejects unauthenticated access', async ({ unauthApi }) => {
    const res = await unauthApi.get(`/api/portal/cms/websites/${siteId}/posts`);
    expect(res.status).toBe(401);
  });
});
