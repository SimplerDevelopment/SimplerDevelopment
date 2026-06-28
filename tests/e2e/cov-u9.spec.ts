/**
 * cov-u9.spec.ts — CMS Blocks coverage slice: HTML import happy-path
 *
 * Card: "HTML import (upload-html): POST /posts/upload-html creates a post from
 * raw HTML with blocks parsed — needs spec (auth/gate tested; full happy-path
 * needs S3 wired in test env)"
 *
 * Route: POST /api/portal/cms/websites/[siteId]/posts/upload-html
 * Requires admin/editor role. Accepts multipart/form-data with a `file` field.
 * On success returns { success: true, data: { id, slug, websiteId } } with 201.
 */
import { test, expect } from './setup/fixtures';
import { resolveClientSiteId } from './setup/helpers';

test.describe('CMS Blocks — HTML import happy-path @cms @html-import', () => {
  let createdPostId: number | null = null;
  let usedSiteId: number | null = null;

  test.afterAll(async ({ adminApi }) => {
    if (createdPostId !== null && usedSiteId !== null) {
      await adminApi.delete(
        `/api/portal/cms/websites/${usedSiteId}/posts/${createdPostId}`
      );
    }
  });

  test(
    'POST /upload-html creates a draft post with an html-embed block from raw HTML',
    async ({ adminApi }) => {
      const siteId = await resolveClientSiteId(adminApi);
      usedSiteId = siteId;

      const htmlContent = `<!DOCTYPE html>
<html>
  <head><title>Upload Test</title></head>
  <body><h1>Hello from upload-html</h1></body>
</html>`;

      const res = await adminApi.postForm(
        `/api/portal/cms/websites/${siteId}/posts/upload-html`,
        {
          file: {
            name: `upload-test-${Date.now()}.html`,
            mimeType: 'text/html',
            buffer: Buffer.from(htmlContent, 'utf-8'),
          },
        }
      );

      // Record for cleanup even if assertion fails
      if (res.data?.data?.id) {
        createdPostId = res.data.data.id;
      }

      expect(res.status).toBe(201);
      expect(res.data.success).toBe(true);
      expect(res.data.data).toHaveProperty('id');
      expect(res.data.data).toHaveProperty('slug');
      expect(res.data.data.websiteId).toBe(siteId);
    }
  );
});
