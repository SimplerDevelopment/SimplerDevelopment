/**
 * Public CMS API E2E Tests
 *
 * Tests the read-only public API endpoints that client websites consume.
 * Runs against production: creates test data via authenticated portal API,
 * then verifies it's accessible (or not) via the public API.
 */
import { test, expect } from './setup/fixtures';
import { runCleanups, createTestWebsite, createTestCategory, createTestTag, createTestPost } from './setup/helpers';

test.describe.configure({ mode: 'serial' });

test.describe('Public CMS API @public-cms @critical', () => {
  let cleanups: Array<() => Promise<void>> = [];
  let siteId: number;
  let publishedSlug: string;
  let draftSlug: string;

  test('setup: create test website with posts, categories, and tags', async ({ clientApi }) => {
    const { website } = await createTestWebsite(clientApi);
    siteId = website.id;

    // Create a category and tag
    const { category, cleanup: catCleanup } = await createTestCategory(clientApi, siteId);
    cleanups.push(catCleanup);
    const { tag, cleanup: tagCleanup } = await createTestTag(clientApi, siteId);
    cleanups.push(tagCleanup);

    // Create a published post with category and tag
    publishedSlug = `pub-${Date.now()}`;
    const { post: pubPost, cleanup: pubCleanup } = await createTestPost(clientApi, siteId, {
      title: 'Published Post',
      slug: publishedSlug,
      content: '<p>Hello from the public API test</p>',
      excerpt: 'Test excerpt',
      published: true,
      categoryIds: [category.id],
      tagIds: [tag.id],
    });
    cleanups.push(pubCleanup);

    // Create a draft post (should NOT appear in public API)
    draftSlug = `draft-${Date.now()}`;
    const { cleanup: draftCleanup } = await createTestPost(clientApi, siteId, {
      title: 'Draft Post',
      slug: draftSlug,
      content: '<p>This is a draft</p>',
      published: false,
    });
    cleanups.push(draftCleanup);
  });

  test('GET /api/public/websites/:siteId/posts returns only published posts', async ({ unauthApi }) => {
    const res = await unauthApi.get(`/api/public/websites/${siteId}/posts`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.pagination).toBeDefined();

    const slugs = res.data.data.map((p: { slug: string }) => p.slug);
    expect(slugs).toContain(publishedSlug);
    expect(slugs).not.toContain(draftSlug);
  });

  test('GET /api/public/websites/:siteId/posts does not expose full content in list', async ({ unauthApi }) => {
    const res = await unauthApi.get(`/api/public/websites/${siteId}/posts`);
    const post = res.data.data.find((p: { slug: string }) => p.slug === publishedSlug);
    expect(post).toBeDefined();
    // List endpoint returns excerpt but not full content
    expect(post.excerpt).toBeDefined();
    expect(post.content).toBeUndefined();
  });

  test('GET /api/public/websites/:siteId/posts/:slug returns full post with categories and tags', async ({ unauthApi }) => {
    const res = await unauthApi.get(`/api/public/websites/${siteId}/posts/${publishedSlug}`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.title).toBe('Published Post');
    expect(res.data.data.content).toContain('Hello from the public API test');
    expect(res.data.data.categories).toBeInstanceOf(Array);
    expect(res.data.data.categories.length).toBeGreaterThan(0);
    expect(res.data.data.tags).toBeInstanceOf(Array);
    expect(res.data.data.tags.length).toBeGreaterThan(0);
  });

  test('GET /api/public/websites/:siteId/posts/:slug returns 404 for draft post', async ({ unauthApi }) => {
    const res = await unauthApi.get(`/api/public/websites/${siteId}/posts/${draftSlug}`);
    expect(res.status).toBe(404);
  });

  test('GET /api/public/websites/:siteId/categories returns categories', async ({ unauthApi }) => {
    const res = await unauthApi.get(`/api/public/websites/${siteId}/categories`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.length).toBeGreaterThan(0);
    expect(res.data.data[0]).toHaveProperty('name');
    expect(res.data.data[0]).toHaveProperty('slug');
  });

  test('GET /api/public/websites/:siteId/tags returns tags', async ({ unauthApi }) => {
    const res = await unauthApi.get(`/api/public/websites/${siteId}/tags`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.length).toBeGreaterThan(0);
    expect(res.data.data[0]).toHaveProperty('name');
    expect(res.data.data[0]).toHaveProperty('slug');
  });

  test('GET /api/public/websites/:siteId/media returns media list', async ({ unauthApi }) => {
    const res = await unauthApi.get(`/api/public/websites/${siteId}/media`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.pagination).toBeDefined();
  });

  test('GET /api/public/websites/999999/posts returns 404 for non-existent site', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/public/websites/999999/posts');
    expect(res.status).toBe(404);
  });

  test.afterAll(async () => {
    await runCleanups(cleanups);
  });
});
