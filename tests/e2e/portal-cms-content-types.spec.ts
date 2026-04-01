/**
 * Portal CMS Content Types API E2E Tests
 *
 * Tests for custom content type CRUD.
 * All tests are rerunnable.
 */
import { test, expect } from './setup/fixtures';
import { runCleanups, createTestWebsite, createTestContentType } from './setup/helpers';

test.describe.configure({ mode: 'serial' });

test.describe('Portal CMS Content Types @cms @content-types', () => {
  let cleanups: Array<() => Promise<void>> = [];
  let siteId: number;

  test.beforeAll(async ({ clientApi }) => {
    const { website } = await createTestWebsite(clientApi);
    siteId = website.id;
  });

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('POST creates a content type', async ({ clientApi }) => {
    const { contentType, cleanup } = await createTestContentType(clientApi, siteId);
    cleanups.push(cleanup);

    expect(contentType).toHaveProperty('id');
    expect(contentType.name).toContain('Test Type');
    expect(contentType.slug).toContain('test-type-');
    expect(contentType.active).toBe(true);
  });

  test('POST creates content type with custom icon', async ({ clientApi }) => {
    const ts = Date.now();
    const { contentType, cleanup } = await createTestContentType(clientApi, siteId, {
      name: `Portfolio ${ts}`,
      slug: `portfolio-${ts}`,
      icon: 'image',
      description: 'Portfolio items',
    });
    cleanups.push(cleanup);

    expect(contentType.icon).toBe('image');
    expect(contentType.description).toBe('Portfolio items');
  });

  test('GET /content-types lists content types', async ({ clientApi }) => {
    const { cleanup } = await createTestContentType(clientApi, siteId);
    cleanups.push(cleanup);

    const res = await clientApi.get(`/api/portal/cms/websites/${siteId}/content-types`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
    expect(res.data.data.length).toBeGreaterThanOrEqual(1);
  });

  test('POST rejects duplicate slug', async ({ clientApi }) => {
    const ts = Date.now();
    const slug = `dup-type-${ts}`;
    const { cleanup } = await createTestContentType(clientApi, siteId, { slug });
    cleanups.push(cleanup);

    const res = await clientApi.post(`/api/portal/cms/websites/${siteId}/content-types`, {
      name: 'Duplicate Type',
      slug,
    });
    expect(res.status).toBe(409);
  });

  test('POST rejects missing name or slug', async ({ clientApi }) => {
    const res = await clientApi.post(`/api/portal/cms/websites/${siteId}/content-types`, {
      name: '',
      slug: '',
    });
    expect(res.status).toBe(400);
  });

  test('PUT /content-types/[id] updates a content type', async ({ clientApi }) => {
    const { contentType, cleanup } = await createTestContentType(clientApi, siteId);
    cleanups.push(cleanup);

    const res = await clientApi.put(
      `/api/portal/cms/websites/${siteId}/content-types/${contentType.id}`,
      { name: 'Renamed Type', description: 'Updated description' },
    );
    expect(res.status).toBe(200);
    expect(res.data.data.name).toBe('Renamed Type');
  });

  test('DELETE /content-types/[id] removes a content type', async ({ clientApi }) => {
    const { contentType } = await createTestContentType(clientApi, siteId);

    const res = await clientApi.delete(
      `/api/portal/cms/websites/${siteId}/content-types/${contentType.id}`,
    );
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
  });

  test('rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get(`/api/portal/cms/websites/${siteId}/content-types`);
    expect(res.status).toBe(401);
  });
});
