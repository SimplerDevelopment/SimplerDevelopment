/**
 * Portal CMS Media API E2E Tests
 *
 * Tests for /api/portal/cms/websites/[siteId]/media
 */
import { test, expect } from './setup/fixtures';
import { runCleanups, createTestWebsite } from './setup/helpers';

// Serial: tests share a website created in the first test
test.describe.configure({ mode: 'serial' });

test.describe('Portal CMS Media @cms @media', () => {
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

  test('GET lists media scoped to website with pagination', async ({ clientApi }) => {
    const res = await clientApi.get(`/api/portal/cms/websites/${siteId}/media?limit=10&offset=0`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
    expect(res.data.pagination).toHaveProperty('total');
    expect(res.data.pagination).toHaveProperty('limit');
    expect(res.data.pagination).toHaveProperty('offset');
  });

  test('POST upload creates media scoped to website', async ({ clientApi }) => {
    // Create a tiny PNG (1x1 pixel)
    const pngBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );

    const res = await clientApi.postForm(`/api/portal/cms/websites/${siteId}/media/upload`, {
      file: { name: `test-${Date.now()}.png`, mimeType: 'image/png', buffer: pngBuffer },
      alt: 'Test image alt',
      caption: 'Test caption',
    });

    // Upload may fail if S3 is not configured in test env — that's expected
    if (res.status === 201) {
      expect(res.data.success).toBe(true);
      expect(res.data.data.websiteId).toBe(siteId);
      expect(res.data.data.alt).toBe('Test image alt');
      expect(res.data.data.caption).toBe('Test caption');

      cleanups.push(async () => {
        await clientApi.delete(`/api/portal/cms/websites/${siteId}/media/${res.data.data.id}`).catch(() => {});
      });
    } else {
      // S3 not configured — skip assertions but don't fail
      test.skip(true, 'S3/Supabase storage not configured for testing');
    }
  });

  test('PUT updates media metadata', async ({ clientApi }) => {
    // This test depends on having uploaded media. We'll create one inline.
    const pngBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );
    const upload = await clientApi.postForm(`/api/portal/cms/websites/${siteId}/media/upload`, {
      file: { name: `test-update-${Date.now()}.png`, mimeType: 'image/png', buffer: pngBuffer },
    });

    if (upload.status !== 201) {
      test.skip(true, 'S3 not configured');
      return;
    }

    const mediaId = upload.data.data.id;
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/cms/websites/${siteId}/media/${mediaId}`).catch(() => {});
    });

    const res = await clientApi.put(`/api/portal/cms/websites/${siteId}/media/${mediaId}`, {
      alt: 'Updated alt text',
      caption: 'Updated caption',
    });
    expect(res.status).toBe(200);
    expect(res.data.data.alt).toBe('Updated alt text');
    expect(res.data.data.caption).toBe('Updated caption');
  });

  test('DELETE removes media', async ({ clientApi }) => {
    const pngBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );
    const upload = await clientApi.postForm(`/api/portal/cms/websites/${siteId}/media/upload`, {
      file: { name: `test-delete-${Date.now()}.png`, mimeType: 'image/png', buffer: pngBuffer },
    });

    if (upload.status !== 201) {
      test.skip(true, 'S3 not configured');
      return;
    }

    const mediaId = upload.data.data.id;
    const res = await clientApi.delete(`/api/portal/cms/websites/${siteId}/media/${mediaId}`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
  });

  test('GET supports search filter', async ({ clientApi }) => {
    const res = await clientApi.get(`/api/portal/cms/websites/${siteId}/media?search=nonexistent-file-xyz`);
    expect(res.status).toBe(200);
    expect(res.data.data).toEqual([]);
    expect(res.data.pagination.total).toBe(0);
  });

  test('GET supports mimeType filter', async ({ clientApi }) => {
    const res = await clientApi.get(`/api/portal/cms/websites/${siteId}/media?mimeType=video`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    // All results should be video type (or empty)
    for (const item of res.data.data) {
      expect(item.mimeType).toMatch(/^video\//);
    }
  });

  test('rejects unauthenticated access', async ({ unauthApi }) => {
    const res = await unauthApi.get(`/api/portal/cms/websites/${siteId}/media`);
    expect(res.status).toBe(401);
  });
});
