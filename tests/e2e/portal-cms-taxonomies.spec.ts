/**
 * Portal CMS Taxonomies API E2E Tests
 *
 * Tests for custom taxonomies and taxonomy terms.
 * All tests are rerunnable.
 */
import { test, expect } from './setup/coverage-fixture';
import { runCleanups, createTestWebsite, createTestTaxonomy } from './setup/helpers';

test.describe.configure({ mode: 'serial' });

test.describe('Portal CMS Taxonomies @cms @taxonomies', () => {
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

  test('POST creates a custom taxonomy', async ({ clientApi }) => {
    const { taxonomy, cleanup } = await createTestTaxonomy(clientApi, siteId);
    cleanups.push(cleanup);

    expect(taxonomy).toHaveProperty('id');
    expect(taxonomy.name).toContain('Test Taxonomy');
    expect(taxonomy.slug).toContain('test-tax-');
  });

  test('POST creates a hierarchical taxonomy', async ({ clientApi }) => {
    const ts = Date.now();
    const { taxonomy, cleanup } = await createTestTaxonomy(clientApi, siteId, {
      name: `Hierarchical Tax ${ts}`,
      slug: `hier-tax-${ts}`,
      hierarchical: true,
      icon: 'folder',
    });
    cleanups.push(cleanup);

    expect(taxonomy.hierarchical).toBe(true);
  });

  test('GET /taxonomies lists taxonomies', async ({ clientApi }) => {
    const { cleanup } = await createTestTaxonomy(clientApi, siteId);
    cleanups.push(cleanup);

    const res = await clientApi.get(`/api/portal/cms/websites/${siteId}/taxonomies`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
    expect(res.data.data.length).toBeGreaterThanOrEqual(1);
  });

  test('POST rejects duplicate slug', async ({ clientApi }) => {
    const ts = Date.now();
    const slug = `dup-tax-${ts}`;
    const { cleanup } = await createTestTaxonomy(clientApi, siteId, { slug });
    cleanups.push(cleanup);

    const res = await clientApi.post(`/api/portal/cms/websites/${siteId}/taxonomies`, {
      name: 'Duplicate',
      slug,
    });
    expect(res.status).toBe(409);
  });

  test('POST rejects missing name or slug', async ({ clientApi }) => {
    const res = await clientApi.post(`/api/portal/cms/websites/${siteId}/taxonomies`, {
      name: '',
      slug: '',
    });
    expect(res.status).toBe(400);
  });

  test('rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get(`/api/portal/cms/websites/${siteId}/taxonomies`);
    expect(res.status).toBe(401);
  });
});

test.describe('Portal CMS Taxonomy Terms @cms @taxonomy-terms', () => {
  let cleanups: Array<() => Promise<void>> = [];
  let siteId: number;
  let taxonomyId: number;

  test.beforeAll(async ({ clientApi }) => {
    const { website } = await createTestWebsite(clientApi);
    siteId = website.id;
    const { taxonomy } = await createTestTaxonomy(clientApi, siteId);
    taxonomyId = taxonomy.id;
  });

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('POST creates a term', async ({ clientApi }) => {
    const ts = Date.now();
    const res = await clientApi.post(
      `/api/portal/cms/websites/${siteId}/taxonomies/${taxonomyId}/terms`,
      { name: `Term ${ts}`, slug: `term-${ts}` },
    );
    expect(res.status).toBe(201);
    expect(res.data.success).toBe(true);
    expect(res.data.data).toHaveProperty('id');
    expect(res.data.data.name).toContain('Term');

    cleanups.push(async () => {
      await clientApi.delete(
        `/api/portal/cms/websites/${siteId}/taxonomies/${taxonomyId}/terms/${res.data.data.id}`,
      ).catch(() => {});
    });
  });

  test('GET /terms lists terms for a taxonomy', async ({ clientApi }) => {
    const ts = Date.now();
    await clientApi.post(
      `/api/portal/cms/websites/${siteId}/taxonomies/${taxonomyId}/terms`,
      { name: `Listed Term ${ts}`, slug: `listed-${ts}` },
    );

    const res = await clientApi.get(
      `/api/portal/cms/websites/${siteId}/taxonomies/${taxonomyId}/terms`,
    );
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
    expect(res.data.data.length).toBeGreaterThanOrEqual(1);
  });

  test('PUT /terms/[termId] updates a term', async ({ clientApi }) => {
    const ts = Date.now();
    const create = await clientApi.post(
      `/api/portal/cms/websites/${siteId}/taxonomies/${taxonomyId}/terms`,
      { name: `Updatable ${ts}`, slug: `updatable-${ts}` },
    );
    const termId = create.data.data.id;
    cleanups.push(async () => {
      await clientApi.delete(
        `/api/portal/cms/websites/${siteId}/taxonomies/${taxonomyId}/terms/${termId}`,
      ).catch(() => {});
    });

    const res = await clientApi.put(
      `/api/portal/cms/websites/${siteId}/taxonomies/${taxonomyId}/terms/${termId}`,
      { name: 'Renamed Term' },
    );
    expect(res.status).toBe(200);
    expect(res.data.data.name).toBe('Renamed Term');
  });

  test('DELETE /terms/[termId] removes a term', async ({ clientApi }) => {
    const ts = Date.now();
    const create = await clientApi.post(
      `/api/portal/cms/websites/${siteId}/taxonomies/${taxonomyId}/terms`,
      { name: `Deletable ${ts}`, slug: `deletable-${ts}` },
    );

    const res = await clientApi.delete(
      `/api/portal/cms/websites/${siteId}/taxonomies/${taxonomyId}/terms/${create.data.data.id}`,
    );
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
  });
});
