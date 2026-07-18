/**
 * Portal CMS Tags API E2E Tests
 *
 * Tests for /api/portal/cms/websites/[siteId]/tags
 */
import { test, expect } from './setup/fixtures';
import { runCleanups, createTestWebsite, createTestTag } from './setup/helpers';

// Serial: tests share a website created in the first test
test.describe.configure({ mode: 'serial' });

test.describe('Portal CMS Tags @cms @tags', () => {
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

  test('GET lists tags scoped to website', async ({ clientApi }) => {
    const { tag, cleanup } = await createTestTag(clientApi, siteId);
    cleanups.push(cleanup);

    const res = await clientApi.get(`/api/portal/cms/websites/${siteId}/tags`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);

    const found = res.data.data.find((t: { id: number }) => t.id === tag.id);
    expect(found).toBeTruthy();
  });

  test('POST creates a tag', async ({ clientApi }) => {
    const slug = `new-tag-${Date.now()}`;
    const res = await clientApi.post(`/api/portal/cms/websites/${siteId}/tags`, {
      name: 'New Tag',
      slug,
    });
    expect(res.status).toBe(201);
    expect(res.data.success).toBe(true);
    expect(res.data.data.slug).toBe(slug);
    expect(res.data.data.websiteId).toBe(siteId);

    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/cms/websites/${siteId}/tags/${res.data.data.id}`);
    });
  });

  test('POST rejects duplicate slug within same website', async ({ clientApi }) => {
    const slug = `dup-tag-${Date.now()}`;
    const { cleanup } = await createTestTag(clientApi, siteId, { slug, name: 'First' });
    cleanups.push(cleanup);

    const res = await clientApi.post(`/api/portal/cms/websites/${siteId}/tags`, {
      name: 'Second',
      slug,
    });
    expect(res.status).toBe(400);
    expect(res.data.message).toContain('already exists');
  });

  test('POST rejects missing fields', async ({ clientApi }) => {
    const res = await clientApi.post(`/api/portal/cms/websites/${siteId}/tags`, {
      name: '',
      slug: '',
    });
    expect(res.status).toBe(400);
  });

  test('PUT updates a tag', async ({ clientApi }) => {
    const { tag, cleanup } = await createTestTag(clientApi, siteId);
    cleanups.push(cleanup);

    const res = await clientApi.put(`/api/portal/cms/websites/${siteId}/tags/${tag.id}`, {
      name: 'Updated Tag Name',
    });
    expect(res.status).toBe(200);
    expect(res.data.data.name).toBe('Updated Tag Name');
  });

  test('DELETE removes a tag', async ({ clientApi }) => {
    const { tag } = await createTestTag(clientApi, siteId);

    const res = await clientApi.delete(`/api/portal/cms/websites/${siteId}/tags/${tag.id}`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);

    const list = await clientApi.get(`/api/portal/cms/websites/${siteId}/tags`);
    const found = list.data.data.find((t: { id: number }) => t.id === tag.id);
    expect(found).toBeUndefined();
  });

  test('rejects unauthenticated access', async ({ unauthApi }) => {
    const res = await unauthApi.get(`/api/portal/cms/websites/${siteId}/tags`);
    expect(res.status).toBe(401);
  });
});
