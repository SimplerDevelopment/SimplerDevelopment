/**
 * Portal CMS Categories API E2E Tests
 *
 * Tests for /api/portal/cms/websites/[siteId]/categories
 */
import { test, expect } from './setup/fixtures';
import { runCleanups, createTestWebsite, createTestCategory } from './setup/helpers';

// Serial: tests share a website created in the first test
test.describe.configure({ mode: 'serial' });

test.describe('Portal CMS Categories @cms @categories', () => {
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

  test('GET lists categories scoped to website', async ({ clientApi }) => {
    const { category, cleanup } = await createTestCategory(clientApi, siteId);
    cleanups.push(cleanup);

    const res = await clientApi.get(`/api/portal/cms/websites/${siteId}/categories`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);

    const found = res.data.data.find((c: { id: number }) => c.id === category.id);
    expect(found).toBeTruthy();
    expect(found.name).toBe(category.name);
  });

  test('POST creates a category', async ({ clientApi }) => {
    const slug = `new-cat-${Date.now()}`;
    const res = await clientApi.post(`/api/portal/cms/websites/${siteId}/categories`, {
      name: 'New Category',
      slug,
      description: 'Test description',
      color: '#ff5733',
    });
    expect(res.status).toBe(201);
    expect(res.data.success).toBe(true);
    expect(res.data.data.slug).toBe(slug);
    expect(res.data.data.websiteId).toBe(siteId);

    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/cms/websites/${siteId}/categories/${res.data.data.id}`);
    });
  });

  test('POST rejects duplicate slug within same website', async ({ clientApi }) => {
    const slug = `dup-slug-${Date.now()}`;
    const { cleanup } = await createTestCategory(clientApi, siteId, { slug, name: 'First' });
    cleanups.push(cleanup);

    const res = await clientApi.post(`/api/portal/cms/websites/${siteId}/categories`, {
      name: 'Second',
      slug,
    });
    expect(res.status).toBe(400);
    expect(res.data.message).toContain('already exists');
  });

  test('POST rejects missing name', async ({ clientApi }) => {
    const res = await clientApi.post(`/api/portal/cms/websites/${siteId}/categories`, {
      name: '',
      slug: '',
    });
    expect(res.status).toBe(400);
  });

  test('PUT updates a category', async ({ clientApi }) => {
    const { category, cleanup } = await createTestCategory(clientApi, siteId);
    cleanups.push(cleanup);

    const res = await clientApi.put(`/api/portal/cms/websites/${siteId}/categories/${category.id}`, {
      name: 'Updated Name',
      description: 'Updated description',
    });
    expect(res.status).toBe(200);
    expect(res.data.data.name).toBe('Updated Name');
  });

  test('DELETE removes a category', async ({ clientApi }) => {
    const { category } = await createTestCategory(clientApi, siteId);

    const res = await clientApi.delete(`/api/portal/cms/websites/${siteId}/categories/${category.id}`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);

    // Verify it's gone
    const list = await clientApi.get(`/api/portal/cms/websites/${siteId}/categories`);
    const found = list.data.data.find((c: { id: number }) => c.id === category.id);
    expect(found).toBeUndefined();
  });

  test('rejects access to non-existent website', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/cms/websites/999999/categories');
    expect(res.status).toBe(404);
  });

  test('rejects unauthenticated access', async ({ unauthApi }) => {
    const res = await unauthApi.get(`/api/portal/cms/websites/${siteId}/categories`);
    expect(res.status).toBe(401);
  });
});
