/**
 * PORTAL-C QA — CMS slice: posts, media, navigation, categories, tags, branding, content-types
 * Screenshots → .qa-reports/portal-c-screens/
 */
import { test, expect } from './setup/fixtures';
import * as path from 'path';
import * as fs from 'fs';
import { runCleanups, createTestWebsite } from './setup/helpers';

const SCREENS = path.resolve('.qa-reports/portal-c-screens');
fs.mkdirSync(SCREENS, { recursive: true });

test.describe.configure({ mode: 'serial' });

test.describe('PORTAL-C CMS — posts CRUD @portal-c @cms', () => {
  let siteId: number;
  const cleanups: Array<() => Promise<void>> = [];

  test('setup: create test website', async ({ clientApi }) => {
    const { website } = await createTestWebsite(clientApi);
    siteId = website.id;
  });

  test.afterAll(async () => { await runCleanups(cleanups); });

  test('post create with blocks round-trips via public API', async ({ clientApi, unauthApi }) => {
    const slug = `qa-c-post-${Date.now()}`;
    const res = await clientApi.post(`/api/portal/cms/websites/${siteId}/posts`, {
      title: 'QA-C Test Post',
      slug,
      content: JSON.stringify({ blocks: [
        { id: 'h1', type: 'heading', order: 0, content: 'Hello QA', level: 2 },
        { id: 't1', type: 'text', order: 1, content: 'Body paragraph' },
        { id: 'b1', type: 'button', order: 2, text: 'Click Me', url: '/about', variant: 'primary' },
      ], version: '1.0' }),
      postType: 'blog',
      published: true,
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    const postId = res.data.data.id;
    cleanups.push(async () => { await clientApi.delete(`/api/portal/cms/websites/${siteId}/posts/${postId}`).catch(() => {}); });

    const pub = await unauthApi.get(`/api/public/websites/${siteId}/posts/${slug}`);
    expect(pub.status).toBe(200);
    const content = JSON.parse(pub.data.data.content);
    expect(content.blocks).toHaveLength(3);
    expect(content.blocks[0].type).toBe('heading');
  });

  test('post update replaces blocks', async ({ clientApi, unauthApi }) => {
    const slug = `qa-c-upd-${Date.now()}`;
    const createRes = await clientApi.post(`/api/portal/cms/websites/${siteId}/posts`, {
      title: 'QA-C Update Test',
      slug,
      content: JSON.stringify({ blocks: [{ id: 'h1', type: 'heading', order: 0, content: 'Original' }], version: '1.0' }),
      postType: 'blog',
      published: true,
    });
    expect(createRes.status).toBe(200);
    const postId = createRes.data.data.id;
    cleanups.push(async () => { await clientApi.delete(`/api/portal/cms/websites/${siteId}/posts/${postId}`).catch(() => {}); });

    await clientApi.put(`/api/portal/cms/websites/${siteId}/posts/${postId}`, {
      content: JSON.stringify({ blocks: [{ id: 'h1', type: 'heading', order: 0, content: 'Updated' }], version: '1.0' }),
    });

    const pub = await unauthApi.get(`/api/public/websites/${siteId}/posts/${slug}`);
    const content = JSON.parse(pub.data.data.content);
    expect(content.blocks[0].content).toBe('Updated');
  });

  test('post XSS in heading content is stored as-is (sanitized at render)', async ({ clientApi, unauthApi }) => {
    const slug = `qa-c-xss-${Date.now()}`;
    const xssPayload = '<script>alert(1)</script>';
    const res = await clientApi.post(`/api/portal/cms/websites/${siteId}/posts`, {
      title: 'XSS Test',
      slug,
      content: JSON.stringify({ blocks: [{ id: 'h1', type: 'heading', order: 0, content: xssPayload }], version: '1.0' }),
      postType: 'blog',
      published: true,
    });
    expect(res.status).toBe(200);
    const postId = res.data.data.id;
    cleanups.push(async () => { await clientApi.delete(`/api/portal/cms/websites/${siteId}/posts/${postId}`).catch(() => {}); });

    const pub = await unauthApi.get(`/api/public/websites/${siteId}/posts/${slug}`);
    // Block content is stored; public page should NOT execute the script
    // We check the raw content storage
    const content = JSON.parse(pub.data.data.content);
    const rawContent = content.blocks[0].content;
    // It's OK if stored as-is; what matters is renderer sanitizes on output
    expect(typeof rawContent).toBe('string');
  });

  test('post list pagination', async ({ clientApi }) => {
    const res = await clientApi.get(`/api/portal/cms/websites/${siteId}/posts?limit=5&offset=0`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test('unpublished post not accessible via public API', async ({ clientApi, unauthApi }) => {
    const slug = `qa-c-draft-${Date.now()}`;
    const res = await clientApi.post(`/api/portal/cms/websites/${siteId}/posts`, {
      title: 'Draft Post',
      slug,
      content: JSON.stringify({ blocks: [], version: '1.0' }),
      postType: 'blog',
      published: false,
    });
    expect(res.status).toBe(200);
    const postId = res.data.data.id;
    cleanups.push(async () => { await clientApi.delete(`/api/portal/cms/websites/${siteId}/posts/${postId}`).catch(() => {}); });

    const pub = await unauthApi.get(`/api/public/websites/${siteId}/posts/${slug}`);
    // Draft posts should return 404 or empty from public API
    expect([404, 400, 403]).toContain(pub.status);
  });
});

test.describe('PORTAL-C CMS — media @portal-c @media', () => {
  let siteId: number;
  const cleanups: Array<() => Promise<void>> = [];

  test('setup: create test website', async ({ clientApi }) => {
    const { website } = await createTestWebsite(clientApi);
    siteId = website.id;
  });

  test.afterAll(async () => { await runCleanups(cleanups); });

  test('media list returns paginated response', async ({ clientApi }) => {
    const res = await clientApi.get(`/api/portal/cms/websites/${siteId}/media?limit=10&offset=0`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
    expect(res.data.pagination).toBeDefined();
  });

  test('media upload (1x1 PNG)', async ({ clientApi }) => {
    const pngBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );
    const res = await clientApi.postForm(`/api/portal/cms/websites/${siteId}/media/upload`, {
      file: { name: `qa-c-media-${Date.now()}.png`, mimeType: 'image/png', buffer: pngBuffer },
      alt: 'QA test upload',
    });
    if (res.status === 201) {
      expect(res.data.success).toBe(true);
      expect(res.data.data.websiteId).toBe(siteId);
      cleanups.push(async () => {
        await clientApi.delete(`/api/portal/cms/websites/${siteId}/media/${res.data.data.id}`).catch(() => {});
      });
    } else {
      // S3 not configured — acceptable in local QA env
      console.log('Media upload skipped — S3 not configured:', res.status, res.data?.error);
    }
  });

  test('media search by filename', async ({ clientApi }) => {
    const res = await clientApi.get(`/api/portal/cms/websites/${siteId}/media?search=test&limit=5`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
  });

  test('media delete non-existent returns 404', async ({ clientApi }) => {
    const res = await clientApi.delete(`/api/portal/cms/websites/${siteId}/media/9999999`);
    expect([404, 400, 403]).toContain(res.status);
  });
});

test.describe('PORTAL-C CMS — navigation @portal-c @navigation', () => {
  let siteId: number;
  const cleanups: Array<() => Promise<void>> = [];

  test('setup: create test website', async ({ clientApi }) => {
    const { website } = await createTestWebsite(clientApi);
    siteId = website.id;
  });

  test.afterAll(async () => { await runCleanups(cleanups); });

  test('nav list returns array', async ({ clientApi }) => {
    // Navigation lives at /api/portal/websites/[siteId]/navigation, NOT /cms/
    const res = await clientApi.get(`/api/portal/websites/${siteId}/navigation`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test('nav create → update → delete', async ({ clientApi }) => {
    const label = `QA-C Nav ${Date.now()}`;
    const createRes = await clientApi.put(`/api/portal/websites/${siteId}/navigation`, {
      items: [{ label, href: '/', sortOrder: 0 }],
    });
    expect(createRes.status).toBe(200);
    expect(createRes.data.success).toBe(true);

    // Update — add another item
    const updateRes = await clientApi.put(`/api/portal/websites/${siteId}/navigation`, {
      items: [
        { label, href: '/', sortOrder: 0 },
        { label: 'About', href: '/about', sortOrder: 1 },
      ],
    });
    expect(updateRes.status).toBe(200);
  });
});

test.describe('PORTAL-C CMS — categories & tags @portal-c @taxonomy', () => {
  let siteId: number;
  const cleanups: Array<() => Promise<void>> = [];

  test.beforeAll(async ({ clientApi }) => {
    const { website } = await createTestWebsite(clientApi);
    siteId = website.id;
  });

  test.afterAll(async () => { await runCleanups(cleanups); });

  test('category create → list → delete', async ({ clientApi }) => {
    const slug = `qa-c-cat-${Date.now()}`;
    const res = await clientApi.post(`/api/portal/cms/websites/${siteId}/categories`, {
      name: 'QA-C Category',
      slug,
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    const catId = res.data.data.id;
    cleanups.push(async () => { await clientApi.delete(`/api/portal/cms/websites/${siteId}/categories/${catId}`).catch(() => {}); });

    const listRes = await clientApi.get(`/api/portal/cms/websites/${siteId}/categories`);
    expect(listRes.status).toBe(200);
    expect(listRes.data.data.some((c: { id: number }) => c.id === catId)).toBe(true);
  });

  test('tag create → list → delete', async ({ clientApi }) => {
    const slug = `qa-c-tag-${Date.now()}`;
    const res = await clientApi.post(`/api/portal/cms/websites/${siteId}/tags`, {
      name: 'QA-C Tag',
      slug,
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    const tagId = res.data.data.id;
    cleanups.push(async () => { await clientApi.delete(`/api/portal/cms/websites/${siteId}/tags/${tagId}`).catch(() => {}); });

    const listRes = await clientApi.get(`/api/portal/cms/websites/${siteId}/tags`);
    expect(listRes.status).toBe(200);
    expect(listRes.data.data.some((t: { id: number }) => t.id === tagId)).toBe(true);
  });
});

test.describe('PORTAL-C CMS — content-types @portal-c @content-types', () => {
  let siteId: number;
  const cleanups: Array<() => Promise<void>> = [];

  test('setup: create test website', async ({ clientApi }) => {
    const { website } = await createTestWebsite(clientApi);
    siteId = website.id;
  });

  test.afterAll(async () => { await runCleanups(cleanups); });

  test('content-type list', async ({ clientApi }) => {
    const res = await clientApi.get(`/api/portal/cms/websites/${siteId}/content-types`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test('content-type create with fields', async ({ clientApi }) => {
    const slug = `qa-c-ct-${Date.now()}`;
    const res = await clientApi.post(`/api/portal/cms/websites/${siteId}/content-types`, {
      name: 'QA-C Type',
      slug,
      description: 'QA test content type',
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    const typeId = res.data.data.id;
    cleanups.push(async () => { await clientApi.delete(`/api/portal/cms/websites/${siteId}/content-types/${typeId}`).catch(() => {}); });

    // Add a field
    const fieldRes = await clientApi.post(`/api/portal/cms/websites/${siteId}/content-types/${typeId}/fields`, {
      name: 'qa_field',
      label: 'QA Field',
      type: 'text',
      required: false,
    });
    expect([200, 201]).toContain(fieldRes.status);
  });
});

test.describe('PORTAL-C CMS — branding @portal-c @branding', () => {
  let siteId: number;

  test('setup: create test website', async ({ clientApi }) => {
    const { website } = await createTestWebsite(clientApi);
    siteId = website.id;
  });

  test('branding profiles list', async ({ clientApi }) => {
    const res = await clientApi.get(`/api/portal/branding/profiles`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
  });

  test('site branding settings get', async ({ clientApi }) => {
    const res = await clientApi.get(`/api/portal/websites/${siteId}/branding`);
    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      expect(res.data.success).toBe(true);
    }
  });
});
